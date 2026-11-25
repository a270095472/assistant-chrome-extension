import { BUILTIN_DEMO } from '../rules/builtin-demo.js';
// Public examples are derived from the editable workbook; user Current takes priority.
export const DEFAULT_PLATFORMS = Object.freeze(BUILTIN_DEMO.platforms.map(p => {
  const rule = BUILTIN_DEMO.rules.find(r => r.scope.kind === 'platform' && r.scope.platformId === p.id);
  const flows = p.strategy === 'showAll' ? p.subflows : [null];
  return Object.freeze({ ...structuredClone(p), examplePrompts: flows.map(f => ({ title: (f ? f.name + '／' : '') + rule.title, text: rule.content })) });
}));
// Recognize historical data without including it in the active platform menu.
export const LEGACY_PLATFORMS = Object.freeze([{id:'official',name:'Official',enabled:false,historicalOnly:true,order:6,strategy:'byDomain',subflows:[{id:'apple',name:'Apple'},{id:'samsung',name:'Samsung'}],sites:[]}]);
