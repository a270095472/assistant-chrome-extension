import { PLATFORMS, formatSelection, getPlatform, subscribePlatforms, catalogGeneration } from '../features/platforms/catalog.js';
import { getExamplePrompts } from '../features/platforms/prompts.js';

const sources = { automatic: '網址自動辨識', manual: '本次手動選擇', lastValid: '上次有效平台', none: '尚未選擇' };

export function createPlatformView(document) {
  const required = (id) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Assistant 缺少畫面元素：${id}`);
    return element;
  };
  const elements = Object.fromEntries([
    'subflow-select', 'subflow-control', 'platform-current', 'platform-source', 'platform-auto', 'platform-manual',
    'platform-last', 'platform-select', 'platform-prompts', 'app-status', 'app-error', 'platform-detected',
  ].map((id) => [id, required(id)]));
  function rebuild() {
    elements['platform-select'].replaceChildren();
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = '請選擇平台'; empty.disabled = true;
    elements['platform-select'].append(empty);
    for (const platform of PLATFORMS) {
      const option = document.createElement('option');
      option.value = platform.id;
      option.textContent = platform.name;
      elements['platform-select'].append(option);
    }
  }
  rebuild();
  let lastGeneration = catalogGeneration();
  let lastTabContext = null;
  const unsubscribe = subscribePlatforms(rebuild);

  return {
    dispose: unsubscribe,
    bindSelect(onSelect, onBranch = () => {}) {
      const listener = () => { void onSelect(elements['platform-select'].value); };
      elements['platform-select'].addEventListener('change', listener);
      const branchListener = () => { void onBranch(elements['subflow-select'].value); };
      elements['subflow-select'].addEventListener('change', branchListener);
      return () => { elements['platform-select'].removeEventListener('change', listener); elements['subflow-select'].removeEventListener('change', branchListener); };
    },
    render(state) {
      const platform = getPlatform(state.current?.platformId);
      elements['subflow-control'].hidden = platform?.strategy !== 'manual';
      elements['subflow-select'].replaceChildren();
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '請選擇子流程'; placeholder.disabled = true;
      elements['subflow-select'].append(placeholder);
      for (const flow of platform?.strategy === 'manual' ? platform.subflows : []) {
        const option = document.createElement('option'); option.value = flow.id; option.textContent = flow.name;
        elements['subflow-select'].append(option);
      }
      elements['subflow-select'].value = state.current?.branch ?? '';
      elements['subflow-select'].disabled = platform?.strategy !== 'manual';
      if (lastGeneration !== catalogGeneration()) { lastTabContext = null; lastGeneration = catalogGeneration(); elements['platform-select'].value = state.current?.platformId ?? ''; }
      elements['platform-current'].textContent = formatSelection(state.current);
      elements['platform-source'].textContent = sources[state.source];
      elements['platform-auto'].textContent = formatSelection(state.automatic);
      elements['platform-detected'].textContent = `網址辨識：${formatSelection(state.automatic)}`;
      elements['platform-manual'].textContent = getPlatform(state.preferences.manualPlatformId)?.name ?? '尚未選擇';
      elements['platform-last'].textContent = formatSelection(state.preferences.lastValid);
      const context = state.tabContext;
      const contextChanged = context && (!lastTabContext ||
        context.tabId !== lastTabContext.tabId || context.url !== lastTabContext.url);
      // 原生 select 立即保留手選值；一般 render 與同次導航的重複事件不覆寫。
      if (contextChanged) {
        if (state.source === 'manual') elements['platform-select'].value = state.current.platformId;
        else if (state.automatic) elements['platform-select'].value = state.automatic.platformId;
        else if (!lastTabContext && !elements['platform-select'].value) {
          elements['platform-select'].value = state.current?.platformId ?? '';
        }
        lastTabContext = context;
      }
      elements['platform-select'].disabled = PLATFORMS.length === 0;
      const cards = getExamplePrompts(state).map((prompt) => {
        const article = document.createElement('article');
        article.className = 'example-prompt';
        const heading = document.createElement('h3');
        heading.textContent = prompt.title;
        const content = document.createElement('p');
        content.textContent = prompt.text;
        article.append(heading, content);
        return article;
      });
      if (cards.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = '尚未選擇平台；請開啟支援網站或手動選擇。';
        cards.push(empty);
      }
      elements['platform-prompts'].replaceChildren(...cards);
      elements['app-status'].textContent = '基礎畫面已就緒。平台辨識與切換已啟用。';
    },
    reportError(message) {
      elements['app-error'].hidden = false;
      elements['app-error'].textContent = message;
    },
  };
}
