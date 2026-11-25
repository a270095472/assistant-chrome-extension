import { normalizeNotesData, NOTE_PRIORITIES, countNoteCharacters, NOTE_LIMITS } from './model.js';
import { validRecord, encodeNote, noteHash, dominates, json } from './sync-model.js';

// Bounds parsing/RPC work without imposing a note-count limit. No new file format.
export const BACKUP_FILE_BYTES = 32 * 1024 * 1024;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function fields(value, allowed, required = allowed) {
  if (!object(value) || Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value, k))) {
    throw Error('備份必要欄位缺漏或含未知欄位；原資料保留。');
  }
}
export async function validateNotesBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > BACKUP_FILE_BYTES) throw Error('備份檔超過 32 MiB 或內容無效；原資料保留。');
  let backup;
  try { backup = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw Error('備份 JSON 語法無效；原資料保留。'); }
  if (backup?.version !== 1 || backup?.envelope?.version !== 3) throw Error('不是支援的 Assistant 筆記備份（備份 v1／本機 v3）；不支援或未辨識版本不會覆寫原資料。');
  fields(backup, ['version', 'savedAt', 'envelope']);
  const env = backup.envelope;
  fields(env, ['version', 'revision', 'device', 'data', 'records', 'slots', 'pending', 'lastAttempt', 'status']);
  if (!Number.isSafeInteger(backup.savedAt) || backup.savedAt < 0 || typeof env.revision !== 'string' || !env.revision.trim() ||
    typeof env.device !== 'string' || !/^[a-f0-9]{16}$/.test(env.device) || typeof env.pending !== 'boolean' ||
    !Number.isFinite(env.lastAttempt) || env.lastAttempt < 0 || !object(env.status) || !object(env.records) || !object(env.slots)) throw Error('備份紀錄格式無效；原資料保留。');
  fields(env.data, ['version', 'notes', 'orders', 'draft']);
  if (!Array.isArray(env.data.notes) || !object(env.data.orders)) throw Error('備份筆記或排序格式無效。');
  const noteFields = ['noteId', 'title', 'content', 'platformIds', 'priority', 'showOnHome'];
  for (const note of env.data.notes) fields(note, noteFields);
  if (env.data.draft !== null) fields(env.data.draft, noteFields);
  for (const order of Object.values(env.data.orders)) fields(order, NOTE_PRIORITIES);
  const data = normalizeNotesData(env.data); // data v1/v2 and old over-limit notes remain readable.
  const notes = new Map(data.notes.map(n => [n.noteId, n]));
  for (const [id, r] of Object.entries(env.records)) {
    if (!validRecord(r) || r[1] !== id || r[5] === 'blocked' ||
      (r[5] === null ? notes.has(id) : !notes.has(id) || json(encodeNote(notes.get(id))) !== json(r[5]))) throw Error('備份筆記與版本紀錄不一致。');
  }
  if (data.notes.some(n => !Object.hasOwn(env.records, n.noteId))) throw Error('備份缺少筆記版本紀錄。');
  for (const [hash, r] of Object.entries(env.slots)) {
    if (!validRecord(r) || r[5] === 'blocked' || await noteHash(r[1]) !== hash || !r[2][env.device] ||
      !Object.hasOwn(env.records, r[1]) || !dominates(env.records[r[1]][2], r[2])) throw Error('備份待同步紀錄無效。');
  }
  return { data, savedAt: backup.savedAt, legacyCount: data.notes.filter(n => countNoteCharacters(n.title) > NOTE_LIMITS.title || countNoteCharacters(n.content) > NOTE_LIMITS.content).length };
}

export function backupDifferences(local, backup) {
  const current = new Map(local.notes.map(n => [n.noteId, n])), incoming = new Map(backup.notes.map(n => [n.noteId, n]));
  const changes = [];
  for (const [id, note] of incoming) {
    const previous = current.get(id);
    if (!previous || json(previous) !== json(note)) changes.push({ id, action: previous ? 'conflict' : 'add', local: previous ?? null, versions: [note] });
  }
  for (const [id, note] of current) if (!incoming.has(id)) changes.push({ id, action: 'delete', local: note, versions: [null] });
  return changes;
}
