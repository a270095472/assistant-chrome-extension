import { getPlatform, selectionBranch } from './catalog.js';
// Built-in examples are clearly separate from user rules.
export function getExamplePrompts(state) {
  const platform = getPlatform(state.current?.platformId);
  if (!platform) return [];
  const branch = selectionBranch(platform, state.automatic, state.current.branch);
  if (platform.strategy === 'byDomain' || platform.strategy === 'manual') {
    return platform.branchExamples?.[branch] ?? [platform.emptyPrompt ?? { title: platform.name, text: '請先選擇子流程或開啟符合的網址；尚未配置正式規則。' }];
  }
  return platform.examplePrompts?.length ? platform.examplePrompts : [{ title: '平台 SOP', text: '目前尚未匯入此平台正式 SOP。' }];
}
