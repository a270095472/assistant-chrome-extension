import { normalizeNotesData, NOTE_PRIORITIES } from './model.js';

export const NOTES_V3_KEY = 'assistant.personalNotes.v3';
export const NOTES_BACKUP_KEY = 'assistant.personalNotes.restoreBackup.v1';
export const SLOT_PREFIX = 'assistant.n6.';
export const BRANCH_PREFIX = 'assistant.n6c.';
export const MANIFEST_PREFIX = 'assistant.n6m.';
export const SYNC_LIMITS = Object.freeze({ item: 8192, total: 102400, keys: 512, budget: 90 * 1024 });
const devicePattern = /^[a-f0-9]{16}$/;
const hashPattern = /^[a-f0-9]{32}$/;
const platformPattern = /^(?!(?:constructor|prototype)$)[a-z][a-zA-Z0-9_-]{0,63}$/;
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
export const json = (value) => JSON.stringify(canonical(value));
export const byteSize = (key, value) => new TextEncoder().encode(key).length + new TextEncoder().encode(json(value)).length;
export const totalBytes = (items) => Object.entries(items).reduce((n, [key, value]) => n + byteSize(key, value), 0);
export const isOwnedKey = (key) => key.startsWith(SLOT_PREFIX) || key.startsWith(BRANCH_PREFIX) || key.startsWith(MANIFEST_PREFIX);
export async function fingerprint(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json(value)))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const noteHash = async (id) => (await fingerprint(id)).slice(0, 32);
export const slotKey = (_device, hash) => SLOT_PREFIX + hash;
export const branchKey = (device, hash) => BRANCH_PREFIX + device + '.' + hash;
export const manifestKey = (device) => MANIFEST_PREFIX + device;
export const encodeNote = (note) => [note.title, note.content, [...note.platformIds], NOTE_PRIORITIES.indexOf(note.priority), note.showOnHome];
export const decodeNote = (record) => ({ noteId: record[1], title: record[5][0], content: record[5][1],
  platformIds: [...record[5][2]], priority: NOTE_PRIORITIES[record[5][3]], showOnHome: record[5][4] });

export function validRecord(r) {
  if (!Array.isArray(r) || r.length !== 7 || r[0] !== 1 || typeof r[1] !== 'string' || !r[1].trim() ||
    !r[2] || Array.isArray(r[2]) || typeof r[2] !== 'object' || !Object.keys(r[2]).length ||
    Object.entries(r[2]).some(([d, n]) => !devicePattern.test(d) || !Number.isSafeInteger(n) || n < 1) ||
    !Number.isSafeInteger(r[3]) || r[3] < 0 || !Number.isSafeInteger(r[4]) || r[4] < r[3] ||
    !devicePattern.test(r[6]) || !Object.hasOwn(r[2], r[6])) return false;
  const n = r[5];
  return n === null || n === 'blocked' || (Array.isArray(n) && n.length === 5 &&
    typeof n[0] === 'string' && Boolean(n[0].trim()) && typeof n[1] === 'string' &&
    Array.isArray(n[2]) && n[2].length > 0 && new Set(n[2]).size === n[2].length && n[2].every((id) => typeof id === 'string' && platformPattern.test(id)) &&
    [0, 1, 2].includes(n[3]) && typeof n[4] === 'boolean');
}
export function dominates(a, b) {
  return Object.keys(b).every((d) => (a[d] ?? 0) >= b[d]);
}
export function mergeClocks(records) {
  const clock = {};
  for (const r of records) for (const [d, n] of Object.entries(r[2])) clock[d] = Math.max(clock[d] ?? 0, n);
  return clock;
}
export function heads(records) {
  const unique = [...new Map(records.map((r) => [json(r), r])).values()];
  return unique.filter((r, i) => !unique.some((other, j) => i !== j && dominates(other[2], r[2]) &&
    (!dominates(r[2], other[2]) || r[5] === 'blocked' && Array.isArray(other[5]) && dominates(r[2], other[2]))));
}
export function rebuildNotes(data, notes) {
  const orders = structuredClone(data.orders);
  for (const note of notes) for (const id of note.platformIds) orders[id] ??= { high: [], medium: [], low: [] };
  for (const id of Object.keys(orders)) for (const priority of NOTE_PRIORITIES) {
    const eligible = notes.filter((n) => n.platformIds.includes(id) && n.priority === priority).map((n) => n.noteId);
    orders[id][priority] = [...orders[id][priority].filter((n) => eligible.includes(n)), ...eligible.filter((n) => !orders[id][priority].includes(n))];
  }
  return normalizeNotesData({ version: 2, notes, orders, draft: data.draft });
}

// A manifest is a completeness guard, not proof that another device received it.
export async function inspectRemote(items, { allowIncomplete = false } = {}) {
  const manifests = new Map(), slots = new Map();
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith(MANIFEST_PREFIX)) {
      const device = key.slice(MANIFEST_PREFIX.length);
      if (!devicePattern.test(device) || !Array.isArray(value) || value.length !== 2 || value[0] !== 1 || !Array.isArray(value[1]) ||
        value[1].some((row) => !Array.isArray(row) || row.length !== 2 || !hashPattern.test(row[0]) || !Number.isSafeInteger(row[1]) || row[1] < 1) ||
        new Set(value[1].map((r) => r[0])).size !== value[1].length) throw Error('同步資料格式或版本無效；本機資料保留。');
      manifests.set(device, value[1]);
    } else if (key.startsWith(SLOT_PREFIX) || key.startsWith(BRANCH_PREFIX)) {
      const branch = key.startsWith(BRANCH_PREFIX);
      const parts = key.slice(branch ? BRANCH_PREFIX.length : SLOT_PREFIX.length).split('.');
      const hash = branch ? parts[1] : parts[0];
      if ((branch ? parts.length !== 2 || !devicePattern.test(parts[0]) : parts.length !== 1) || !hashPattern.test(hash) || !validRecord(value) ||
        branch && value[6] !== parts[0] || await noteHash(value[1]) !== hash) throw Error('同步筆記格式或引用損壞；本機資料保留。');
      slots.set(key, value);
    }
    if (isOwnedKey(key) && byteSize(key, value) > SYNC_LIMITS.item) throw Error('同步項目超過單項容量；本機資料保留。');
  }
  const recordsByHash = new Map();
  for (const record of slots.values()) {
    const hash = await noteHash(record[1]);
    const list = recordsByHash.get(hash) ?? []; list.push(record); recordsByHash.set(hash, list);
    const writer = record[6];
    if (!allowIncomplete && !manifests.get(writer)?.some(([h, n]) => h === hash && n >= record[2][writer])) throw Error('同步資料仍在傳送，尚未完整；請稍後重新檢查。');
  }
  // A later causal version covers older device manifests; normal cross-device
  // edits reuse one body key. Concurrent missing branches remain incomplete.
  if (!allowIncomplete) for (const [device, entries] of manifests) for (const [hash, counter] of entries) {
    if (!recordsByHash.get(hash)?.some((r) => (r[2][device] ?? 0) >= counter)) throw Error('同步資料仍在傳送，尚未完整；請稍後重新檢查。');
  }
  const groups = new Map();
  for (const record of slots.values()) {
    const list = groups.get(record[1]) ?? []; list.push(record); groups.set(record[1], list);
  }
  return { groups: new Map([...groups].map(([id, list]) => [id, heads(list)])), token: await fingerprint(items), items };
}

// Recompute all projected data, including foreign keys and metadata. Oversize
// payloads become causal blockers; no local content is truncated or deleted.
export function planSync(envelope, existing) {
  const writes = {}, blocked = [];
  const rows = Object.entries(envelope.slots).sort(([a], [b]) => a.localeCompare(b));
  for (const [hash, record] of rows) {
    const current = existing[slotKey(envelope.device, hash)];
    if (validRecord(current) && current[1] !== record[1]) throw Error('同步筆記識別碼碰撞；本機資料保留。');
    if (validRecord(current) && dominates(current[2], record[2]) && !dominates(record[2], current[2])) continue;
    const key = validRecord(current) && !dominates(record[2], current[2])
      ? branchKey(envelope.device, hash) : slotKey(envelope.device, hash);
    const value = structuredClone(record);
    if (byteSize(key, value) > SYNC_LIMITS.item) { value[5] = 'blocked'; blocked.push(record[1]); }
    writes[key] = value;
  }
  writes[manifestKey(envelope.device)] = [1, rows.map(([hash, r]) => [hash, r[2][envelope.device]])];
  const all = { ...existing, ...writes };
  let bytes = totalBytes(all), ownedBytes = totalBytes(Object.fromEntries(Object.entries(all).filter(([key]) => isOwnedKey(key))));
  const tooBig = () => ownedBytes > SYNC_LIMITS.budget || bytes > SYNC_LIMITS.total;
  if (Object.keys(all).length > SYNC_LIMITS.keys || byteSize(manifestKey(envelope.device), writes[manifestKey(envelope.device)]) > SYNC_LIMITS.item) {
    throw Error('同步項目數或版本紀錄已達容量限制；本機資料保留。');
  }
  for (const [key, record] of Object.entries(writes).filter(([key, r]) => (key.startsWith(SLOT_PREFIX) || key.startsWith(BRANCH_PREFIX)) && Array.isArray(r[5]))
    .sort((a, b) => byteSize(b[0], b[1]) - byteSize(a[0], a[1]))) {
    if (!tooBig()) break;
    const previousSize = byteSize(key, record);
    record[5] = 'blocked'; blocked.push(record[1]);
    const delta = byteSize(key, record) - previousSize; bytes += delta; ownedBytes += delta;
  }
  if (Object.keys(all).length > SYNC_LIMITS.keys || tooBig() || Object.entries(writes).some(([key, value]) => byteSize(key, value) > SYNC_LIMITS.item)) {
    throw Error('同步總容量、項目數或單項額度不足；待同步筆記完整保留本機。');
  }
  return { writes, blocked, bytes, ownedBytes,
    keys: Object.keys(all).length, maxItem: Math.max(0, ...Object.entries(writes).map(([k, v]) => byteSize(k, v))) };
}
