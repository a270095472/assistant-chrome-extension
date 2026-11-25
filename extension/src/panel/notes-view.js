import { createHomeDisclosure } from './home-disclosure.js';
import { getNotesByPriority, getNotesForHome, NOTE_PRIORITIES, NOTE_PRIORITY_LABELS, countNoteCharacters, NOTE_LIMITS } from '../features/notes/model.js';
import { getKnownPlatforms, getPlatform, subscribePlatforms } from '../features/platforms/catalog.js';

export function createNotesView(document) {
  const ids = [
    'home-notes', 'notes-platform', 'notes-list', 'notes-create', 'notes-resume-prompt',
    'notes-resume', 'notes-continue', 'notes-abandon', 'notes-manager', 'notes-editor', 'notes-title-input',
    'notes-content', 'notes-platform-options', 'notes-priority', 'notes-show-home',
    'notes-save', 'notes-pause', 'notes-delete-dialog', 'notes-delete-title',
    'notes-delete-platforms', 'notes-delete-cancel', 'notes-delete-commit', 'notes-status',
    'notes-title-count', 'notes-content-count', 'notes-limit-message',
  ];
  const elements = Object.fromEntries(ids.map((id) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Assistant 缺少畫面元素：${id}`);
    return [id, node];
  }));
  const homeDisclosure = createHomeDisclosure(document);
  const platformNames = new Map();
  const priorityNames = NOTE_PRIORITY_LABELS;
  const platformInputs = new Map();
  let state = null;
  let platformState = null;
  let editorTarget;
  let selectedForDelete = null;
  let deleteTrigger = null;
  let chosenPlatform = false;
  let draggedNoteId = null;
  let draggedPriority = null;
  let handlers = {};
  let bound = false;

  function text(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }

  function noteSummary(note) {
    const heading = document.createElement('div');
    heading.className = 'note-summary';
    const priority = text('span', priorityNames[note.priority]);
    priority.className = `note-summary-priority priority-${note.priority}`;
    const details = document.createElement('div');
    details.className = 'note-summary-details';
    const title = text('h3', note.title);
    title.className = 'note-summary-title';
    details.append(title);
    if (note.content.trim()) {
      const content = text('p', note.content);
      content.className = 'note-summary-content';
      details.append(content);
    }
    heading.append(priority, details);
    return heading;
  }

  function rebuildPlatforms() {
    const selected = elements['notes-platform'].value;
    const selectedIds = platformInputs.size
      ? [...platformInputs].filter(([, input]) => input.checked).map(([id]) => id)
      : state?.data.draft?.platformIds ?? [];
    platformNames.clear(); platformInputs.clear();
    elements['notes-platform-options'].replaceChildren();
    const all = text('option', '全部平台');
    all.value = '';
    elements['notes-platform'].replaceChildren(all);
    const historicalInUse = (id) => Boolean(getPlatform(id) || state?.data.notes.some(note => note.platformIds.includes(id)) || state?.data.draft?.platformIds.includes(id));
    const hiddenHistorical = new Set(getKnownPlatforms().filter(p => p.historicalOnly && !historicalInUse(p.id)).map(p => p.id));
    const known = new Map(getKnownPlatforms().filter(p => !hiddenHistorical.has(p.id)).map((p) => [p.id, p]));
    for (const id of Object.keys(state?.data.orders ?? {})) if (!known.has(id) && !hiddenHistorical.has(id)) known.set(id, { id, name: id, enabled: false });
    for (const platform of known.values()) {
      const displayName = platform.name + (getPlatform(platform.id) ? '' : '（已封存）');
      platformNames.set(platform.id, displayName);
      const label = text('label', displayName);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = platform.id;
      input.id = `note-platform-${platform.id}`;
      input.checked = selectedIds.includes(platform.id);
      label.prepend(input);
      elements['notes-platform-options'].append(label);
      platformInputs.set(platform.id, input);
      input.addEventListener('change', () => {
        if (bound) invoke(() => handlers.updateDraft('platformIds', [...platformInputs]
          .filter(([, checkbox]) => checkbox.checked).map(([id]) => id)));
      });
      const option = text('option', displayName);
      option.value = platform.id;
      elements['notes-platform'].append(option);
    }
    elements['notes-platform'].value = known.has(selected) ? selected : '';
  }
  rebuildPlatforms();
  const unsubscribeCatalog = subscribePlatforms(() => { rebuildPlatforms(); if (state) render(state, { preserveEditor: true }); });
  for (const priority of NOTE_PRIORITIES) {
    const option = text('option', priorityNames[priority]);
    option.value = priority;
    elements['notes-priority'].append(option);
  }

  function invoke(action) {
    return Promise.resolve().then(action).catch(() => {});
  }

  function renderHome() {
    const platformId = platformState?.current?.platformId;
    const notes = getNotesForHome(state?.data, platformId);
    const alert = document.querySelector?.('#module-notes .home-module-alert');
    if (alert) alert.textContent = notes.some(note => note.priority === 'high') ? ' · 含高優先筆記' : '';
    elements['home-notes'].replaceChildren(...(notes.length
      ? notes.map((note) => {
        const article = document.createElement('article');
        article.className = 'personal-note-card';
        const summary = noteSummary({ ...note, content: '' });
        const content = text('p', note.content); content.className = 'note-summary-content';
        homeDisclosure.wrap(article, [summary], note.content.trim() ? [content] : []);
        return article;
      })
      : [text('p', state?.data.notes.length
        ? '目前沒有符合平台與首頁顯示設定的個人筆記' : '目前沒有個人筆記')]));
  }

  function renderDeleteConfirmation() {
    const note = state?.data.notes.find((item) => item.noteId === selectedForDelete);
    if (!note) {
      selectedForDelete = null;
      if (elements['notes-delete-dialog'].open) elements['notes-delete-dialog'].close();
      deleteTrigger = null;
      return;
    }
    elements['notes-delete-title'].textContent = note.title;
    elements['notes-delete-platforms'].textContent = note.platformIds.map((id) => platformNames.get(id)).join('、');
    if (!elements['notes-delete-dialog'].open) elements['notes-delete-dialog'].showModal();
  }

  function closeDeleteConfirmation() {
    selectedForDelete = null;
    if (elements['notes-delete-dialog'].open) elements['notes-delete-dialog'].close();
    deleteTrigger?.focus({ preventScroll: true });
    deleteTrigger = null;
  }

  function renderEditor(preserveEditor) {
    const draft = state.data.draft;
    elements['notes-editor'].hidden = !state.editorOpen;
    if (!state.editorOpen || !draft) {
      editorTarget = undefined;
      return;
    }
    if (preserveEditor && editorTarget === draft.noteId) { renderCounts(); return; }
    editorTarget = draft.noteId;
    elements['notes-title-input'].value = draft.title;
    elements['notes-content'].value = draft.content;
    renderCounts();
    elements['notes-priority'].value = draft.priority;
    elements['notes-show-home'].checked = draft.showOnHome;
    for (const [platformId, input] of platformInputs) {
      input.checked = draft.platformIds.includes(platformId);
    }
  }

  function renderCounts() {
    const title = countNoteCharacters(elements['notes-title-input'].value);
    const content = countNoteCharacters(elements['notes-content'].value);
    const exceeded = title > NOTE_LIMITS.title || content > NOTE_LIMITS.content;
    elements['notes-title-count'].textContent = `${title} / ${NOTE_LIMITS.title} 個可見字元`;
    elements['notes-content-count'].textContent = `${content} / ${NOTE_LIMITS.content} 個可見字元`;
    elements['notes-limit-message'].textContent = exceeded
      ? '目前內容超過上限；既有筆記與草稿保留，請明確調整後再儲存。'
      : '舊筆記不截斷；修改須符合標題 10、正文 100 個可見字元上限。';
    elements['notes-title-input'].setAttribute('aria-invalid', String(title > NOTE_LIMITS.title));
    elements['notes-content'].setAttribute('aria-invalid', String(content > NOTE_LIMITS.content));
    elements['notes-save'].disabled = !state?.ready || exceeded;
  }

  function renderList() {
    const platformId = elements['notes-platform'].value;
    const groups = getNotesByPriority(state.data, platformId);
    const sections = NOTE_PRIORITIES.map((priority) => {
      const section = document.createElement('section');
      section.className = 'notes-priority-group';
      section.append(text('h3', `${priorityNames[priority]}優先`));
      const cards = groups[priority].map((note) => {
        const article = document.createElement('article');
        article.className = 'personal-note-card';
        article.draggable = Boolean(platformId) && state.ready && !state.data.draft;
        article.append(noteSummary(note));
        article.append(text('p', `適用平台：${note.platformIds.map((id) => platformNames.get(id)).join('、')}`));
        article.append(text('p', `首頁顯示：${note.showOnHome ? '是' : '否'}`));
        const actions = document.createElement('div');
        actions.className = 'notes-actions';
        const edit = text('button', '編輯');
        edit.type = 'button';
        edit.disabled = !state.ready || Boolean(state.data.draft);
        edit.addEventListener('click', () => invoke(() => handlers.beginDraft(note.noteId)));
        const remove = text('button', '刪除');
        remove.type = 'button';
        remove.disabled = !state.ready || state.data.draft?.noteId === note.noteId;
        remove.addEventListener('click', () => {
          deleteTrigger = remove;
          selectedForDelete = note.noteId;
          renderDeleteConfirmation();
        });
        actions.append(edit, remove);
        article.append(actions);
        article.addEventListener('dragstart', () => {
          draggedNoteId = note.noteId;
          draggedPriority = priority;
        });
        article.addEventListener('dragover', (event) => event.preventDefault());
        article.addEventListener('drop', (event) => {
          event.preventDefault();
          if (draggedNoteId && draggedPriority === priority && draggedNoteId !== note.noteId) {
            const sourceId = draggedNoteId;
            const targetId = note.noteId;
            invoke(() => handlers.reorder(platformId, priority, sourceId, targetId));
          }
          draggedNoteId = null;
          draggedPriority = null;
        });
        return article;
      });
      section.append(...(cards.length ? cards : [text('p', '目前沒有筆記')]));
      return section;
    });
    elements['notes-list'].replaceChildren(...sections);
  }

  function render(nextState, { preserveEditor = false } = {}) {
    state = nextState;
    const historical = getKnownPlatforms().filter(p => p.historicalOnly);
    const historicalChanged = historical.some(p => Boolean(getPlatform(p.id) || state.data.notes.some(note => note.platformIds.includes(p.id)) || state.data.draft?.platformIds.includes(p.id)) !== platformNames.has(p.id));
    if (historicalChanged || Object.keys(state.data.orders).some((id) => !platformNames.has(id) && !historical.some(p => p.id === id))) rebuildPlatforms();
    elements['notes-create'].disabled = !state.ready || Boolean(state.data.draft);
    elements['notes-continue'].hidden = !state.data.draft || state.editorOpen || state.resumePrompt;
    elements['notes-continue'].disabled = !state.ready;
    elements['notes-platform'].disabled = !state.ready;
    elements['notes-resume-prompt'].hidden = !state.resumePrompt;
    elements['notes-manager'].hidden = state.editorOpen || state.resumePrompt;
    elements['notes-save'].disabled = !state.ready;
    elements['notes-pause'].disabled = !state.ready;
    renderHome();
    renderEditor(preserveEditor);
    renderList();
    renderDeleteConfirmation();
  }

  function bind(nextHandlers) {
    handlers = nextHandlers;
    bound = true;
    const removers = [];
    const listen = (id, event, callback) => {
      elements[id].addEventListener(event, callback);
      removers.push(() => elements[id].removeEventListener(event, callback));
    };
    const update = (field, value) => invoke(() => handlers.updateDraft(field, value));
    listen('notes-create', 'click', () => invoke(() => handlers.beginDraft()));
    listen('notes-resume', 'click', () => invoke(() => handlers.continueDraft()));
    listen('notes-continue', 'click', () => invoke(() => handlers.continueDraft()));
    listen('notes-abandon', 'click', () => invoke(() => handlers.abandonDraft()));
    listen('notes-title-input', 'input', () => { renderCounts(); update('title', elements['notes-title-input'].value); });
    listen('notes-content', 'input', () => { renderCounts(); update('content', elements['notes-content'].value); });
    listen('notes-priority', 'change', () => update('priority', elements['notes-priority'].value));
    listen('notes-show-home', 'change', () => update('showOnHome', elements['notes-show-home'].checked));
    listen('notes-platform', 'change', () => {
      chosenPlatform = true;
      renderList();
    });
    listen('notes-save', 'click', () => invoke(() => handlers.saveDraft()));
    listen('notes-pause', 'click', () => handlers.pauseDraft());
    listen('notes-delete-cancel', 'click', closeDeleteConfirmation);
    listen('notes-delete-dialog', 'cancel', (event) => {
      event.preventDefault();
      closeDeleteConfirmation();
    });
    listen('notes-delete-commit', 'click', () => {
      const noteId = selectedForDelete;
      if (!noteId) return;
      selectedForDelete = null;
      elements['notes-delete-dialog'].close();
      deleteTrigger = null;
      invoke(() => handlers.removeNote(noteId)).then(() => {
        if (!state.data.notes.some((note) => note.noteId === noteId)) {
          elements['notes-create'].focus({ preventScroll: true });
        }
      });
    });
    return () => { bound = false; removers.forEach((remove) => remove()); };
  }

  return {
    render,
    dispose() { homeDisclosure.dispose(); unsubscribeCatalog(); },
    renderHome,
    renderPlatform(nextState) {
      platformState = nextState;
      renderHome();
    },
    enterNotes(platformId) {
      if (!chosenPlatform && platformNames.has(platformId)) elements['notes-platform'].value = platformId;
      chosenPlatform = true;
      renderList();
    },
    bind,
    reportStatus(message, error = false) {
      elements['notes-status'].textContent = message;
      elements['notes-status'].setAttribute('role', error ? 'alert' : 'status');
    },
  };
}
