import { normalizePreferences } from '../features/platforms/state.js';

export const PLATFORM_PREFERENCES_KEY = 'assistant.platformPreferences.v1';

export function createPlatformPreferences(storageArea) {
  return {
    async load() {
      const result = await storageArea.get(PLATFORM_PREFERENCES_KEY);
      return normalizePreferences(result[PLATFORM_PREFERENCES_KEY]);
    },
    async save(preferences) {
      await storageArea.set({ [PLATFORM_PREFERENCES_KEY]: normalizePreferences(preferences) });
    },
  };
}
