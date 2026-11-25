import { createHomeDisclosure } from './home-disclosure.js';
import { createEncyclopediaDetail } from './encyclopedia-detail.js';
import { createDisclosureMotion } from './disclosure-motion.js';
import { HOME_MODULES } from '../features/home/preferences.js';
import { PLATFORMS, subscribePlatforms } from '../features/platforms/catalog.js';
import { homeRules, ruleContext, ruleScope, searchRules } from '../features/rules/query.js';
import { createRuleView } from './rule-view.js';
import { createNotesView } from './notes-view.js';
import { catalogRules, effectiveRules } from '../features/rules/runtime.js';

export function createWorkspaceView(document, rules, notesView = createNotesView(document)) {
  const ids = ['text-size', 'panel-content', 'home-page', 'encyclopedia-page', 'notes-page', 'import-page',
    'nav-home', 'nav-encyclopedia', 'nav-notes', 'nav-import', 'home-settings',
    'settings-toggle', 'home-preference-status', 'toggle-manualContext', 'encyclopedia-search', 'encyclopedia-platform',
    'encyclopedia-category', 'encyclopedia-clear', 'encyclopedia-results', 'encyclopedia-count',
    ...Object.keys(HOME_MODULES).flatMap((key) => [`module-${key}`, `toggle-${key}`]),
    'home-attention', 'home-sop', 'home-checklist', 'home-notes'];
  const elements = Object.fromEntries(ids.map((id) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Assistant 缺少畫面元素：${id}`);
    return [id, node];
  }));
  const { text, card } = createRuleView(document);
  const homeDisclosure = createHomeDisclosure(document);
  const moduleAlerts = new Map();
  for (const key of Object.keys(HOME_MODULES)) {
    const root = elements['module-' + key];
    const heading = root.querySelector?.('h2');
    if (!heading) continue;
    const content = [...root.children].filter(node => node !== heading);
    const summary = document.createElement('span'); summary.textContent = heading.textContent;
    const alerts = document.createElement('span'); alerts.className = 'home-module-alert'; moduleAlerts.set(key, alerts);
    heading.replaceChildren();
    const shell = document.createElement('div');
    const disclosure = homeDisclosure.wrap(shell, [summary, alerts], content, 'home-module-body-' + key);
    heading.append(disclosure.button); root.replaceChildren(heading, disclosure.body);
  }
  function homeCard(rule) {
    const article = card(rule);
    const nodes = [...article.children];
    const summary = nodes.filter(node => node.tagName.toLowerCase() === 'h3' || ['rule-condition', 'rule-meta'].includes(node.className));
    homeDisclosure.wrap(article, summary, nodes.filter(node => !summary.includes(node)));
    return article;
  }
  let contextKey;
  let manualContextKey;
  const checked = new Set();
  let unbind = () => {};
  let activePage = 'home';
  let platformState = null;
  let ruleset = null;
  let manual = { productTypeIds: null, facts: {} };
  let selectedTypes = [];
  let manualVisible = false;
  let manualGeneration = 0;
  let openedResult = null, readingId = null, searchGeneration = 0;
  const motion = createDisclosureMotion(document);
  let renderDetail = createEncyclopediaDetail(document, null, motion);
  const manualPanel = document.getElementById('manual-context');
  const manualOptions = document.getElementById('manual-options');
  function rebuildManual() {
    const generation = ++manualGeneration;
    manualPanel.hidden = !manualVisible || !['3.0.0', '3.1.0'].includes(ruleset?.schemaVersion);
    manualOptions.replaceChildren();
    if (manualPanel.hidden) return;
    const confirmed = document.createElement('input');
    const factControls = [];
    confirmed.type = 'checkbox'; confirmed.checked = manual.productTypeIds !== null;
    const label = document.createElement('label'); label.append(confirmed, text('span', '已確認完整商品品類（未選任何品類表示已確認沒有）'));
    manualOptions.append(label);
    confirmed.addEventListener('change', () => {
      if (generation !== manualGeneration) return;
      manual.productTypeIds = confirmed.checked ? [...selectedTypes] : null; renderHome(platformState);
    });
    manualOptions.append(text('p', '先選品類，再勾選完整確認。修改選擇後需重新確認；未確認前仍為未知。'));
    for (const type of ruleset.productTypes) {
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selectedTypes.includes(type.id);
      const row = document.createElement('label'); row.append(input, text('span', type.name)); manualOptions.append(row);
      input.addEventListener('change', () => {
        if (generation !== manualGeneration) return;
        const selected = new Set(selectedTypes);
        if (input.checked) selected.add(type.id); else selected.delete(type.id);
        selectedTypes = [...selected]; manual = { productTypeIds: null, facts: {} };
        confirmed.checked = false;
        for (const control of factControls) control.value = '';
        renderHome(platformState);
      });
    }
    for (const fact of ruleset.facts) {
      const row = document.createElement('label'), select = document.createElement('select');
      const unknown = text('option', '待確認'); unknown.value = ''; select.append(unknown);
      for (const value of fact.values) { const option = text('option', value); option.value = value; select.append(option); }
      select.value = manual.facts[fact.id] ?? '';
      factControls.push(select);
      row.append(text('span', fact.name), select); manualOptions.append(row);
      select.addEventListener('change', () => {
        if (generation !== manualGeneration) return;
        if (select.value) manual.facts[fact.id] = select.value; else delete manual.facts[fact.id]; renderHome(platformState);
      });
    }
  }
  const scrollPositions = { home: 0, encyclopedia: 0, notes: 0, import: 0 };
  const navIds = { home: 'nav-home', encyclopedia: 'nav-encyclopedia', notes: 'nav-notes', import: 'nav-import' };
  function rebuildPlatforms() {
    const previous = elements['encyclopedia-platform'].value;
    const all = text('option', '全部平台（含通用）');
    all.value = '';
    elements['encyclopedia-platform'].replaceChildren(all);
    for (const platform of PLATFORMS) {
      const option = text('option', platform.name);
      option.value = platform.id;
      elements['encyclopedia-platform'].append(option);
    }
    elements['encyclopedia-platform'].value = PLATFORMS.some((p) => p.id === previous) ? previous : '';
  }
  rebuildPlatforms();
  const unsubscribeCatalog = subscribePlatforms(() => { rebuildPlatforms(); renderSearch(true); renderHome(platformState); });
  function rebuildCategories() {
    const previous = elements['encyclopedia-category'].value;
    const all = text('option', '全部分類');
    all.value = '';
    elements['encyclopedia-category'].replaceChildren(all);
    const categories = [...new Set(rules.map((rule) => rule.category))].sort();
    for (const category of categories) {
      const option = text('option', category);
      option.value = category;
      elements['encyclopedia-category'].append(option);
    }
    elements['encyclopedia-category'].value = categories.includes(previous) ? previous : '';
  }

  function navigate(page) {
    scrollPositions[activePage] = elements['panel-content'].scrollTop;
    for (const name of Object.keys(navIds)) elements[`${name}-page`].hidden = name !== page;
    for (const [name, id] of Object.entries(navIds)) {
      const selected = name === page;
      if (selected) elements[id].setAttribute('aria-current', 'page');
      else elements[id].removeAttribute('aria-current');
    }
    activePage = page;
    elements['panel-content'].scrollTop = scrollPositions[activePage];
    elements[navIds[page]].focus({ preventScroll: true });
  }

  function renderSearch() {
    motion.finishAll();
    const generation = ++searchGeneration;
    const scroll = elements['panel-content'].scrollTop;
    const results = searchRules(rules, elements['encyclopedia-search'].value,
      elements['encyclopedia-platform'].value, elements['encyclopedia-category'].value);
    elements['encyclopedia-count'].textContent = `共 ${results.length} 則 SOP`;
    if (!results.some(rule => rule.id === readingId)) readingId = null;
    openedResult = null;
    const close = row => {
      row.button.setAttribute('aria-expanded', 'false'); row.arrow.textContent = '▸';
      motion.hide(row.detail, () => row.detail.replaceChildren());
    };
    const open = row => {
      row.button.setAttribute('aria-expanded', 'true'); row.arrow.textContent = '▾';
      row.detail.hidden = false;
      row.detail.replaceChildren(renderDetail(row.rule, row.detail.id,
        () => generation === searchGeneration && readingId === row.rule.id && !row.detail.hidden));
      motion.show(row.detail);
      openedResult = row;
    };
    const cards = results.map((rule, index) => {
      const root = document.createElement('div'); root.className = 'encyclopedia-result';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'encyclopedia-result-toggle';
      const arrow = text('span', '▸'); arrow.setAttribute('aria-hidden', 'true');
      button.append(arrow, text('span', `${rule.title} · ${ruleScope(rule)}`));
      const detail = document.createElement('div'); detail.className = 'encyclopedia-inline'; detail.id = 'encyclopedia-inline-' + generation + '-' + index; detail.hidden = true;
      button.setAttribute('aria-controls', detail.id); button.setAttribute('aria-expanded', 'false');
      const row = { rule, button, arrow, detail };
      button.addEventListener('click', () => {
        if (generation !== searchGeneration) return;
        motion.finishAll();
        const wasOpen = openedResult === row;
        if (openedResult) close(openedResult);
        openedResult = null; readingId = wasOpen ? null : rule.id;
        if (!wasOpen) open(row);
      });
      root.append(button, detail);
      if (readingId === rule.id) open(row);
      return root;
    });
    elements['encyclopedia-results'].replaceChildren(...(cards.length ? cards : [text('p',
      rules.length ? '找不到符合的 SOP' : '尚未配置正式規則資料；找不到符合的 SOP。')]));
    elements['panel-content'].scrollTop = scroll;
  }

  function renderHome(state) {
    platformState = state;
    const nextKey = JSON.stringify(ruleContext(state));
    if (contextKey !== nextKey) {
      checked.clear();
      contextKey = nextKey;
    }
    const nextManualKey = JSON.stringify([ruleContext(state), state?.tabContext?.tabId ?? null, state?.tabContext?.url ?? null]);
    if (manualContextKey !== nextManualKey) {
      manualContextKey = nextManualKey;
      selectedTypes = []; manual = { productTypeIds: null, facts: {} }; rebuildManual();
    }
    for (const section of ['attention', 'sop']) {
      const applicable = ruleset ? effectiveRules(ruleset, state, section, manual) : homeRules(rules, state, section);
      const alert = moduleAlerts.get(section);
      if (alert) alert.textContent = applicable.some(rule => rule.priority === 'high' || rule.condition?.pending) ? ' · 含高優先／待確認提醒' : '';
      elements[`home-${section}`].replaceChildren(...(applicable.length ? applicable.map(homeCard) :
        [text('p', section === 'attention' ? '目前沒有高優先提醒' : '目前沒有正式平台 SOP')]));
    }
    const checklist = ruleset ? effectiveRules(ruleset, state, 'checklist', manual) : homeRules(rules, state, 'checklist');
    const checklistAlert = moduleAlerts.get('checklist');
    if (checklistAlert) checklistAlert.textContent = checklist.some(rule => rule.priority === 'high' || rule.condition?.pending) ? ' · 含高優先／待確認提醒' : '';
    const items = checklist.map((rule) => {
      const item = document.createElement('div');
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.disabled = rule.inactive === true;
      const ruleKey = JSON.stringify([rule.platformId ?? null, rule.id]);
      if (rule.inactive) checked.delete(ruleKey);
      input.checked = checked.has(ruleKey);
      input.addEventListener('change', () => {
        if (input.checked) checked.add(ruleKey);
        else checked.delete(ruleKey);
      });
      label.append(input, text('span', rule.title));
      item.append(label, homeCard(rule));
      return item;
    });
    elements['home-checklist'].replaceChildren(...(items.length ? items : [text('p', '目前沒有檢查事項')]));
    notesView.renderPlatform(state);
  }

  rebuildCategories();
  renderSearch();
  renderHome(null);
  return {
    getPlatformId: () => platformState?.current?.platformId,
    renderPlatform: renderHome,
    setRules(nextRules) { ruleset = null; renderDetail = createEncyclopediaDetail(document, null, motion); rules = structuredClone(nextRules); checked.clear(); rebuildCategories(); renderSearch(); renderHome(platformState); },
    setRuleset(next) {
      ruleset = structuredClone(next); rules = catalogRules(ruleset); renderDetail = createEncyclopediaDetail(document, ruleset, motion); checked.clear();
      selectedTypes = []; manual = { productTypeIds: null, facts: {} }; rebuildManual(); rebuildCategories(); renderSearch(true); renderHome(platformState);
    },
    renderPreferences(preferences, ready) {
      elements['text-size'].value = String(preferences.textSize);
      elements['text-size'].disabled = !ready;
      document.documentElement.style.setProperty('--text-scale', String(preferences.textSize / 100));
      for (const key of Object.keys(HOME_MODULES)) {
        elements[`toggle-${key}`].checked = preferences[key];
        elements[`toggle-${key}`].disabled = !ready;
        elements[`module-${key}`].hidden = !preferences[key];
      }
      elements['toggle-manualContext'].checked = preferences.manualContext === true;
      elements['toggle-manualContext'].disabled = !ready;
      const nextVisible = preferences.manualContext === true;
      if (manualVisible !== nextVisible) {
        manualVisible = nextVisible;
        selectedTypes = []; manual = { productTypeIds: null, facts: {} };
        rebuildManual(); renderHome(platformState);
      }
    },
    reportStatus(message, error = false) {
      elements['home-preference-status'].textContent = message;
      elements['home-preference-status'].setAttribute('role', error ? 'alert' : 'status');
    },
    bind(onPreference, onTextSize, onEnterNotes = () => {}) {
      const removers = [];
      const listen = (id, event, callback) => {
        elements[id].addEventListener(event, callback);
        removers.push(() => elements[id].removeEventListener(event, callback));
      };
      listen('nav-home', 'click', () => navigate('home'));
      listen('nav-encyclopedia', 'click', () => navigate('encyclopedia'));
      listen('nav-import', 'click', () => navigate('import'));
      listen('nav-notes', 'click', () => {
        navigate('notes');
        notesView.enterNotes(platformState?.current?.platformId);
        onEnterNotes();
      });
      listen('settings-toggle', 'click', () => {
        const open = !elements['home-settings'].hidden;
        elements['home-settings'].hidden = open;
        elements['settings-toggle'].setAttribute('aria-expanded', String(!open));
      });
      for (const key of [...Object.keys(HOME_MODULES), 'manualContext']) {
        listen(`toggle-${key}`, 'change', () => { void onPreference(key, elements[`toggle-${key}`].checked); });
      }
      listen('text-size', 'change', () => { void onTextSize(Number(elements['text-size'].value)); });
      listen('encyclopedia-search', 'input', renderSearch);
      listen('encyclopedia-platform', 'change', renderSearch);
      listen('encyclopedia-category', 'change', renderSearch);
      listen('encyclopedia-clear', 'click', () => {
        for (const id of ['encyclopedia-search', 'encyclopedia-platform', 'encyclopedia-category']) elements[id].value = '';
        renderSearch();
      });
      unbind();
      unbind = () => removers.forEach((remove) => remove());
      return unbind;
    },
    dispose() { homeDisclosure.dispose(); searchGeneration++; motion.dispose(); manualGeneration++; unbind(); unsubscribeCatalog(); checked.clear(); },
  };
}
