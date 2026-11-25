import { getPlatform, getKnownPlatform, selectionBranch } from './catalog.js';

export function emptyPreferences() {
  return { version: 1, manualPlatformId: null, lastValid: null };
}

function validSelection(value, active = true) {
  if (!value || typeof value !== 'object') return null;
  const platform = active ? getPlatform(value.platformId) : getKnownPlatform(value.platformId);
  if (!platform) return null;
  const branch = value.branch ?? null;
  if (branch !== null && (!['byDomain', 'manual'].includes(platform.strategy) || !platform.subflows.some((s) => s.id === branch))) return null;
  return { platformId: value.platformId, branch };
}

// 本機儲存也屬外部輸入；不信任舊資料、未來版號或損壞的 ID。
export function normalizePreferences(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return emptyPreferences();
  return {
    version: 1,
    manualPlatformId: getKnownPlatform(value.manualPlatformId)?.id ?? null,
    lastValid: validSelection(value.lastValid, false),
  };
}

// retainedManual 僅由協調器在同一分頁／有效網址仍成立時傳入。
export function resolvePlatform(preferences, automatic, manualRequest = null, retainedManual = null) {
  const manual = getPlatform(manualRequest);
  let selected = manual ? { platformId: manual.id, branch: null }
    : validSelection(retainedManual) ?? validSelection(automatic) ?? validSelection(preferences.lastValid);
  if (selected) {
    const platform = getPlatform(selected.platformId);
    selected = { platformId: platform.id, branch: selectionBranch(platform, automatic, selected.branch) };
  }
  return {
    automatic,
    current: selected,
    source: manual || validSelection(retainedManual) ? 'manual' : automatic ? 'automatic' : selected ? 'lastValid' : 'none',
    preferences: {
      version: 1,
      manualPlatformId: manual?.id ?? preferences.manualPlatformId,
      lastValid: selected ?? preferences.lastValid,
    },
  };
}
