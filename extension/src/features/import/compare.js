import { validateCandidate } from './validate.js';
import { layeredContract, documentRules31 } from './contract.js';

// All arrays in the v3 replace contract are sets. Display order is explicit
// (order / placements), so array order and object key order are not identity.
export function canonicalContent(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize).sort((a, b) => {
      const left = JSON.stringify(a), right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    if (item && typeof item === 'object') return Object.fromEntries(
      Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    return item;
  };
  return JSON.stringify(normalize(value));
}

const ruleIdentity = (rule) => [rule.scope.kind,
  rule.scope.platformId ?? rule.scope.productTypeId ?? '', rule.id];
const key = (parts) => JSON.stringify(parts);
// Static scope only: runtime product/fact conditions remain human-confirmed.
export function scopedPlatforms(data, kind, value) {
  if (!data || !value) return [];
  if (kind === 'platform') return [value.id];
  const owner = value.scope?.kind === 'platform' ? value.scope.platformId : value.platformId ??
    (value.target?.kind === 'platform' ? value.target.platformId : null);
  return data.platforms.map((p) => p.id).filter((id) => (!owner || owner === id) &&
    (!value.appliesTo?.platformIds || value.appliesTo.platformIds.includes(id)));
}
const compareVersion = (left, right) => {
  const a = left.split('.').map(BigInt), b = right.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
};

function collections(data) {
  const result = new Map([
    ['global', { version: data.versions.global, content: data.rules.filter((r) => r.scope.kind === 'global') }],
    ['exceptions', { version: data.versions.exceptions, content: data.exceptions }],
    ['catalogs', { version: data.versions.catalogs, content: {
      sources: data.sources, productTypes: data.productTypes, facts: data.facts } }],
  ]);
  for (const p of data.platforms) result.set(`platforms/${p.id}`, {
    version: data.versions.platforms[p.id], content: { platform: p,
      rules: data.rules.filter((r) => r.scope.kind === 'platform' && r.scope.platformId === p.id) } });
  for (const p of data.productTypes) result.set(`productTypes/${p.id}`, {
    version: data.versions.productTypes[p.id], content: data.rules.filter(
      (r) => r.scope.kind === 'productType' && r.scope.productTypeId === p.id) });
  return result;
}

function entries(data) {
  if (!data) return new Map();
  if (data.schemaVersion === '2.0.0') return new Map([
    ...data.platforms.map((p) => [key(['2.0.0', 'platform', p.id]), p]),
    ...data.rules.map((r) => [key(['2.0.0', 'rule', r.platformId ? 'platform' : 'global', r.platformId ?? '', r.id]), r]),
  ]);
  return new Map([
    ...data.platforms.map((p) => [key([data.rulesetId, 'platform', p.id]), p]),
    ...data.productTypes.map((p) => [key([data.rulesetId, 'productType', p.id]), p]),
    ...data.sources.map((s) => [key([data.rulesetId, 'source', s.id, s.documentVersion]), s]),
    ...data.facts.map((f) => [key([data.rulesetId, 'fact', f.id]), f]),
    ...data.rules.map((r) => [key([data.rulesetId, 'rule', ...ruleIdentity(r)]), r]),
    ...data.exceptions.map((e) => [key([data.rulesetId, 'exception', e.id]), e]),
  ]);
}

// Pure preview: accepts complete validated replace snapshots, never publishes
// Current, mutates inputs, writes storage, or decides unapproved switch policy.
export function compareRulesets(current, input) {
  const invalid = (code, errors = []) => ({ status: code, errors, changes: [], collections: [], conflicts: [] });
  if (input?.mode !== 'replace') return invalid('replace-required');
  const checked = validateCandidate(input);
  if (!checked.ok) return invalid('invalid-candidate', checked.errors);
  if (current != null) {
    if (current.mode !== 'replace') return invalid('invalid-current');
    const baseline = validateCandidate(current);
    if (!baseline.ok) return invalid('invalid-current', baseline.errors);
  }
  const candidate = checked.candidate;
  const mixed = current && layeredContract(current) && layeredContract(candidate) && current.schemaVersion !== candidate.schemaVersion;
  const comparable = value => mixed && value?.schemaVersion === '3.0.0' ? documentRules31(value) : value;
  const before = entries(comparable(current)), after = entries(comparable(candidate));
  const changes = [];
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(id), next = after.get(id);
    if (canonicalContent(old) === canonicalContent(next)) continue;
    const fields = old && next ? [...new Set([...Object.keys(old), ...Object.keys(next)])].sort()
      .filter((field) => canonicalContent(old[field]) !== canonicalContent(next[field])) : [];
    changes.push({ identity: JSON.parse(id), action: old === undefined ? 'added' : next === undefined ? 'removed' : 'modified', fields,
      before: old === undefined ? null : structuredClone(old), after: next === undefined ? null : structuredClone(next) });
  }
  const compatibleLayers = layeredContract(current) && layeredContract(candidate) && current.rulesetId === candidate.rulesetId;
  const oldCollections = compatibleLayers ? collections(comparable(current)) : new Map();
  const nextCollections = layeredContract(candidate) ? collections(comparable(candidate)) : new Map(), changedCollections = [], conflicts = [], warnings = [];
  for (const id of [...new Set([...oldCollections.keys(), ...nextCollections.keys()])].sort()) {
    const old = oldCollections.get(id), next = nextCollections.get(id);
    const contentChanged = canonicalContent(old?.content) !== canonicalContent(next?.content);
    if (contentChanged || old?.version !== next?.version) changedCollections.push({
      id, before: old?.version ?? null, after: next?.version ?? null, contentChanged });
    if (old && next && contentChanged && old.version === next.version) conflicts.push({ id, reason: 'same-version-different-content' });
    if (old && next && compareVersion(next.version, old.version) < 0) warnings.push({ id, reason: 'downgrade' });
  }
  const equal = current != null && canonicalContent(current) === canonicalContent(candidate);
  if (current && !equal && current.rulesetVersion === candidate.rulesetVersion)
    conflicts.push({ id: 'rulesetVersion', reason: 'same-version-different-content' });
  if (current && compareVersion(candidate.rulesetVersion, current.rulesetVersion) < 0)
    warnings.push({ id: 'rulesetVersion', reason: 'downgrade' });
  for (const change of changes) change.platformIds = [...new Set([
    ...scopedPlatforms(current, change.identity[1], change.before),
    ...scopedPlatforms(candidate, change.identity[1], change.after),
  ])].sort();
  const countRules = (data) => {
    const counts = new Map();
    for (const rule of data?.rules ?? []) for (const id of scopedPlatforms(data, 'rule', rule)) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  };
  const oldCounts = countRules(current), nextCounts = countRules(candidate);
  const platformStatistics = [...new Set([...(current?.platforms ?? []).map((p) => p.id), ...candidate.platforms.map((p) => p.id)])]
    .sort().map((id) => ({ id, name: candidate.platforms.find((p) => p.id === id)?.name ?? current.platforms.find((p) => p.id === id)?.name,
      before: oldCounts.get(id) ?? 0, after: nextCounts.get(id) ?? 0,
      changes: Object.fromEntries(['added', 'modified', 'removed'].map((action) => [action,
        changes.filter((c) => c.identity[1] === 'rule' && c.action === action && c.platformIds.includes(id)).length])),
      affected: changes.some((c) => c.platformIds.includes(id)) }));
  return { status: conflicts.length ? 'conflict' : equal ? 'identical' : current ? 'changed' : 'initial',
    current: current ? { rulesetId: current.rulesetId, schemaVersion: current.schemaVersion, rulesetVersion: current.rulesetVersion } : null,
    candidate: { rulesetId: candidate.rulesetId, schemaVersion: candidate.schemaVersion, rulesetVersion: candidate.rulesetVersion },
    changes, platformStatistics, collections: changedCollections, conflicts, warnings, errors: [],
    statistics: { before: { platforms: current?.platforms.length ?? 0, rules: current?.rules.length ?? 0 },
      after: { platforms: candidate.platforms.length, rules: candidate.rules.length } },
    // Catalogs, globals, product-type rules and exceptions can affect multiple
    // platforms. Report a conservative union until runtime context is supplied.
    potentiallyAffectedPlatforms: [...new Set([
      ...(current?.platforms ?? []).map((p) => p.id), ...candidate.platforms.map((p) => p.id),
    ])].filter((id) => changes.length && (!compatibleLayers || changedCollections.some((c) => !c.id.startsWith('platforms/')) ||
      changedCollections.some((c) => c.id === `platforms/${id}`))).sort(),
    // Exact canonical snapshot binds a future preview to its baseline; it is
    // not a storage transaction or a cross-window compare-and-swap guarantee.
    baseline: current == null ? null : canonicalContent(current) };
}
