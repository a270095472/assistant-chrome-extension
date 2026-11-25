import { createRuleView } from './rule-view.js';

// Presentation-only join using the catalog's complete identity contract.
// Search keeps the existing catalog projection; no matching or SOP data changes.
export function createEncyclopediaDetail(document, data, motion = {
  finishAll() {}, show(node) { node.hidden = false; }, hide(node, cleanup) { node.hidden = true; cleanup(); },
}) {
  const { text, card } = createRuleView(document);
  const entries = new Map();
  for (const r of data?.rules ?? []) entries.set(JSON.stringify([data.rulesetId ?? '2.0.0',
    r.scope?.kind ?? (r.platformId ? 'platform' : 'global'),
    r.scope?.platformId ?? r.scope?.productTypeId ?? r.platformId ?? '', r.id]), { raw: r, kind: '規則' });
  for (const e of data?.exceptions ?? []) entries.set(JSON.stringify([data.rulesetId, 'exception', e.id]), { raw: e, kind: '例外' });
  const dictionary = (items) => new Map((items ?? []).map(item => [item.id, item]));
  const platforms = dictionary(data?.platforms), types = dictionary(data?.productTypes), facts = dictionary(data?.facts);
  const uncertain = '條件需進一步確認';
  const names = (value, dict, label) => {
    if (value === null) return label + '：未設定此項限制；仍須符合其他條件。';
    if (!Array.isArray(value) || value.length === 0) return label + '：' + uncertain + '（未提供或空清單）。';
    return label + '（任一符合）：' + value.map(id => dict.get(id)?.name ?? (uncertain + '（未知識別碼：' + id + '）')).join('、');
  };
  function conditions(applies) {
    if (!applies || typeof applies !== 'object') return [uncertain + '（未提供適用條件）。'];
    const rows = [names(applies.platformIds, platforms, '平台'), names(applies.productTypeIds, types, '商品品類')];
    if (applies.subflowRefs === null) rows.push('流程：未設定此項限制；仍須符合其他條件。');
    else if (!Array.isArray(applies.subflowRefs) || !applies.subflowRefs.length) rows.push('流程：' + uncertain + '（未提供或空清單）。');
    else rows.push('流程（任一符合）：' + applies.subflowRefs.map(ref => {
      const p = platforms.get(ref?.platformId), flow = p?.subflows.find(f => f.id === ref.branchId);
      return p && flow ? p.name + '／' + flow.name : uncertain + '（未知流程）';
    }).join('、'));
    if (!Array.isArray(applies.whenAll)) rows.push('人工條件：' + uncertain + '（未提供）。');
    else if (!applies.whenAll.length) rows.push('人工條件：未設定額外的事實條件。');
    else rows.push('下列人工條件須全部符合：' + applies.whenAll.map(c => {
      const fact = facts.get(c?.factId);
      return fact?.values.includes(c.equals) ? fact.name + ' = ' + c.equals : uncertain + '（未知條件或值）';
    }).join('；'));
    return rows;
  }
  return (rule, id, isActive) => {
    const entry = entries.get(rule.id), raw = entry?.raw;
    let display = { ...rule, originalId: rule.originalId ?? rule.id }, summaries = [], technical = null, target;
    if (raw) {
      const v3 = ['3.0.0', '3.1.0'].includes(data.schemaVersion);
      display = { ...rule, content: entry.kind === '例外' ? raw.replacement?.content ?? '例外效果：不適用（依適用條件判定）。' : raw.content };
      if (v3) summaries = conditions(raw.appliesTo);
      else summaries = ['平台／流程：' + (raw.platformId ? (platforms.get(raw.platformId)?.name ?? uncertain) : '通用規則') +
        (raw.branch ? '／' + (platforms.get(raw.platformId)?.subflows.find(f => f.id === raw.branch)?.name ?? uncertain) : '；未指定流程限制。')];
      if (raw.target) {
        target = entries.get(JSON.stringify([data.rulesetId, raw.target.kind, raw.target.platformId ?? '', raw.target.ruleId]))?.raw;
        summaries.push('例外目標：' + (target ? target.title + '（' + target.id + '）' : uncertain));
        summaries.push('例外效果：' + (raw.action === 'replace' ? '條件符合時替換目標規則' : '條件符合時目標規則不適用') + '；原因：' + raw.reason);
      }
      if (Array.isArray(raw.exceptions) && raw.exceptions.length) summaries.push('參照的通用規則 ID：' + raw.exceptions.join('、'));
      technical = { schemaVersion: data.schemaVersion, catalogIdentity: rule.id };
      for (const key of ['id', 'scope', 'appliesTo', 'placements', 'target', 'action', 'sourceRefs', 'exceptions', 'platformId', 'branch', 'sections', 'order']) {
        if (Object.hasOwn(raw, key)) technical[key] = raw[key];
      }
      if (raw.replacement) technical.replacement = raw.replacement;
    } else if (data) {
      // Never parse a decorated catalog body to guess where the real SOP ends.
      display = { ...rule, content: uncertain + '；無法可靠對應正文，請檢查技術資訊。' };
      technical = rule; summaries = [uncertain];
    }
    const placements = raw?.replacement?.placements ?? raw?.placements ?? target?.placements;
    const modules = placements?.map(p => p.section) ?? rule.sections;
    const article = card(display, { summaries, modules, kind: entry?.kind ?? (!data ? '規則' : undefined) });
    if (technical) {
      const toggle = text('button', '技術資訊（進階）'); toggle.type = 'button'; toggle.className = 'encyclopedia-technical-toggle';
      const container = document.createElement('div'); container.className = 'encyclopedia-technical-panel'; container.id = id + '-technical'; container.hidden = true;
      toggle.setAttribute('aria-controls', container.id); toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        if (!isActive()) return;
        motion.finishAll();
        const opening = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(opening));
        if (opening) {
          const pre = text('pre', JSON.stringify(technical, null, 2)); pre.className = 'encyclopedia-technical'; container.replaceChildren(pre); motion.show(container);
        } else motion.hide(container, () => container.replaceChildren());
      });
      article.append(toggle, container);
    }
    return article;
  };
}
