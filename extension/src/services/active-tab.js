/** 面板固定觀察其所屬視窗，而非最後取得焦點的其他視窗。 */
export function createActiveTabService(tabs, windowId) {
  return {
    async getContext() {
      const [tab] = await tabs.query({ active: true, windowId });
      // 導航尚未提交時使用 pendingUrl，避免把上一頁誤當目前頁面。
      return { tabId: tab?.id ?? null, url: tab?.pendingUrl ?? tab?.url ?? null };
    },
    subscribe(refresh) {
      const onActivated = (info) => {
        if (info.windowId === windowId) refresh();
      };
      const onUpdated = (_id, changes, tab) => {
        if (tab.windowId === windowId && tab.active &&
          (changes.url !== undefined || changes.status !== undefined)) refresh();
      };
      const onRemoved = (_id, info) => {
        if (info.windowId === windowId && !info.isWindowClosing) refresh();
      };
      const onReplaced = () => refresh();
      const listeners = [
        [tabs.onActivated, onActivated], [tabs.onUpdated, onUpdated],
        [tabs.onRemoved, onRemoved], [tabs.onReplaced, onReplaced],
      ];
      for (const [event, listener] of listeners) event.addListener(listener);
      return () => {
        for (const [event, listener] of listeners) event.removeListener(listener);
      };
    },
  };
}
