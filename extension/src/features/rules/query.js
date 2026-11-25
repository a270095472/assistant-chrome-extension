import { getPlatform, selectionBranch } from '../platforms/catalog.js';

// 缺少／不合法的內部 order 明確排在最後；字典序不依地區設定。
export function sortRules(rules) {
  const order = (rule) => Number.isFinite(rule.order) ? rule.order : Infinity;
  return [...rules].sort((a, b) => {
    const difference = order(a) - order(b);
    if (difference && !Number.isNaN(difference)) return difference;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function ruleContext(state) {
  const current = state?.current;
  if (!current) return null;
  // 歷史 Official 品牌不能冒充目前網址辨識結果，沿用 M1 邊界。
  return {
    platformId: current.platformId,
    branch: getPlatform(current.platformId) ? selectionBranch(getPlatform(current.platformId), state.automatic, current.branch) : null,
  };
}

export function appliesTo(rule, context) {
  if (!rule.platformId) return !rule.branch;
  if (!getPlatform(rule.platformId)) return false;
  return rule.platformId === context?.platformId &&
    (!rule.branch || rule.branch === context?.branch ||
      (getPlatform(rule.platformId)?.strategy === 'showAll' && getPlatform(rule.platformId).subflows.some((s) => s.id === rule.branch)));
}

export function homeRules(rules, state, section) {
  const context = ruleContext(state);
  return sortRules(rules.filter((rule) => appliesTo(rule, context) &&
    (section === 'attention' ? rule.priority === 'high' : rule.sections.includes(section))));
}

export function searchRules(rules, query = '', platformId = '', category = '') {
  const term = query.trim().toLowerCase();
  return sortRules(rules.filter((rule) => {
    const text = [rule.title, rule.content, rule.category,
      ...rule.sources.flatMap((source) => [source.name, source.url, source.section])]
      .filter(Boolean).join('\n').toLowerCase();
    return (!term || text.includes(term)) && (!platformId || !rule.platformId || rule.platformId === platformId) &&
      (!category || rule.category === category);
  }));
}

export function ruleScope(rule) {
  if (rule.scopeLabel) return rule.scopeLabel;
  if (!rule.platformId) return '通用';
  const name = getPlatform(rule.platformId)?.name ?? rule.platformId;
  return rule.branch ? `${name} · ${getPlatform(rule.platformId)?.subflows.find((s) => s.id === rule.branch)?.name ?? rule.branch}` : name;
}

export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
