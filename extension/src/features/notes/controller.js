import {
  commitNoteDraft, createEmptyNotesData, createNoteDraft, deleteNote,
  normalizeNotesData, reorderNotes, updateNoteDraft,
} from './model.js';

export function createPersonalNotesController({
  repository, render, reportStatus, createId = () => crypto.randomUUID(),
}) {
  let data = createEmptyNotesData();
  let ready = false;
  let disposed = false;
  let editorOpen = false;
  let resumePrompt = false;
  let enteredNotes = false;
  let writes = Promise.resolve();
  let revision = 0;
  let editorRevision = 0;

  function snapshot() {
    return { data, ready, editorOpen, resumePrompt };
  }

  function publish(preserveEditor = false) {
    if (!disposed) render(snapshot(), { preserveEditor });
  }

  function mutate(operation, {
    preserveEditor = false, afterSave, successMessage = '個人筆記已保存。',
    keepDraftInMemoryOnFailure = false,
  } = {}) {
    if (!ready) return Promise.reject(new Error('個人筆記尚未載入完成。'));
    const request = ++revision;
    const task = writes.catch(() => {}).then(async () => {
      const candidate = normalizeNotesData(operation(data));
      try {
        await repository.save(candidate);
      } catch (error) {
        if (keepDraftInMemoryOnFailure) {
          data = candidate;
          publish(preserveEditor);
        }
        throw error;
      }
      data = candidate;
      afterSave?.();
      publish(preserveEditor);
      if (!disposed && request === revision) reportStatus(successMessage);
      return data;
    });
    writes = task.catch(() => {});
    return task.catch((error) => {
      if (!disposed && request === revision) {
        const status = keepDraftInMemoryOnFailure
          ? '草稿未能自動暫存；目前側欄保留編輯內容，正式筆記未變更'
          : '個人筆記操作未完成，已保存資料未變更';
        reportStatus(`${status}：${error.message}`, true);
      }
      throw error;
    });
  }

  return {
    async start() {
      publish();
      try {
        data = normalizeNotesData(await repository.load());
        if (disposed) return;
        ready = true;
        resumePrompt = enteredNotes && Boolean(data.draft);
        publish();
        reportStatus('個人筆記已載入。');
      } catch (error) {
        if (disposed) return;
        reportStatus(`無法讀取個人筆記；資料未被覆寫：${error.message}`, true);
      }
    },
    enterNotes() {
      editorRevision += 1;
      enteredNotes = true;
      editorOpen = false;
      resumePrompt = Boolean(data.draft);
      publish();
    },
    beginDraft(noteId = null) {
      return mutate((current) => {
        if (current.draft) throw new Error('已有尚未完成的草稿；請先繼續或放棄該草稿。');
        const note = noteId === null ? null : current.notes.find((item) => item.noteId === noteId);
        if (noteId !== null && !note) throw new Error('要編輯的筆記不存在。');
        return { ...current, draft: createNoteDraft(note) };
      }, {
        afterSave: () => { editorOpen = true; resumePrompt = false; },
        successMessage: '草稿已建立；正式筆記尚未變更。',
      });
    },
    continueDraft() {
      const request = ++editorRevision;
      // Restore is ordered after all earlier inputs, including failed autosaves
      // whose latest draft is retained in memory. Never expose the old snapshot
      // while those writes are pending; later input then starts from this value.
      const task = writes.then(() => {
        if (disposed || request !== editorRevision) return data;
        if (!data.draft) throw new Error('目前沒有可恢復的草稿。');
        editorOpen = true;
        resumePrompt = false;
        publish();
        return data;
      });
      writes = task.catch(() => {});
      return task;
    },
    abandonDraft() {
      return mutate((current) => {
        if (!current.draft) throw new Error('目前沒有可放棄的草稿。');
        return { ...current, draft: null };
      }, {
        afterSave: () => { editorOpen = false; resumePrompt = false; },
        successMessage: '草稿已放棄；原正式筆記未變更。',
      });
    },
    updateDraft(field, value) {
      return mutate((current) => updateNoteDraft(current, field, value), {
        preserveEditor: true,
        successMessage: '草稿已自動暫存；正式筆記尚未變更。',
        keepDraftInMemoryOnFailure: true,
      });
    },
    saveDraft() {
      return mutate((current) => commitNoteDraft(current,
        current.draft?.noteId === null ? createId() : null), {
        afterSave: () => { editorOpen = false; resumePrompt = false; },
        successMessage: '正式筆記已儲存。',
      });
    },
    pauseDraft() {
      editorRevision += 1;
      if (!data.draft) return;
      editorOpen = false;
      resumePrompt = false;
      publish();
    },
    removeNote(noteId) {
      return mutate((current) => deleteNote(current, noteId), { successMessage: '筆記已刪除。' });
    },
    reorder(platformId, priority, draggedId, targetId) {
      return mutate((current) => reorderNotes(current, platformId, priority, draggedId, targetId),
        { successMessage: '平台筆記排序已保存。' });
    },
    dispose() { disposed = true; editorRevision += 1; },
    getSnapshot: snapshot,
    async refresh() {
      await writes;
      if (data.draft) throw new Error('請先完成或放棄草稿，再重新載入；目前編輯內容保留。');
      data = normalizeNotesData(await repository.load());
      ready = true; editorOpen = false; resumePrompt = Boolean(data.draft); publish();
    },
  };
}
