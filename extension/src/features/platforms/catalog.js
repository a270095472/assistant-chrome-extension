import { DEFAULT_PLATFORMS, LEGACY_PLATFORMS } from './defaults.js';
import { validateCandidate, emptyRuleset } from '../import/validate.js';
export { DEFAULT_PLATFORMS };
let known = new Map([...LEGACY_PLATFORMS, ...DEFAULT_PLATFORMS].map((p) => [p.id, p]));
export let PLATFORMS = DEFAULT_PLATFORMS;
const listeners = new Set();
let generation = 0;
export const catalogGeneration = () => generation;
export const getKnownPlatforms = () => [...known.values()];
export const getPlatform = (id) => PLATFORMS.find((p) => p.id === id) ?? null;
export const getKnownPlatform = (id) => known.get(id) ?? null;
export const subscribePlatforms = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Internal composition boundary for validated complete data; no persistence or import/apply UI.
export function configurePlatforms(platforms) {
  const next = structuredClone(platforms);
  const contract = next.map(({ id, name, enabled, order, strategy, subflows, sites }) => ({ id, name, enabled, order, strategy, subflows, sites }));
  const validation = validateCandidate({ ...emptyRuleset(), platforms: contract });
  if (!validation.ok) throw new Error(validation.errors.map((e) => `${e.path}：${e.reason}`).join('\n'));
  const retained = new Map([...known].map(([id, p]) => [id, freeze({ ...p, enabled: false })]));
  for (const platform of next) retained.set(platform.id, freeze(platform));
  known = retained;
  PLATFORMS = Object.freeze(next.filter((p) => p.enabled).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(freeze));
  generation += 1;
  for (const listener of listeners) listener();
}
export function formatSelection(selection) {
  if (!selection) return '尚未選擇';
  const platform = getPlatform(selection.platformId);
  if (!platform) return '尚未選擇';
  const branch = platform.subflows.find((s) => s.id === selection.branch);
  return branch ? `${platform.name} · ${branch.name}` : platform.name;
}
export function selectionBranch(platform, automatic, retained = null) {
  if (platform.strategy === 'byDomain') return automatic?.platformId === platform.id ? automatic.branch : null;
  if (platform.strategy === 'manual') return platform.subflows.some((s) => s.id === retained) ? retained : null;
  return null;
}
