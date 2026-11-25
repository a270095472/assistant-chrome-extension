export const HOME_MODULES = Object.freeze({
  attention: '高優先提醒', sop: '平台 SOP', checklist: '非強制檢查清單', notes: '個人筆記',
});

export const TEXT_SIZES = Object.freeze([100, 125, 150, 175, 200]);

export function normalizeHomePreferences(value) {
  const modules = Object.fromEntries(Object.keys(HOME_MODULES).map((key) =>
    [key, value?.version === 1 && typeof value[key] === 'boolean' ? value[key] : true]));
  return { version: 1, ...modules, manualContext: value?.version === 1 && value.manualContext === true,
    textSize: value?.version === 1 && TEXT_SIZES.includes(value.textSize) ? value.textSize : 100 };
}
