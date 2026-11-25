import { configureSidePanel } from './services/side-panel.js';
import { bindCurrentMessages } from './services/current-ruleset.js';
import { createSopRepository } from './services/sop-repository.js';
import { createSopCurrentService } from './services/sop-current.js';
import { createNoteSyncService, bindNoteSyncMessages } from './services/note-sync.js';
import { isOwnedKey } from './features/notes/sync-model.js';

bindCurrentMessages(chrome.runtime, createSopCurrentService({ repository: createSopRepository(), storage: chrome.storage.local,
  locks: navigator.locks, notify(revision) {
    void chrome.runtime.sendMessage({ channel: 'assistant-current-changed', revision }).catch(() => {});
  } }));

let noteTimer;
const noteService = createNoteSyncService({ local: chrome.storage.local, sync: chrome.storage.sync, locks: navigator.locks,
  schedule(delay = 1500) {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { void noteService.flush().catch(() => {}); }, delay);
  } });
bindNoteSyncMessages(chrome.runtime, noteService);
const resumeNotes = () => { void noteService.read().then(() => noteService.flush()).catch(() => {}); };
chrome.runtime.onStartup.addListener(resumeNotes);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some(isOwnedKey)) {
    void noteService.read().catch(() => {});
  }
});
resumeNotes();

// Service worker 每次啟動都設定行為，不依賴易消失的記憶體狀態。
void configureSidePanel(chrome.sidePanel).catch((error) => {
  console.error('[Assistant] 無法設定側邊欄開啟行為。', error);
});
