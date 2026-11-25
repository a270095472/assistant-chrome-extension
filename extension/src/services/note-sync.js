import { normalizeNotesData, assertNoteLimits } from '../features/notes/model.js';
import { createPersonalNotesRepository } from './personal-notes.js';
import { validateNotesBackup, backupDifferences } from '../features/notes/backup.js';
import { NOTES_V3_KEY, NOTES_BACKUP_KEY, MANIFEST_PREFIX, BRANCH_PREFIX, noteHash, json, fingerprint,
  encodeNote, decodeNote, validRecord, dominates, mergeClocks, heads, rebuildNotes, inspectRemote, planSync, slotKey, branchKey, SYNC_LIMITS, totalBytes } from '../features/notes/sync-model.js';

const LOCK = 'assistant.personalNotes';
const safe = (value) => structuredClone(value);
const ownRecord = (env, id) => Object.hasOwn(env.records, id) ? env.records[id] : undefined;
export function createNoteSyncService({ local, sync, locks, now = Date.now,
  createId = () => crypto.randomUUID(), schedule = () => {} }) {
  const legacy = createPersonalNotesRepository(local);
  const locked = (task) => {
    if (!locks?.request) return Promise.reject(Error('無法取得筆記儲存鎖；資料未變更。'));
    return locks.request(LOCK, { mode: 'exclusive' }, task);
  };
  const revision = () => createId();
  async function persist(env) {
    await local.set({ [NOTES_V3_KEY]: env });
    const actual = (await local.get(NOTES_V3_KEY))[NOTES_V3_KEY];
    if (json(actual) !== json(env)) throw Error('本機筆記讀回未確認；請重新載入，勿重複操作。');
  }
  async function changedRecord(env, id, note, previous = ownRecord(env, id), ancestors = []) {
    const clock = mergeClocks([...(previous ? [previous] : []), ...ancestors]);
    if ((clock[env.device] ?? 0) >= Number.MAX_SAFE_INTEGER) throw Error('筆記版本計數超出安全範圍；原資料保留。');
    clock[env.device] = (clock[env.device] ?? 0) + 1;
    const r = [1, id, clock, previous?.[3] ?? now(), Math.max(previous?.[4] ?? 0, now()), note ? encodeNote(note) : null, env.device];
    const hash = await noteHash(id);
    if (env.slots[hash] && env.slots[hash][1] !== id) throw Error('筆記識別碼碰撞；本機原資料保留。');
    env.records = { ...env.records, [id]: r }; env.slots[hash] = r; env.pending = true;
    return r;
  }
  async function load() {
    const stored = (await local.get(NOTES_V3_KEY))[NOTES_V3_KEY];
    if (stored !== undefined) {
      if (!stored || stored.version !== 3 || typeof stored.revision !== 'string' || !stored.revision.trim() || !/^[a-f0-9]{16}$/.test(stored.device) ||
        typeof stored.pending !== 'boolean' || !Number.isFinite(stored.lastAttempt) || stored.lastAttempt < 0 || !stored.records || !stored.slots ||
        typeof stored.records !== 'object' || Array.isArray(stored.records) || typeof stored.slots !== 'object' || Array.isArray(stored.slots) ||
        !stored.status || typeof stored.status !== 'object') throw Error('本機筆記格式或版本無效；不回退、不覆寫原資料。');
      normalizeNotesData(stored.data);
      for (const [id, r] of Object.entries(stored.records)) {
        if (!validRecord(r) || r[1] !== id || r[5] === 'blocked') throw Error('本機筆記版本紀錄損壞；原資料保留。');
        const note = stored.data.notes.find((n) => n.noteId === id);
        if (r[5] === null ? Boolean(note) : !note || json(encodeNote(note)) !== json(r[5])) throw Error('本機筆記與版本紀錄不一致；原資料保留。');
      }
      if (stored.data.notes.some((n) => !Object.hasOwn(stored.records, n.noteId))) throw Error('本機筆記缺少版本紀錄；原資料保留。');
      for (const [hash, r] of Object.entries(stored.slots)) if (!validRecord(r) || !r[2][stored.device] || await noteHash(r[1]) !== hash ||
        !Object.hasOwn(stored.records, r[1]) || !dominates(stored.records[r[1]][2], r[2])) throw Error('本機待同步紀錄損壞；原資料保留。');
      return safe(stored);
    }
    const data = await legacy.load(); // corrupt/unknown legacy blocks migration
    const env = { version: 3, revision: revision(), device: createId().replaceAll('-', '').slice(0, 16), data,
      records: {}, slots: {}, pending: false, lastAttempt: 0, status: { kind: 'local', affected: 0, message: '本機已儲存。' } };
    for (const note of data.notes) await changedRecord(env, note.noteId, note);
    if (env.pending) env.status = { kind: 'pending', affected: data.notes.length, message: '本機已儲存；等待寫入同步區。' };
    await persist(env); // old v1/v2 keys remain intact
    return env;
  }
  async function remote() {
    if (!sync) throw Error('無法使用 Chrome 同步區；本機筆記仍可使用。');
    return inspectRemote(await sync.get(null));
  }
  function differences(env, view) {
    const changes = [], blocked = [], conflicts = [];
    for (const [id, rows] of view.groups) {
      const current = ownRecord(env, id);
      const candidates = current ? heads([current, ...rows]) : rows;
      if (candidates.some((r) => r[5] === 'blocked')) { blocked.push(id); continue; }
      if (candidates.length > 1) { conflicts.push(id); changes.push({ id, action: 'conflict', rows: candidates }); continue; }
      const record = candidates[0];
      if (current && json(record) === json(current)) continue;
      // Same vector but differing payload is corruption or a cloned-device ID.
      if (current && dominates(current[2], record[2]) && dominates(record[2], current[2]) && json(record) !== json(current)) {
        conflicts.push(id); changes.push({ id, action: 'conflict', rows: candidates }); continue;
      }
      changes.push({ id, action: record[5] === null ? 'delete' : current?.[5] ? 'update' : 'add', rows: [record] });
    }
    return { changes, blocked, conflicts };
  }
  const response = (env, extra = {}) => ({ ok: true, data: safe(env.data), revision: env.revision, status: safe(env.status), pending: env.pending, ...extra });
  async function readInternal() {
    const env = await load();
    let original = safe(env);
    let info;
    try {
      if (!sync) throw Error('無法使用 Chrome 同步區；本機筆記仍可使用。');
      const items = await sync.get(null);
      const ownManifest = items[MANIFEST_PREFIX + env.device];
      const ownStale = Object.keys(env.slots).length > 0 && (!Array.isArray(ownManifest) || !Array.isArray(ownManifest[1]) || Object.entries(env.slots).some(([hash, r]) => {
        const candidates = [items[slotKey(env.device, hash)], ...Object.entries(items).filter(([key]) => key.startsWith(BRANCH_PREFIX) && key.endsWith('.' + hash)).map(([, value]) => value)];
        return !candidates.some((actual) => validRecord(actual) && actual[1] === r[1] && (actual[2][env.device] ?? 0) >= r[2][env.device]) ||
          !ownManifest[1].some((entry) => Array.isArray(entry) && entry[0] === hash && entry[1] >= r[2][env.device]);
      }));
      if (ownStale && !env.pending) {
        env.pending = true; env.status = { kind: 'pending', affected: Object.keys(env.slots).length, message: '同步區紀錄尚未完整或版本較舊；本機保留，等待重新寫入。' };
        await persist(env); schedule(); original = safe(env);
      }
      const view = await inspectRemote(items);
      // Repair replayed older snapshots using causal knowledge, never interpreting
      // absent remote entries as deletes. Recovered tombstones remain effective.
      let repaired = false;
      for (const [id, r] of Object.entries(env.records)) {
        const rows = view.groups.get(id) ?? [];
        if (rows.length && rows.every((other) => dominates(r[2], other[2])) && rows.some((other) => !dominates(other[2], r[2]))) {
          const existing = env.slots[await noteHash(id)];
          if (!existing || !dominates(existing[2], r[2])) {
            await changedRecord(env, id, r[5] === null ? null : decodeNote(r), r);
            repaired = true;
          }
        }
      }
      if (repaired) { env.status = { kind: 'pending', affected: Object.keys(env.slots).length, message: '收到較舊同步版本；本機保留，等待重新寫入較新紀錄。' }; await persist(env); schedule(); original = safe(env); }
      info = differences(env, view);
      // No existing records (including tombstones), no notes and no draft only.
      if (!Object.keys(env.records).length && !env.data.notes.length && !env.data.draft && view.groups.size && !info.blocked.length && !info.conflicts.length) {
        env.records = Object.fromEntries([...view.groups].map(([id, records]) => [id, safe(records[0])]));
        env.data = rebuildNotes(env.data, [...view.groups.values()].map((rs) => rs[0]).filter((r) => r[5] !== null).map(decodeNote));
        env.revision = revision();
        env.status = { kind: 'restored', affected: 0, message: `已從目前可取得的同步資料恢復 ${env.data.notes.length} 筆，並讀回確認。` };
        await persist(env); info = differences(env, view);
      }
    } catch (error) { return response(original, { remoteError: error.message }); }
    return response(env, { remoteChanges: info.changes.length, conflicts: info.conflicts.length, remoteBlocked: info.blocked.length });
  }
  async function stageFileRestore(original, backup, mode) {
    const env = safe(original), incoming = backup.data;
    if (mode === 'remote') env.data = safe(incoming);
    else {
      const notes = new Map(env.data.notes.map(n => [n.noteId, n])), mapped = new Map();
      for (const source of incoming.notes) {
        const note = safe(source), previous = notes.get(note.noteId);
        if (previous && json(previous) === json(note)) { mapped.set(note.noteId, note.noteId); continue; }
        if (Object.hasOwn(env.records, note.noteId) || notes.has(note.noteId)) {
          note.noteId = createId();
          if (notes.has(note.noteId) || Object.hasOwn(env.records, note.noteId) || incoming.notes.some(n => n.noteId === note.noteId)) throw Error('另存筆記 ID 重複；未還原。');
        }
        mapped.set(source.noteId, note.noteId); notes.set(note.noteId, note);
      }
      env.data = rebuildNotes(env.data, [...notes.values()]);
      env.data.draft = incoming.draft ? { ...safe(incoming.draft), noteId: incoming.draft.noteId === null ? null : mapped.get(incoming.draft.noteId) } : null;
      env.data = normalizeNotesData(env.data);
    }
    // Trust only the CURRENT device's causal state, never file clocks/device/slots.
    const selected = new Map(env.data.notes.map(n => [n.noteId, n]));
    for (const id of new Set([...original.data.notes.map(n => n.noteId), ...selected.keys()])) {
      const old = original.data.notes.find(n => n.noteId === id), next = selected.get(id);
      if (json(old ?? null) !== json(next ?? null)) await changedRecord(env, id, next ?? null);
    }
    env.revision = revision();
    env.status = { kind: env.pending ? 'pending' : 'local', affected: env.pending ? Object.keys(env.slots).length : 0,
      message: '備份檔已還原並讀回確認；確認的筆記變更將排入同步，其他裝置是否收到仍須核對。' };
    return env;
  }
  async function fileCapacity(original, staged) {
    const all = await local.get(null);
    const projected = { ...all, [NOTES_V3_KEY]: staged, [NOTES_BACKUP_KEY]: { version: 1, savedAt: now(), envelope: original } };
    const bytes = totalBytes(Object.fromEntries(Object.entries(projected).filter(([, value]) => value !== undefined)));
    const limit = Number.isFinite(local.QUOTA_BYTES) ? local.QUOTA_BYTES : 10 * 1024 * 1024;
    return { bytes, limit, ok: bytes <= limit };
  }
  return {
    read: () => locked(readInternal),
    save: (request) => locked(async () => {
      const env = await load();
      if (request?.revision !== env.revision) throw Error('筆記已被其他視窗或恢復操作更新；本次未覆寫，請重新載入。');
      const data = normalizeNotesData(request.data);
      // This endpoint only accepts exact model snapshots. New/edited notes
      // must have passed UI/model limits; validate here too across RPC.
      for (const note of data.notes) {
        const previous = env.data.notes.find((n) => n.noteId === note.noteId);
        if (!previous || json(note) !== json(previous)) {
          assertNoteLimits(note); await changedRecord(env, note.noteId, note);
        }
      }
      for (const old of env.data.notes) if (!data.notes.some((n) => n.noteId === old.noteId)) await changedRecord(env, old.noteId, null);
      env.data = data; env.revision = revision();
      if (env.pending) env.status = { kind: 'pending', affected: Object.keys(env.slots).length, message: '本機已儲存；等待寫入同步區。' };
      await persist(env);
      if (env.pending) schedule();
      return response(env);
    }),
    flush: () => locked(async () => {
      const env = await load();
      if (!env.pending && env.status.kind !== 'blocked') return response(env);
      if (env.lastAttempt && now() - env.lastAttempt < 3000) { schedule(3000 - (now() - env.lastAttempt)); return response(env); }
      env.lastAttempt = now();
      // Persist attempt time before API call: worker restarts cannot bypass rate limits.
      await persist(env);
      let plan;
      try {
        if (!sync) throw Error('Chrome 同步區不可用。');
        const existing = await sync.get(null);
        // Validate every existing structure first, then require the projected
        // complete state to cover all device manifests. Concurrent overwrites
        // cannot masquerade as a complete remote snapshot.
        await inspectRemote(existing, { allowIncomplete: true });
        plan = planSync(env, existing);
        await inspectRemote({ ...existing, ...plan.writes });
        for (const [hash, r] of Object.entries(env.slots)) {
          for (const old of [existing[slotKey(env.device, hash)], existing[branchKey(env.device, hash)]]) {
            if (validRecord(old) && (old[2][env.device] ?? 0) > r[2][env.device]) throw Error('同裝置同步版本較新，停止送出以保護資料；請先預覽恢復。');
            if (validRecord(old) && old[6] === env.device && old[2][env.device] === r[2][env.device] && Array.isArray(old[5]) && Array.isArray(r[5]) && json(old) !== json(r)) throw Error('同裝置識別碼出現不同內容，停止送出；本機保留，請先預覽恢復。');
          }
        }
        await sync.set(plan.writes);
        const verified = await sync.get(null);
        if (Object.entries(plan.writes).some(([key, value]) => json(verified[key]) !== json(value))) throw Error('同步區寫入後讀回不一致，尚未確認。');
        const apiBytes = sync.getBytesInUse ? await sync.getBytesInUse(null) : null;
        if (apiBytes !== null && (!Number.isFinite(apiBytes) || apiBytes < 0 || apiBytes > SYNC_LIMITS.total)) throw Error('Chrome 回報的同步區容量未符合限制，尚未確認。');
        env.pending = false;
        env.status = { kind: plan.blocked.length ? 'blocked' : 'written', affected: plan.blocked.length,
          message: plan.blocked.length ? `${plan.blocked.length} 筆超過同步容量，未同步正文；本機完整保留。`
            : '同步區寫入成功；尚未確認其他裝置已收到。', lastWriteAt: now(),
          bytes: plan.bytes, apiBytes, ownedBytes: plan.ownedBytes, keys: plan.keys, maxItem: plan.maxItem };
      } catch (error) {
        env.pending = true;
        env.status = { kind: 'failed', affected: Object.keys(env.slots).length,
          message: `本次 ${Object.keys(env.slots).length} 筆未確認同步：${error.message} 本機筆記保留，可安全重試。` };
      }
      await persist(env); return response(env);
    }),
    preview: () => locked(async () => {
      const env = await load(), view = await remote(), info = differences(env, view);
      return { ok: true, revision: env.revision, token: view.token, blocked: info.blocked.length, conflicts: info.conflicts.length,
        draft: Boolean(env.data.draft), changes: info.changes.map((c) => ({ id: c.id, action: c.action,
          local: env.data.notes.find((n) => n.noteId === c.id) ?? null,
          versions: c.rows.map((r) => r[5] === null ? null : decodeNote(r)) })) };
    }),
    apply: (request) => locked(async () => {
      const env = await load(), view = await remote(), info = differences(env, view);
      if (request?.confirmed !== true || !['remote', 'copies'].includes(request.mode)) throw Error('恢復需要明確確認與選擇。');
      if (env.data.draft) throw Error('請先完成或放棄筆記草稿，再進行恢復；草稿保留。');
      if (request.revision !== env.revision || request.token !== view.token) throw Error('本機或同步內容已改變；請重新預覽，資料未覆寫。');
      if (info.blocked.length) throw Error(`同步區有 ${info.blocked.length} 筆正文未完整同步；停止恢復以保護現有資料。`);
      if (request.mode === 'remote' && info.conflicts.length) throw Error('有多個並行版本；請選擇另存版本以保留所有內容。');
      // The backup must exist and match BEFORE any destructive state change.
      const backup = { version: 1, savedAt: now(), envelope: safe(env) };
      await local.set({ [NOTES_BACKUP_KEY]: backup });
      if (json((await local.get(NOTES_BACKUP_KEY))[NOTES_BACKUP_KEY]) !== json(backup)) throw Error('恢復前備份未確認，停止操作。');
      const notes = new Map(env.data.notes.map((n) => [n.noteId, n]));
      for (const change of info.changes) {
        const rows = view.groups.get(change.id);
        if (request.mode === 'remote') {
          const selected = rows[0];
          if (selected[5] === null) notes.delete(change.id); else notes.set(change.id, decodeNote(selected));
          await changedRecord(env, change.id, notes.get(change.id) ?? null, ownRecord(env, change.id), rows);
        } else {
          const current = ownRecord(env, change.id);
          for (const r of rows) {
            if (r[5] === null || (current && json(r[5]) === json(current[5]))) continue;
            const note = decodeNote(r);
            if (!current && !notes.has(change.id) && rows.length === 1) {
              notes.set(change.id, note);
              await changedRecord(env, change.id, note, undefined, rows);
            } else {
              note.noteId = createId();
              if (notes.has(note.noteId) || Object.hasOwn(env.records, note.noteId)) throw Error('新筆記 ID 重複；恢復停止，備份保留。');
              notes.set(note.noteId, note); await changedRecord(env, note.noteId, note, undefined);
            }
          }
          // Resolve the original only after keeping every remote body as a copy.
          await changedRecord(env, change.id, notes.get(change.id) ?? null, ownRecord(env, change.id), rows);
        }
      }
      env.data = rebuildNotes(env.data, [...notes.values()]); env.revision = revision();
      env.status = { kind: 'pending', affected: Object.keys(env.slots).length,
        message: '恢復已完成並讀回確認；原本機資料已備份，等待寫入同步區。' };
      await persist(env); if (env.pending) schedule(); return response(env);
    }),
    backup: () => locked(async () => {
      const env = await load(), backup = (await local.get(NOTES_BACKUP_KEY))[NOTES_BACKUP_KEY] ?? null;
      return { ok: true, backup, revision: env.revision, token: await fingerprint(backup) };
    }),
    previewFile: (request) => locked(async () => {
      const backup = await validateNotesBackup(request?.text), env = await load();
      const changes = backupDifferences(env.data, backup.data), capacities = {};
      for (const mode of ['remote', 'copies']) capacities[mode] = await fileCapacity(env, await stageFileRestore(env, backup, mode));
      return { ok: true, revision: env.revision, token: await fingerprint(request.text), changes,
        count: backup.data.notes.length, localCount: env.data.notes.length, legacyCount: backup.legacyCount,
        draft: Boolean(env.data.draft), backupDraft: backup.data.draft, capacities,
        orderChanged: json(env.data.orders) !== json(backup.data.orders) };
    }),
    restoreFile: (request) => locked(async () => {
      if (request?.confirmed !== true || !['remote', 'copies'].includes(request.mode)) throw Error('從檔案還原需要明確確認與選擇。');
      const backup = await validateNotesBackup(request.text), original = await load();
      if (original.data.draft) throw Error('請先完成或放棄目前草稿，再從檔案還原；草稿保留。');
      if (original.revision !== request.revision || await fingerprint(request.text) !== request.token) throw Error('本機或備份檔已改變；請重新預覽，未覆寫。');
      const env = await stageFileRestore(original, backup, request.mode);
      if (!(await fileCapacity(original, env)).ok) throw Error('含安全備份的本機容量不足；所有原資料保留，未還原。');
      const safety = { version: 1, savedAt: now(), envelope: safe(original) };
      await local.set({ [NOTES_BACKUP_KEY]: safety });
      if (json((await local.get(NOTES_BACKUP_KEY))[NOTES_BACKUP_KEY]) !== json(safety)) throw Error('安全備份未讀回確認；未還原。');
      try { await persist(env); }
      catch (error) {
        try { await persist(original); }
        catch { throw Error('還原讀回與回復尚未確認；安全備份仍保留，請停止操作並檢查本機資料。'); }
        throw Error(`還原未完成，原本機資料已回復；安全備份保留。${error.message}`);
      }
      if (env.pending) schedule();
      return response(env);
    }),
    undo: (request) => locked(async () => {
      const env = await load(), backup = (await local.get(NOTES_BACKUP_KEY))[NOTES_BACKUP_KEY];
      if (request?.confirmed !== true || env.revision !== request.revision || await fingerprint(backup ?? null) !== request.token) throw Error('備份確認已過期；請重新預覽。');
      if (env.data.draft) throw Error('請先完成或放棄草稿，再還原備份。');
      if (backup?.version !== 1 || backup.envelope?.version !== 3) throw Error('沒有可用的本機恢復前備份。');
      const restored = normalizeNotesData(backup.envelope.data);
      if (!backup.envelope.records || typeof backup.envelope.records !== 'object' || Array.isArray(backup.envelope.records) || restored.notes.some((n) => !Object.hasOwn(backup.envelope.records, n.noteId) ||
        !validRecord(backup.envelope.records[n.noteId]) || json(backup.envelope.records[n.noteId][5]) !== json(encodeNote(n)))) throw Error('備份內容無法驗證；現有筆記保留。');
      const safety = { version: 1, savedAt: now(), envelope: safe(env) };
      await local.set({ [NOTES_BACKUP_KEY]: safety });
      if (json((await local.get(NOTES_BACKUP_KEY))[NOTES_BACKUP_KEY]) !== json(safety)) throw Error('還原前保護備份失敗，現有筆記保留。');
      const notes = new Map(restored.notes.map((n) => [n.noteId, n]));
      for (const id of new Set([...Object.keys(env.records), ...notes.keys()])) {
        const previous = ownRecord(env, id), old = backup.envelope.records[id];
        await changedRecord(env, id, notes.get(id) ?? null, previous, old && validRecord(old) ? [old] : []);
      }
      env.data = restored; env.revision = revision();
      env.status = { kind: 'pending', affected: Object.keys(env.slots).length, message: '本機備份已還原並讀回確認；等待寫入同步區。' };
      await persist(env); schedule(); return response(env);
    }),
  };
}

export function bindNoteSyncMessages(runtime, service) {
  const listener = (message, sender, respond) => {
    if (message?.channel !== 'assistant-notes') return;
    if (sender.id !== runtime.id || sender.url !== runtime.getURL('src/panel/index.html')) { respond({ ok: false, error: '不允許的筆記存取。' }); return; }
    const actions = { read: () => service.read(), save: () => service.save(message.request), flush: () => service.flush(),
      preview: () => service.preview(), apply: () => service.apply(message.request), backup: () => service.backup(), undo: () => service.undo(message.request),
      previewFile: () => service.previewFile(message.request), restoreFile: () => service.restoreFile(message.request) };
    const task = Object.hasOwn(actions, message.action) ? actions[message.action]() : Promise.reject(Error('不支援的筆記操作。'));
    void task.then(respond, (error) => respond({ ok: false, error: error.message })); return true;
  };
  runtime.onMessage.addListener(listener); return () => runtime.onMessage.removeListener(listener);
}
