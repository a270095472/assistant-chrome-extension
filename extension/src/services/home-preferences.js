import { normalizeHomePreferences } from '../features/home/preferences.js';

export const HOME_PREFERENCES_KEY = 'assistant.homePreferences.v1';

export function createHomePreferences(storageArea) {
  return {
    async load() {
      const result = await storageArea.get(HOME_PREFERENCES_KEY);
      const value = result[HOME_PREFERENCES_KEY];
      if (value?.version !== undefined && value.version !== 1) {
        throw new Error('不支援的首頁偏好版本');
      }
      return normalizeHomePreferences(value);
    },
    async save(value) {
      await storageArea.set({ [HOME_PREFERENCES_KEY]: normalizeHomePreferences(value) });
    },
  };
}
