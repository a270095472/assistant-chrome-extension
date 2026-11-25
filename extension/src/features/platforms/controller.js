import { getPlatform, subscribePlatforms } from './catalog.js';
import { detectPlatform } from './detect.js';
import { emptyPreferences, resolvePlatform } from './state.js';

/** 協調非同步 IO；網址辨識與優先順序仍由純函式決定。 */
export function createPlatformController({ activeTab, repository, render, reportError }) {
  let preferences = emptyPreferences();
  let currentState = resolvePlatform(preferences, null);
  let lastContext = null;
  let revision = 0;
  let disposed = false;
  let unsubscribe = () => {};
  let unsubscribeCatalog = () => {};
  let writes = Promise.resolve();
  let saved = null;

  function publish(state, tabContext) {
    state.tabContext = tabContext;
    currentState = state;
    preferences = state.preferences;
    render(state);
    const snapshot = preferences;
    writes = writes.then(async () => {
      const serialized = JSON.stringify(snapshot);
      if (serialized === saved) return;
      try {
        await repository.save(snapshot);
        saved = serialized;
      } catch {
        if (!disposed) reportError('平台已切換，但偏好儲存失敗；重開後可能無法恢復。');
      }
    });
    return writes;
  }

  async function refresh({ preserveManual = false } = {}) {
    const request = ++revision;
    let tabContext = null;
    try {
      tabContext = await activeTab.getContext();
    } catch {
      if (!disposed && request === revision) reportError('無法讀取目前分頁，暫時使用保留的平台。');
    }
    // 較舊的查詢不得覆蓋快速切換分頁後的新結果。
    if (disposed || request !== revision) return;
    const changed = tabContext && lastContext &&
      (tabContext.tabId !== lastContext.tabId || tabContext.url !== lastContext.url);
    // Preserve the M2 immediate platform-selection policy, but never carry a
    // manual subflow across navigation, even in a selection-triggered query.
    const preservePlatform = preserveManual && getPlatform(currentState.current?.platformId)?.strategy !== 'manual';
    const retainedManual = currentState.source === 'manual' && (!changed || preservePlatform) ? currentState.current : null;
    const effectivePreferences = changed && getPlatform(preferences.lastValid?.platformId)?.strategy === 'manual'
      ? { ...preferences, lastValid: { ...preferences.lastValid, branch: null } } : preferences;
    const state = resolvePlatform(effectivePreferences, detectPlatform(tabContext?.url), null, retainedManual);
    if (tabContext) lastContext = tabContext;
    await publish(state, tabContext);
  }

  return {
    async start() {
      try {
        preferences = await repository.load();
        saved = JSON.stringify(preferences);
      } catch {
        reportError('無法讀取已儲存偏好，先使用本次分頁辨識。');
      }
      if (disposed) return;
      unsubscribeCatalog = subscribePlatforms(() => {
        revision += 1;
        currentState = resolvePlatform(preferences, null);
        lastContext = null;
        render({ ...currentState, tabContext: null });
        void refresh();
      });
      unsubscribe = activeTab.subscribe(() => { void refresh(); });
      await refresh();
    },
    async select(platformId) {
      if (!getPlatform(platformId)) throw new Error('不支援的平台 ID。');
      if (disposed) return;
      revision += 1; // 使選擇前仍在等待的查詢失效。
      const state = resolvePlatform(preferences, currentState.automatic, platformId);
      // 即時採用，但 Official 品牌須等本次網址查詢確認後才能呈現。
      if (getPlatform(platformId).strategy === 'byDomain') state.current = state.preferences.lastValid = { platformId, branch: null };
      void publish(state, lastContext);
      await refresh({ preserveManual: true });
    },
    async selectBranch(branch) {
      if (disposed) return;
      const platform = getPlatform(currentState.current?.platformId);
      if (!platform || platform.strategy !== 'manual' || !platform.subflows.some((s) => s.id === branch)) throw new Error('不支援的子流程。');
      // Keep an in-flight navigation query valid. refresh compares its tab/URL
      // with lastContext: the same page retains this branch, a new page wins.
      const selected = { platformId: platform.id, branch };
      await publish({ ...currentState, current: selected, source: 'manual', preferences: { ...preferences, lastValid: selected } }, lastContext);
    },
    refresh,
    dispose() {
      disposed = true;
      revision += 1;
      unsubscribe();
      unsubscribeCatalog();
    },
  };
}
