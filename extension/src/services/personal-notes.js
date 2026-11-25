import { normalizeNotesData } from '../features/notes/model.js';

export const PERSONAL_NOTES_KEY = 'assistant.personalNotes.v1';
export const DYNAMIC_NOTES_KEY = 'assistant.personalNotes.v2';

export function createPersonalNotesRepository(storageArea) {
  return {
    async load() {
      const dynamic = await storageArea.get(DYNAMIC_NOTES_KEY);
      if (dynamic[DYNAMIC_NOTES_KEY] !== undefined) return normalizeNotesData(dynamic[DYNAMIC_NOTES_KEY]);
      const result = await storageArea.get(PERSONAL_NOTES_KEY);
      return normalizeNotesData(result[PERSONAL_NOTES_KEY]);
    },
    async save(value) {
      const data = normalizeNotesData(value);
      // A v2 write never replaces the original v1 snapshot. Unknown/corrupt v2
      // blocks load; it must not silently fall back to an older snapshot.
      await storageArea.set({ [data.version === 2 ? DYNAMIC_NOTES_KEY : PERSONAL_NOTES_KEY]: data });
    },
  };
}
