import { NOTES_V3_KEY, NOTES_BACKUP_KEY, isOwnedKey } from '../features/notes/sync-model.js';
import { BACKUP_FILE_BYTES } from '../features/notes/backup.js';
import { getKnownPlatform } from '../features/platforms/catalog.js';

export function createNoteSyncView({ document, client, notes, storageEvents, download = (backup) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'Assistant-notes-restore-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
} }) {
  const ids = ['status', 'check', 'retry', 'preview', 'download', 'undo', 'import', 'file', 'backup-note', 'dialog', 'title', 'summary', 'changes', 'cancel', 'copies', 'apply'];
  const e = Object.fromEntries(ids.map((id) => [id, document.getElementById('notes-sync-' + id)]));
  let disposed = false, busy = false, ticket = null, generation = 0, trigger = null;
  const removers = [];
  const status = (message, error = false) => { if (!disposed) { e.status.textContent = message; e.status.setAttribute('role', error ? 'alert' : 'status'); } };
  const text = (tag, value) => { const n = document.createElement(tag); n.textContent = value; return n; };
  const listen = (key, event, fn) => { e[key].addEventListener(event, fn); removers.push(() => e[key].removeEventListener(event, fn)); };
  async function run(task) {
    if (busy || disposed) return;
    busy = true;
    try { await task(); } catch (error) { status(error.message, true); }
    finally { busy = false; }
  }
  async function check(reload = false) {
    const request = ++generation;
    const state = await client.check();
    const backup = await client.backup?.();
    if (disposed || request !== generation) return;
    e.download.disabled = e.undo.disabled = !backup?.backup;
    e['backup-note'].textContent = backup?.backup ? '下載會儲存目前保留的恢復前快照；還原會先預覽。從備份檔還原可選其他已下載快照。'
      : '尚無恢復前備份；確認恢復時會先建立。已有下載檔可使用「從備份檔還原…」。';
    status([state.status.message, state.remoteError,
      state.pending ? `本次批次 ${state.status.affected} 筆等待同步確認。` : '',
      state.remoteChanges ? `有 ${state.remoteChanges} 筆同步變更待預覽（其中 ${state.conflicts} 筆版本不同）。` : '',
      state.remoteBlocked ? `同步區有 ${state.remoteBlocked} 筆正文未完整同步，無法完整恢復。` : ''].filter(Boolean).join(' '),
    Boolean(state.remoteError || state.remoteBlocked || state.status.affected && ['blocked', 'failed'].includes(state.status.kind)));
    if (reload) await notes.refresh();
  }
  listen('check', 'click', () => run(() => check(true)));
  listen('retry', 'click', () => run(async () => { await client.retry(); await check(); }));
  listen('download', 'click', () => run(async () => {
    const result = await client.backup();
    if (!result.backup) throw Error('尚無恢復前備份；正式筆記仍在本機。');
    download(result.backup); status('已提供恢復前備份下載；請妥善保管個人筆記。');
  }));
  function close() { ticket = null; if (e.dialog.open) e.dialog.close(); if (!disposed) trigger?.focus(); }
  function open(from) { trigger = from; e.dialog.showModal(); e.title.focus({ preventScroll: true }); e.dialog.scrollTop = 0; }
  function renderChanges(changes, fromFile = false) {
    const ordinary = changes.filter(c => c.action !== 'conflict'), conflicts = changes.filter(c => c.action === 'conflict');
    e.changes.replaceChildren(...[[ordinary, '一般同步修改', false], [conflicts, '！版本不同', true]].map(([rows, label, warning]) => {
      const group = text('section', ''); group.className = warning ? 'notes-sync-group notes-sync-conflicts' : 'notes-sync-group';
      group.append(text('h4', `${fromFile && !warning ? '一般備份差異' : label}（${rows.length} 筆）`));
      if (!rows.length) group.append(text('p', '目前沒有此類差異。'));
      for (const change of rows) {
        const card = text('section', ''); card.className = 'notes-sync-change';
        card.append(text('h5', ({ add: fromFile ? '備份新增' : '同步新增', delete: fromFile ? '備份未包含（取代時移除，另存時保留）' : '同步刪除', update: '同步修改', conflict: '版本不同' })[change.action]));
        if (change.id) card.append(text('p', `筆記 ID：${change.id}`));
        const body = (note, label) => {
          card.append(text('p', note ? `${label}：${note.title}\n${note.content}` : `${label}：沒有筆記正文（刪除或未包含）。`));
          if (note?.platformIds) card.append(text('p', `平台：${note.platformIds.map(id => getKnownPlatform(id)?.name ?? id).join('、')}；優先級：${({ high: '高', medium: '中', low: '低' })[note.priority] ?? note.priority}；首頁顯示：${note.showOnHome ? '是' : '否'}`));
        };
        body(change.local, '本機');
        change.versions.forEach((note, i) => body(note, fromFile ? `備份版本 ${i + 1}` : `可取得版本 ${i + 1}`));
        group.append(card);
      }
      return group;
    }));
    return conflicts.length;
  }
  listen('cancel', 'click', () => { if (!e.cancel.disabled) close(); });
  listen('dialog', 'cancel', (event) => { event.preventDefault(); if (!e.cancel.disabled) close(); });
  listen('preview', 'click', () => run(async () => {
    const p = await client.preview();
    if (disposed) return;
    p.draft = p.draft || Boolean(notes.getSnapshot?.().data.draft);
    ticket = { type: 'remote', preview: p };
    e.title.textContent = '同步恢復預覽';
    const conflicts = renderChanges(p.changes);
    e.summary.textContent = `${p.changes.length} 筆變更、${conflicts} 筆版本不同、${p.blocked} 筆未完整同步。` +
      (p.draft ? '請先完成或放棄草稿；本次不可恢復。' : '確認套用前會保存完整本機備份；「另存」保留本機筆記，將不同同步正文另存新筆記。');
    e.copies.hidden = false;
    e.copies.textContent = '保留本機並另存同步版本';
    e.copies.disabled = Boolean(p.draft || p.blocked || !p.changes.length);
    e.apply.textContent = '確認套用同步變更（先備份）';
    e.apply.disabled = Boolean(p.draft || p.blocked || p.conflicts || !p.changes.length);
    open(e.preview);
  }));
  listen('undo', 'click', () => run(async () => {
    const p = await client.backup();
    if (!p.backup) throw Error('尚無可還原的恢復前備份。');
    ticket = { type: 'backup', preview: p };
    e.title.textContent = '還原恢復前本機備份';
    e.summary.textContent = `將以備份的 ${p.backup.envelope.data.notes.length} 筆筆記取代目前本機筆記。操作前會再備份目前內容；筆記草稿未完成時不可還原。`;
    e.changes.replaceChildren(...p.backup.envelope.data.notes.map((n) => text('p', `${n.title}\n${n.content}`)));
    e.copies.hidden = true; e.apply.textContent = '確認還原本機備份'; e.apply.disabled = Boolean(notes.getSnapshot?.().data.draft);
    open(e.undo);
  }));
  listen('import', 'click', () => { if (!busy) e.file.click(); });
  listen('file', 'change', () => run(async () => {
    const file = e.file.files?.[0]; e.file.value = '';
    if (!file) return;
    trigger = e.import;
    close();
    if (file.size > BACKUP_FILE_BYTES) throw Error('備份檔超過 32 MiB；未讀取，原資料保留。');
    const content = await file.text(), p = await client.previewFile(content);
    if (disposed) return;
    p.draft = p.draft || Boolean(notes.getSnapshot?.().data.draft);
    ticket = { type: 'file', preview: p, text: content };
    e.title.textContent = '從備份檔還原預覽';
    renderChanges(p.changes, true);
    e.summary.textContent = `本機 ${p.localCount} 筆、備份 ${p.count} 筆、${p.changes.length} 筆內容差異。` +
      (p.orderChanged ? '取代時會採用備份排序；另存時保留本機排序。' : '') +
      (p.legacyCount ? `${p.legacyCount} 筆舊超限內容完整保留，日後編輯須符合 10／100 字。` : '') +
      `含安全備份預估本機容量：取代 ${p.capacities.remote.bytes}／另存 ${p.capacities.copies.bytes} bytes，上限 ${p.capacities.remote.limit}。` +
      (p.draft ? '請先完成或放棄目前草稿；本次不可還原。' : '確認後先備份目前資料、還原並讀回，確認的筆記變更才排入同步；取消不改資料。');
    if (p.backupDraft) e.changes.append(text('p', `備份草稿（只存本機）：${p.backupDraft.title}\n${p.backupDraft.content}`));
    e.copies.hidden = false; e.copies.textContent = '保留本機並另存備份版本';
    e.copies.disabled = Boolean(p.draft || !p.capacities.copies.ok);
    e.apply.textContent = '確認以備份取代本機（先備份）';
    e.apply.disabled = Boolean(p.draft || !p.capacities.remote.ok);
    if (!p.capacities.remote.ok || !p.capacities.copies.ok) e.summary.textContent += '部分方式超過本機容量，已停用；原資料保留。';
    open(e.import);
  }));
  async function commit(mode) {
    if (!ticket) return;
    const current = ticket; ticket = null;
    e.cancel.disabled = true;
    e.apply.disabled = true; e.copies.disabled = true;
    try {
      if (notes.getSnapshot?.().data.draft) throw Error('請先完成或放棄草稿，再進行恢復；目前編輯內容保留。');
      if (current.type === 'file') await client.restoreFile(current.preview, current.text, mode);
      else if (current.type === 'backup') await client.undo(current.preview);
      else await client.apply(current.preview, mode);
      close(); await notes.refresh(); await check();
    } catch (error) { close(); throw error; }
    finally { e.cancel.disabled = false; }
  }
  listen('copies', 'click', () => run(() => commit('copies')));
  listen('apply', 'click', () => run(() => commit('remote')));
  const changed = (changes, area) => {
    if (area === 'local' && [NOTES_V3_KEY, NOTES_BACKUP_KEY].some(key => Object.hasOwn(changes, key)) || area === 'sync' && Object.keys(changes).some(isOwnedKey)) {
      void check().catch((error) => status(error.message, true));
    }
  };
  storageEvents.addListener(changed);
  return { start: () => check().catch((error) => status(error.message, true)),
    dispose() { disposed = true; generation++; removers.forEach((f) => f()); storageEvents.removeListener(changed); close(); } };
}
