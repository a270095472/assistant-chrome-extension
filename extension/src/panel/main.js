import { createImportView } from './import-view.js';
import { createActiveTabService } from '../services/active-tab.js';
import { createPlatformPreferences } from '../services/platform-preferences.js';
import { createPlatformController } from '../features/platforms/controller.js';
import { createPlatformView } from './platform-view.js';
import { RULES } from '../features/rules/catalog.js';
import { createWorkspaceView } from './workspace-view.js';
import { createHomeController } from '../features/home/controller.js';
import { createHomePreferences } from '../services/home-preferences.js';
import { createPersonalNotesController } from '../features/notes/controller.js';
import { createNoteSyncClient } from '../services/note-sync-client.js';
import { createNoteSyncView } from './note-sync-view.js';
import { createNotesView } from './notes-view.js';
import { createCurrentClient } from '../services/current-ruleset.js';
import { createCurrentController } from '../features/rules/current-controller.js';
import { CURRENT_ERRORS } from './import-view.js';
import { createUpdateNotice } from './update-notice.js';

const currentClient = createCurrentClient({ runtime: chrome.runtime, storageEvents: chrome.storage.onChanged });
const importView = createImportView(document, () => currentClient.getSnapshot()?.current ?? null, currentClient);
const view = createPlatformView(document);
const notesView = createNotesView(document);
const workspace = createWorkspaceView(document, RULES, notesView);
const updateNotice = createUpdateNotice(document);
const currentController = createCurrentController({ client: currentClient, workspace,
  notify: updateNotice.notify,
  reportError(code) {
    const error = document.getElementById('current-runtime-error');
    error.hidden = !code; error.textContent = code ? CURRENT_ERRORS[code] ?? 'Current 無法讀取；保留最後已確認資料，請重新讀取。' : '';
  },
});
const home = createHomeController({
  repository: createHomePreferences(chrome.storage.local),
  render: workspace.renderPreferences,
  reportStatus: workspace.reportStatus,
});
const notesClient = createNoteSyncClient(chrome.runtime);
const notes = createPersonalNotesController({
  repository: notesClient,
  render: notesView.render,
  reportStatus: notesView.reportStatus,
});
const noteSyncView = createNoteSyncView({ document, client: notesClient, notes, storageEvents: chrome.storage.onChanged });
const unbindNotes = notesView.bind(notes);
const unbindWorkspace = workspace.bind(home.setModule, home.setTextSize, notes.enterNotes);
let controller;
let unbindPlatform = () => {};
let disposed = false;
window.addEventListener('pagehide', () => {
  disposed = true;
  unbindPlatform();
  controller?.dispose();
  unbindWorkspace();
  unbindNotes();
  importView.dispose();
  currentController.dispose();
  updateNotice.dispose();
  currentClient.dispose();
  window.removeEventListener('focus', refreshCurrent);
  view.dispose();
  notesView.dispose();
  workspace.dispose();
  home.dispose();
  notes.dispose();
  noteSyncView.dispose();
}, { once: true });
void home.start();
void notes.start().then(() => noteSyncView.start());
const refreshCurrent = () => { void currentClient.refresh(); };
window.addEventListener('focus', refreshCurrent);

async function start() {
  await currentClient.refresh();
  if (disposed) return;
  const currentWindow = await chrome.windows.getCurrent();
  if (disposed) return;
  if (!Number.isInteger(currentWindow.id)) throw new Error('無法取得側欄所屬視窗。');
  controller = createPlatformController({
    activeTab: createActiveTabService(chrome.tabs, currentWindow.id),
    repository: createPlatformPreferences(chrome.storage.local),
    render(state) {
      view.render(state);
      workspace.renderPlatform(state);
    },
    reportError: view.reportError,
  });
  unbindPlatform = view.bindSelect((id) => controller.select(id).catch(() => {
    view.reportError('平台切換失敗，請重新開啟側欄。');
  }), (branch) => controller.selectBranch(branch).catch(() => view.reportError('子流程切換失敗。')));
  await controller.start();
}

void start().catch((error) => {
  view.reportError('Assistant 初始化失敗，請重新載入擴充套件。');
  console.error('[Assistant] 初始化失敗。', error);
});
