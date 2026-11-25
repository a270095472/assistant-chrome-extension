import { configurePlatforms, DEFAULT_PLATFORMS } from '../platforms/catalog.js';
import { compareRulesets } from '../import/compare.js';
import { BUILTIN_DEMO } from './builtin-demo.js';

// All state here is session-local. Nothing stores a historical SOP or touches
// note drafts / display preferences. Duplicate reads never replay notices.
export function createCurrentController({ client, workspace, notify, reportError }) {
  let current = null, revision, started = false;
  const unsubscribe = client.subscribe((result, changed) => {
    if (!result.ok) { reportError(result.code); return; }
    reportError(null);
    const snapshot = result.snapshot;
    if (!changed && started || started && snapshot.revision === revision) return;
    const previous = current;
    const selectedPlatform = workspace.getPlatformId?.();
    if (snapshot.current) {
      workspace.setRuleset(snapshot.current);
      configurePlatforms(snapshot.current.platforms);
    } else {
      // Session-only demo fallback: never write or impersonate stored Current.
      workspace.setRuleset(BUILTIN_DEMO); configurePlatforms(DEFAULT_PLATFORMS);
    }
    current = structuredClone(snapshot.current); revision = snapshot.revision;
    if (started || current) {
      const comparison = current ? compareRulesets(previous, current) : null;
      const removed = comparison?.changes.filter((c) => c.action === 'removed' && c.identity[1] === 'rule') ?? [];
      const removedPlatforms = (previous?.platforms ?? []).filter((p) => p.enabled !== false &&
        !current?.platforms.some((next) => next.id === p.id && next.enabled !== false));
      if (started && current) notify(current.rulesetVersion, removed,
        { removedPlatforms, selectedPlatformRemoved: removedPlatforms.some((p) => p.id === selectedPlatform) });
    }
    started = true;
  });
  return { dispose: unsubscribe };
}
