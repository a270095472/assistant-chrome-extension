// Presentation only: no acceptance rules, data defaults or silent corrections.
export function issueGuidance(issue) {
  if (issue.type === 'JSON 格式') return { reason: 'JSON 格式錯誤，無法解析。', hint: issue.hint };
  const path = issue.jsonPath ?? issue.path ?? '';
  if (/\/scope\/platformId$/.test(path) && issue.scopeKind === 'global') return {
    reason: '共同規則不能包含平台範圍欄位。', hint: 'GLOBAL 規則請移除 scope.platformId；若要建立平台規則，請選擇 PLATFORM 並填寫有效平台 ID。' };
  if (/\/scope\/platformId$/.test(path)) return {
    reason: '平台 ID 未填寫或格式不正確。', hint: '請在平台 ID 欄填入已登錄的 ID，例如 orbit；須以小寫英文字母開頭。適用平台也須與它一致。' };
  if (/\/sourceRefs\/\d+\/policyId$/.test(path)) return {
    reason: '來源文件中的條款編號未填寫或格式不正確。',
    hint: '請填寫該文件實際使用的條款編號，例如 OUT-001。可用中文、英文字母、數字及底線、冒號、句點、連字號，不能含空白或斜線。不要借用不相關的示範條款。' };
  if (/\/sourceRefs\/\d+\/locator$/.test(path)) return {
    reason: '文件章節／位置未填寫或超過長度限制。', hint: '請填寫可查找的實際位置，例如「第3節／出貨前檢查」，不能只有空白。' };
  if (/\/sources\/\d+\/documentVersion$/.test(path)) return {
    reason: '來源文件版本未填寫或格式不正確。', hint: '請到來源資料填寫實際文件版本（1～64字元）；不必使用三段版本號，也不要猜測版本。' };
  if (/\/sources\/\d+\/nature$/.test(path)) return {
    reason: '來源文件的資料性質未填寫或不是支援選項。', hint: '請選擇使用者自有文件 userOwnedDocument 或真正的原創虛構示範 originalFictionalDemo；真實規則不能冒用示範來源。' };
  if (/\/sources\/\d+\/title$/.test(path)) return {
    reason: '來源文件標題未填寫或超過長度限制。', hint: '請在來源資料填寫實際文件名稱，讓使用者能在選單辨識文件。' };
  if (/\/sources\/\d+\/documentPath$/.test(path)) return {
    reason: '來源文件的相對路徑未填寫或格式不正確。', hint: '請填寫實際相對路徑，例如 docs/出貨規範.md；不可使用磁碟機路徑、網址或上層目錄。這項檢查不代表已確認檔案存在。' };
  if (issue.type === 'RULE_SCOPE_MISMATCH' && issue.scopeKind === 'platform') return {
    reason: '平台 ID 不存在，或與適用平台不一致。', hint: '請核對 E 欄是否存在於平台資料，並將 O 欄設為相同的單一平台 ID；不要填平台顯示名稱。' };
  if (/^SOURCE_MISSING(?: |$)/.test(issue.reason ?? '')) return {
    reason: '尚未選擇有效的來源文件。', hint: '請在來源文件欄選擇已登錄文件，並補齊來源資料的 ID、版本、標題、相對路徑與資料性質；不要虛構文件。' };
  if (/^SOURCE_FORMULA(?: |$)/.test(issue.reason ?? '')) return {
    reason: '來源業務欄位含有公式。', hint: '請檢查指出的來源儲存格，改填實際資料或貼上純值；Assistant 不執行來源公式，也不使用公式快取。' };
  return { reason: (issue.reason ?? '資料檢查未通過。').replace(/^欄位不符合 Schema 3\.[01]\.0：[^；]+；/, ''), hint: issue.hint };
}
