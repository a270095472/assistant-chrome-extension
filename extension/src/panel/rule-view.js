import { ruleScope, safeSourceUrl } from '../features/rules/query.js';

export function createRuleView(document) {
  function text(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }
  function card(rule, { summaries = [], modules, kind } = {}) {
    const article = document.createElement('article');
    const conditionState = rule.condition?.inactive ? 'inactive' : rule.condition?.pending ? 'pending' : rule.condition?.applied ? 'applied' : null;
    article.className = 'rule-card' + (['high', 'medium'].includes(rule.priority) ? ' rule-priority-' + rule.priority : '') +
      (rule.inactive ? ' rule-inactive' : '') + (conditionState ? ' rule-state-' + conditionState : '');
    article.append(text('h3', rule.title));
    if (rule.condition) {
      const statuses = document.createElement('div'); statuses.className = 'rule-condition';
      const badge = (value, name) => { const node = text('span', value); node.className = 'condition-badge condition-' + name; statuses.append(node); };
      if (rule.condition.inactive) badge('不適用', 'inactive');
      else if (rule.condition.applied) badge('條件已套用', 'applied');
      if (rule.condition.pending) badge('待確認', 'pending');
      article.append(statuses);
      if (rule.condition.replacement) article.append(text('p', '取代原規則：' + rule.condition.replacement.originalTitle + '（' + rule.condition.replacement.originalId + '）'));
      for (const reason of rule.condition.reasons) article.append(text('p', '生效依據：' + reason.id + ' · ' + reason.reason));
    }
    const meta = text('p', `${ruleScope(rule)} · ${rule.category}`); meta.className = 'rule-meta';
    if (kind) meta.append(text('span', ' · 類型：' + kind));
    if (modules) meta.append(text('span', ' · 適用模組：' + modules.map(s => ({ attention: '高優先提醒', sop: '平台 SOP', checklist: '檢查清單' })[s] ?? s).join('、')));
    if (['high', 'medium'].includes(rule.priority)) {
      const priority = text('span', ' · 優先級：' + (rule.priority === 'high' ? '高' : '中'));
      priority.className = 'rule-priority'; meta.append(priority);
    }
    else if (kind) meta.append(text('span', ' · 優先級：' + (rule.priority ?? '未提供')));
    const body = text('p', rule.content); body.className = 'rule-body';
    article.append(meta, body);
    if (summaries.length) {
      const conditions = document.createElement('section'); conditions.className = 'rule-applicability';
      conditions.append(text('h4', '適用條件'));
      const list = document.createElement('ul'); for (const summary of summaries) list.append(text('li', summary));
      conditions.append(list); article.append(conditions);
    }
    if (rule.originalId) { const id = text('p', '規則 ID：' + rule.originalId); id.className = 'rule-id'; article.append(id); }
    const sources = document.createElement('div');
    sources.className = 'rule-sources';
    if (rule.sources.length === 0) sources.append(text('p', rule.originLabel ?? '未提供來源'));
    for (const source of rule.sources) {
      const row = document.createElement('p');
      const url = safeSourceUrl(source.url);
      row.append(text('span', [source.name, source.section].filter(Boolean).join(' · ') || '未提供來源名稱'));
      if (url) {
        const link = text('a', source.url);
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.append(text('span', ' '), link);
      } else if (source.url) row.append(text('span', ` ${source.url}（無可用的安全連結）`));
      sources.append(row);
    }
    article.append(sources);
    return article;
  }
  return { text, card };
}
