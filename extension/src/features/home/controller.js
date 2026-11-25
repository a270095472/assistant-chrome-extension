import { HOME_MODULES, TEXT_SIZES, normalizeHomePreferences } from './preferences.js';

export function createHomeController({ repository, render, reportStatus }) {
  let preferences = normalizeHomePreferences();
  let ready = false;
  let disposed = false;
  let revision = 0;
  let writes = Promise.resolve();
  async function update(key, value) {
    if (!ready || disposed) return;
    preferences = { ...preferences, [key]: value };
    const snapshot = preferences;
    const request = ++revision;
    render(preferences, true);
    reportStatus('正在保存首頁顯示偏好…');
    writes = writes.then(async () => {
      try {
        await repository.save(snapshot);
        if (!disposed && request === revision) reportStatus('首頁顯示偏好已保存。');
      } catch {
        if (!disposed && request === revision) reportStatus('顯示已變更，但偏好儲存失敗；重開後可能無法恢復，請再次操作設定重試。', true);
      }
    });
    await writes;
  }
  return {
    async start() {
      render(preferences, false);
      try {
        const loaded = await repository.load();
        if (disposed) return;
        preferences = loaded;
        ready = true;
        render(preferences, true);
        reportStatus('首頁顯示偏好已載入。');
      } catch {
        if (disposed) return;
        // 讀取失敗時不以預設值覆寫未知資料；M1 與查詢仍可使用。
        reportStatus('無法讀取首頁偏好，暫用預設顯示（人工情境關閉）；請重開側欄重試，設定尚未保存。', true);
      }
    },
    async setModule(key, visible) {
      if ((!Object.hasOwn(HOME_MODULES, key) && key !== 'manualContext') || typeof visible !== 'boolean') return;
      await update(key, visible);
    },
    async setTextSize(value) {
      if (TEXT_SIZES.includes(value)) await update('textSize', value);
    },
    dispose() { disposed = true; },
  };
}
