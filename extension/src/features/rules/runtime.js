import { getPlatform } from '../platforms/catalog.js';
import { homeRules, ruleContext } from './query.js';
import { canonicalContent } from '../import/compare.js';
import { layeredContract } from '../import/contract.js';

const identity = (data, r) => [data.rulesetId ?? '2.0.0', r.scope?.kind ?? (r.platformId ? 'platform' : 'global'),
  r.scope?.platformId ?? r.scope?.productTypeId ?? r.platformId ?? '', r.id];
const indexSources = (data) => new Map((data.sources ?? []).map((s) => [JSON.stringify([s.id, s.documentVersion]), s]));
const sourceRows = (sources, refs = []) => refs.map((r) => {
  const source = sources.get(JSON.stringify([r.sourceId, r.documentVersion]));
  return { name: (source?.title ?? r.sourceId) + '／' + r.sourceId + '／' + r.documentVersion,
    url: '', section: [source?.documentPath, r.policyId, r.locator].filter(Boolean).join(' · ') };
});
function project(data, rule, sources) {
  if (data.schemaVersion === '2.0.0') return { ...structuredClone(rule), id: JSON.stringify(identity(data, rule)), originalId: rule.id };
  return { id: JSON.stringify(identity(data, rule)), originalId: rule.id, title: rule.title, content: rule.content,
    platformId: rule.scope.kind === 'platform' ? rule.scope.platformId : null, branch: null,
    category: rule.category, priority: rule.priority, sections: rule.placements.map((p) => p.section),
    order: rule.placements[0].order, sources: sourceRows(sources, rule.sourceRefs),
    originLabel: rule.origin === 'selfAuthored' ? '自行制定；未引用文件' : undefined,
    scopeLabel: rule.scope.kind === 'productType' ? '品類：' + (data.productTypes.find((p) => p.id === rule.scope.productTypeId)?.name ?? rule.scope.productTypeId) : undefined };
}
export function catalogRules(data) {
  if (!data) return [];
  const sources = indexSources(data);
  const rules = data.rules.map((r) => ({ ...project(data, r, sources),
    content: r.content + (layeredContract(data) ? '\n適用條件（需人工確認）：' + JSON.stringify(r.appliesTo) : '') }));
  if (layeredContract(data)) for (const e of data.exceptions) rules.push({
    id: JSON.stringify([data.rulesetId, 'exception', e.id]), originalId: e.id,
    title: '例外 ' + e.id + '：' + (e.replacement?.title ?? '不適用'),
    content: (e.replacement?.content ?? '') + '\n目標：' + JSON.stringify(e.target) + '\n原因：' + e.reason +
      '\n適用條件（需人工確認）：' + JSON.stringify(e.appliesTo),
    platformId: null, branch: null, category: e.replacement?.category ?? 'workflow', priority: e.replacement?.priority ?? 'medium',
    order: e.replacement?.placements[0]?.order ?? 0, sections: [], sources: sourceRows(sources, e.sourceRefs), scopeLabel: '例外（依人工情境判定）',
  });
  return rules;
}

// Three-valued matching: false dominates unknown; no inferred labels or facts.
export function matchScope(applies, context, manual) {
  let unknown = false;
  if (applies.platformIds && !applies.platformIds.includes(context?.platformId)) return false;
  if (applies.subflowRefs) {
    if (!context?.branch) unknown = true;
    else if (!applies.subflowRefs.some((b) => b.platformId === context.platformId && b.branchId === context.branch)) return false;
  }
  if (applies.productTypeIds) {
    if (manual.productTypeIds === null) unknown = true;
    else if (!applies.productTypeIds.some((id) => manual.productTypeIds.includes(id))) return false;
  }
  for (const condition of applies.whenAll) {
    if (!Object.hasOwn(manual.facts, condition.factId)) unknown = true;
    else if (manual.facts[condition.factId] !== condition.equals) return false;
  }
  return unknown ? null : true;
}

export function effectiveRules(data, state, section, manual = { productTypeIds: null, facts: {} }) {
  if (!data) return [];
  const context = ruleContext(state);
  if (data.schemaVersion === '2.0.0') {
    const candidates = homeRules(data.rules, state, section);
    // V2 exceptions explicitly reference global originals. Retain both texts
    // for manual consultation, while indicating superseded global entries.
    const overridden = new Set(candidates.filter((r) => r.platformId).flatMap((r) => r.exceptions));
    return candidates.map((r) => ({ ...project(data, r),
      ...(r.platformId === null && overridden.has(r.id) ? { inactive: true, content: r.content + '\n本情境有平台例外，請參閱平台條文。' } : {}) }));
  }
  const platform = getPlatform(context?.platformId);
  const sources = indexSources(data), byTarget = new Map();
  const targetKey = (kind, platformId, ruleId) => JSON.stringify([kind, platformId ?? '', ruleId]);
  for (const e of data.exceptions) {
    const key = targetKey(e.target.kind, e.target.platformId, e.target.ruleId);
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push(e);
  }
  const contexts = platform?.strategy === 'showAll' ? [...platform.subflows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((b) => ({ ...context, branch: b.id })) : [context];
  const result = [];
  for (const flow of contexts) {
    const rows = [];
    for (const rule of data.rules) {
      if (rule.scope.kind === 'platform' && rule.scope.platformId !== flow?.platformId) continue;
      const match = matchScope(rule.appliesTo, flow, manual);
      if (match === false) continue;
      // Unconfirmed product rules are not asserted to apply, but remain
      // discoverable in the encyclopedia. Shared originals remain visible.
      if (rule.scope.kind === 'productType' && match !== true) continue;
      const exceptions = byTarget.get(targetKey(rule.scope.kind, rule.scope.platformId, rule.id)) ?? [];
      const matches = exceptions.filter((e) => match === true && matchScope(e.appliesTo, flow, manual) === true);
      const pending = match === null || exceptions.some((e) => matchScope(e.appliesTo, flow, manual) === null);
      const replacement = matches.find((e) => e.action === 'replace');
      const actual = replacement ? replacement.replacement : rule;
      const placement = actual.placements.find((p) => p.section === section);
      if (!placement) continue;
      const row = project(data, rule, sources);
      row.title = actual.title; row.content = actual.content; row.category = actual.category; row.priority = actual.priority;
      row.order = placement.order; row.sections = [section]; row.identity = identity(data, rule);
      row.id = JSON.stringify([...row.identity, flow?.platformId ?? '', flow?.branch ?? '']);
      // Display metadata comes from the same matches as the effective body.
      // It never participates in matching, priority, ordering or persistence.
      const manualRule = match === true && (rule.appliesTo.productTypeIds?.length || rule.appliesTo.whenAll.length);
      if (pending || matches.length || manualRule) row.condition = {
        pending,
        applied: matches.length > 0 || Boolean(manualRule),
        inactive: matches.some((e) => e.action === 'notApplicable'),
        replacement: replacement ? { originalId: rule.id, originalTitle: rule.title } : null,
        reasons: matches.map((e) => ({ id: e.id, reason: e.reason })),
      };
      if (matches.length) {
        row.content += '\n命中例外：' + matches.map((e) => e.id + '（' + e.reason + '）').join('、');
        const refs = new Map([...rule.sourceRefs, ...matches.flatMap((e) => e.sourceRefs)].map((r) => [canonicalContent(r), r]));
        row.sources = sourceRows(sources, [...refs.values()]);
      }
      if (matches.some((e) => e.action === 'notApplicable')) { row.inactive = true; row.content += '\n本情境不適用（原文保留供查閱）。'; }
      if (pending) row.content += '\n人工情境待確認；尚未確認的例外不套用。';
      if (platform?.strategy === 'showAll') row.title = (platform.subflows.find((b) => b.id === flow.branch)?.name ?? flow.branch) + '／' + row.title;
      rows.push(row);
    }
    rows.sort((a, b) => a.order - b.order || (JSON.stringify(a.identity) < JSON.stringify(b.identity) ? -1 : JSON.stringify(a.identity) > JSON.stringify(b.identity) ? 1 : 0));
    result.push(...rows);
  }
  return result;
}
