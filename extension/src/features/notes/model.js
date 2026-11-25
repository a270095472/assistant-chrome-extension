import { getKnownPlatforms, getKnownPlatform, getPlatform } from '../platforms/catalog.js';

export const NOTE_PRIORITIES = Object.freeze(['high', 'medium', 'low']);
export const NOTE_PRIORITY_LABELS = Object.freeze({ high: '高', medium: '中', low: '低' });
export const NOTE_LIMITS = Object.freeze({ title: 10, content: 100 });
const graphemes = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });
export const countNoteCharacters = (value) => [...graphemes.segment(value)].length;
export function assertNoteLimits(note) {
  if (countNoteCharacters(note.title) > NOTE_LIMITS.title) throw new Error('筆記標題最多 10 個可見字元；原筆記與草稿仍保留，請調整後再儲存。');
  if (countNoteCharacters(note.content) > NOTE_LIMITS.content) throw new Error('筆記正文最多 100 個可見字元；原筆記與草稿仍保留，請調整後再儲存。');
}
const knownIds = () => new Set(getKnownPlatforms().map((p) => p.id));
const platformRows = (data) => [...new Set([...knownIds(), ...Object.keys(data?.orders ?? {})])].map((id) => ({ id }));
const validId = (id) => typeof id === 'string' && /^[a-z][a-zA-Z0-9_-]{0,63}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const NOTE_FIELDS = ['title', 'content', 'platformIds', 'priority', 'showOnHome'];
const legacyIds = new Set(['pchome','momo','shopee','pxmart','rakuten','iopenmall','official','yahoo','wanjiafu']);
const storageVersion = (orders) => Object.keys(orders).some((id) => !legacyIds.has(id)) ? 2 : 1;

export function createEmptyNotesData() {
  return {
    version: 1,
    notes: [],
    orders: Object.fromEntries(getKnownPlatforms().map(({ id }) => [id, {
      high: [], medium: [], low: [],
    }])),
    draft: null,
  };
}

function assertPlatformIds(value, field, allowEmpty, retained = new Set()) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${field} 必須指定至少一個有效平台。`);
  }
  const ids = new Set();
  for (const id of value) {
    if (!validId(id) || (!getKnownPlatform(id) && !retained.has(id))) throw new Error(`${field} 含有無效的平台 ID：${id}`);
    if (ids.has(id)) throw new Error(`${field} 不可重複指定平台。`);
    ids.add(id);
  }
  return [...ids];
}

function normalizeNoteFields(value, field, allowEmpty, retained = new Set()) {
  if (!value || typeof value !== 'object') throw new Error(`${field} 格式無效。`);
  if (typeof value.title !== 'string') throw new Error(`${field} 標題格式無效。`);
  if (typeof value.content !== 'string') throw new Error(`${field} 內容格式無效。`);
  if (!allowEmpty && !value.title.trim()) {
    throw new Error('筆記標題不可空白。');
  }
  if (!NOTE_PRIORITIES.includes(value.priority)) throw new Error(`${field} 優先級無效。`);
  if (typeof value.showOnHome !== 'boolean') throw new Error(`${field} 首頁顯示設定無效。`);
  return {
    title: value.title,
    content: value.content,
    platformIds: assertPlatformIds(value.platformIds, `${field} 平台`, allowEmpty, retained),
    priority: value.priority,
    showOnHome: value.showOnHome,
  };
}

function normalizeDraft(value, noteIds, retained) {
  if (value === null || value === undefined) return null;
  const fields = normalizeNoteFields(value, '草稿', true, retained);
  if (value.noteId !== null && (typeof value.noteId !== 'string' || !noteIds.has(value.noteId))) {
    throw new Error('草稿所編輯的筆記不存在。');
  }
  return { noteId: value.noteId, ...fields };
}

export function normalizeNotesData(value) {
  if (value === undefined) return createEmptyNotesData();
  if (!value || typeof value !== 'object' || ![1, 2].includes(value.version)) {
    throw new Error('不支援的個人筆記資料版本或格式。');
  }
  if (!Array.isArray(value.notes)) throw new Error('個人筆記清單格式無效。');
  const retained = new Set(Object.keys(value.orders ?? {}).filter(validId));
  if (Object.keys(value.orders ?? {}).some((id) => !validId(id))) throw new Error('筆記排序資料含有無效的平台 ID。');
  const noteIds = new Set();
  const notes = value.notes.map((note) => {
    if (typeof note?.noteId !== 'string' || !note.noteId.trim() || noteIds.has(note.noteId)) {
      throw new Error('筆記 ID 無效或重複。');
    }
    noteIds.add(note.noteId);
    return { noteId: note.noteId, ...normalizeNoteFields(note, '筆記', false, retained) };
  });

  const orders = {};
  for (const { id } of platformRows(value)) {
    const platformOrders = value.orders?.[id] ?? (getKnownPlatform(id) ? { high: [], medium: [], low: [] } : null);
    if (!platformOrders || typeof platformOrders !== 'object') {
      throw new Error(`缺少 ${id} 平台的筆記排序資料。`);
    }
    orders[id] = {};
    for (const priority of NOTE_PRIORITIES) {
      const ids = platformOrders[priority];
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length) {
        throw new Error(`${id} 平台的${NOTE_PRIORITY_LABELS[priority]}優先級排序格式無效。`);
      }
      const eligible = new Set(notes
        .filter((note) => note.platformIds.includes(id) && note.priority === priority)
        .map((note) => note.noteId));
      if (ids.length !== eligible.size || ids.some((noteId) => !eligible.has(noteId))) {
        throw new Error(`${id} 平台的${NOTE_PRIORITY_LABELS[priority]}優先級排序與筆記資料不一致。`);
      }
      orders[id][priority] = [...ids];
    }
  }
  return { version: value.version === 2 ? 2 : storageVersion(orders), notes, orders, draft: normalizeDraft(value.draft, noteIds, retained) };
}

export function createNoteDraft(note = null) {
  if (!note) {
    return { noteId: null, title: '', content: '', platformIds: [], priority: 'medium', showOnHome: true };
  }
  const fields = normalizeNoteFields(note, '筆記', false, new Set(note.platformIds));
  return { noteId: note.noteId, ...fields };
}

export function updateNoteDraft(data, field, value) {
  const current = normalizeNotesData(data);
  if (!current.draft) throw new Error('目前沒有可編輯的筆記草稿。');
  if (!NOTE_FIELDS.includes(field)) throw new Error(`不支援的草稿欄位：${field}`);
  const nextFields = { ...current.draft, [field]: value };
  const fields = normalizeNoteFields(nextFields, '草稿', true, new Set(Object.keys(current.orders)));
  return { ...current, draft: { noteId: current.draft.noteId, ...fields } };
}

export function commitNoteDraft(data, newNoteId) {
  const current = normalizeNotesData(data);
  if (!current.draft) throw new Error('目前沒有可儲存的筆記草稿。');
  const fields = normalizeNoteFields(current.draft, '筆記', false, new Set(Object.keys(current.orders)));
  assertNoteLimits(fields);
  const noteId = current.draft.noteId ?? newNoteId;
  if (typeof noteId !== 'string' || !noteId.trim()) throw new Error('無法建立有效的筆記 ID。');
  const index = current.notes.findIndex((note) => note.noteId === noteId);
  if (current.draft.noteId !== null && index < 0) throw new Error('要更新的筆記不存在。');
  if (current.draft.noteId === null && current.notes.some((note) => note.noteId === noteId)) {
    throw new Error('筆記 ID 已存在。');
  }
  const note = { noteId, ...fields };
  const notes = [...current.notes];
  if (index < 0) notes.push(note);
  else notes[index] = note;
  const orders = Object.fromEntries(platformRows(current).map(({ id }) => [id, {}]));
  for (const { id } of platformRows(current)) {
    for (const priority of NOTE_PRIORITIES) {
      const previous = current.orders[id][priority].filter((idInOrder) => idInOrder !== noteId);
      const remains = note.platformIds.includes(id) && note.priority === priority;
      const wasAlreadyHere = current.orders[id][priority].includes(noteId);
      orders[id][priority] = remains
        ? (wasAlreadyHere ? [...current.orders[id][priority]] : [...previous, noteId])
        : previous;
    }
  }
  return normalizeNotesData({ version: current.version, notes, orders, draft: null });
}

export function deleteNote(data, noteId) {
  const current = normalizeNotesData(data);
  if (!current.notes.some((note) => note.noteId === noteId)) throw new Error('要刪除的筆記不存在。');
  const orders = Object.fromEntries(platformRows(current).map(({ id }) => [id, {}]));
  for (const { id } of platformRows(current)) {
    for (const priority of NOTE_PRIORITIES) {
      orders[id][priority] = current.orders[id][priority].filter((idInOrder) => idInOrder !== noteId);
    }
  }
  return normalizeNotesData({
    version: current.version,
    notes: current.notes.filter((note) => note.noteId !== noteId),
    orders,
    draft: current.draft?.noteId === noteId ? null : current.draft,
  });
}

export function reorderNotes(data, platformId, priority, draggedId, targetId) {
  const current = normalizeNotesData(data);
  if (!Object.hasOwn(current.orders, platformId)) throw new Error(`無效的平台 ID：${platformId}`);
  if (!NOTE_PRIORITIES.includes(priority)) throw new Error('無效的筆記優先級。');
  const order = current.orders[platformId][priority];
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) throw new Error('排序筆記不存在或不屬於同一平台與優先級。');
  if (from === to) return current;
  const next = [...order];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return normalizeNotesData({
    ...current,
    orders: { ...current.orders, [platformId]: { ...current.orders[platformId], [priority]: next } },
  });
}

export function getNotesForHome(data, platformId) {
  const current = normalizeNotesData(data);
  if (!getPlatform(platformId)) return [];
  return NOTE_PRIORITIES.flatMap((priority) => current.orders[platformId][priority]
    .map((noteId) => current.notes.find((note) => note.noteId === noteId))
    .filter((note) => note.showOnHome));
}

export function getNotesByPriority(data, platformId = '') {
  const current = normalizeNotesData(data);
  if (platformId && !Object.hasOwn(current.orders, platformId)) throw new Error(`無效的平台 ID：${platformId}`);
  return Object.fromEntries(NOTE_PRIORITIES.map((priority) => {
    const ids = platformId
      ? current.orders[platformId][priority]
      : current.notes.filter((note) => note.priority === priority).map((note) => note.noteId);
    return [priority, ids.map((noteId) => current.notes.find((note) => note.noteId === noteId))];
  }));
}
