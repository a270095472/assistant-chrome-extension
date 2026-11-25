// PO 2026-11-19 supersedes M5's hard version rejection. The comparator's
// historical diagnostics remain intact; only version risks become confirmable.
export const IMPORT_POLICY_VERSION = 'scheme-f-1';
export function importPolicy(comparison) {
  const allowed = ['initial', 'changed', 'conflict', 'identical'].includes(comparison.status);
  if (!allowed) return { allowed: false, reasons: [], version: IMPORT_POLICY_VERSION };
  const reasons = [];
  for (const item of comparison.conflicts) {
    if (item.reason !== 'same-version-different-content') return { allowed: false, reasons: [], version: IMPORT_POLICY_VERSION };
    reasons.push({ id: 'same-version:' + item.id, text: item.id + '：版本相同但內容不同，將採用候選內容。' });
  }
  for (const item of comparison.warnings) reasons.push({ id: 'downgrade:' + item.id, text: item.id + '：候選版本較舊，將取代較新內容。' });
  const removed = comparison.changes.filter((c) => c.action === 'removed').length;
  if (removed) reasons.push({ id: 'deletions', text: '完整取代將移除 ' + removed + ' 筆資料，請核對所有移除內容。' });
  for (const [index, change] of comparison.changes.entries()) if (change.before?.sourceRefs?.length && change.after?.sourceRefs?.length === 0)
    reasons.push({ id: 'source-removal:' + index, text: '「' + (change.after.title ?? '規則') + '」將移除文件來源追溯，請確認改為自行制定是預期操作。' });
  if (comparison.current && comparison.statistics.after.rules === 0 && comparison.statistics.before.rules > 0)
    reasons.push({ id: 'clear', text: '候選沒有普通規則，將清空現有普通規則。' });
  if (comparison.current?.rulesetId !== comparison.candidate?.rulesetId && comparison.current)
    reasons.push({ id: 'dataset-switch', text: '將切換至另一份 SOP 資料集。' });
  if (comparison.current && comparison.current.schemaVersion !== comparison.candidate.schemaVersion)
    reasons.push({ id: 'schema-switch', text: '將切換支援的資料格式版本。' });
  return { allowed: true, reasons, version: IMPORT_POLICY_VERSION };
}
