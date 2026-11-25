import { readImportFile, checkedWorkerResult } from '../features/import/read-import-file.js';
import { importPolicy } from '../features/import/import-policy.js';
import { sopHash } from '../services/sop-current.js';
import { issueGuidance } from '../features/import/issue-guidance.js';
import { compareRulesets, canonicalContent } from '../features/import/compare.js';
import { createDifferenceView } from './difference-view.js';
import { createIdentitySession } from '../features/import/rule-identity.js';
import { createCatalogSession } from '../features/import/catalog-identity.js';
import { validCurrentSnapshot } from '../services/current-ruleset.js';
import { parseCandidate } from '../features/import/validate.js';

export const CURRENT_ERRORS = {
  'invalid-current-response': 'Current 回傳資料不完整或不符合契約；已停止匯入，保留現有資料。請重新載入擴充套件並重新讀取，不要重設 SOP。',
  'outcome-unknown': '保存結果待核對；可能已套用。請按「核對上次保存結果」，勿重送或繼續更新。',
  'not-applied': '已核對：此操作未套用，原資料保留。請重新選檔預覽。',
  'migration-pending': '保存／移轉狀態待核對，請核對上次保存結果；不要重新匯入。',
  'corrupt-storage': 'SOP 儲存資料損壞或格式未知；已停止更新。請保留原檔並回報，不能當成首次匯入。',
  'storage-unavailable': 'SOP 儲存暫時無法讀取，請重新讀取；不會當成空資料。',
  'storage-full': '儲存空間不足，未套用；不會刪除上一份 SOP、筆記或偏好來騰出空間。',
  'risk-confirmation-required': '尚未確認所有風險，未套用。',
  'no-previous': '沒有可還原的上一份 SOP。',
  'read-failed': 'Current 讀取失敗；保留已顯示資料並停用套用，請重新讀取。',
  'corrupt-current': 'Current 已確認損壞或版本未知；可選擇完整 JSON 修復。無法可靠比較舊內容；確認修復後舊資料無法恢復，筆記與偏好保留。',
  'stale-baseline': '基準已過期，請重新選檔並預覽。',
  'write-failed': '寫入失敗或結果不確定（可能為配額不足）；請重新讀取 Current 並重選檔案，不提供自動回復。',
  'readback-failed': '寫入後無法讀回確認；結果不確定，請重新讀取 Current，不提供自動回復。',
  'readback-mismatch': '讀回內容不符；未確認成功，請重新讀取 Current。',
  'version-conflict': '同版異內容衝突；只能唯讀預覽。',
  'replace-required': '正式套用只接受完整 JSON Replace；patch 僅供隔離驗證。',
  'invalid-candidate': '候選驗證失敗，未寫入。',
  'sidebar-refresh-failed': '背景已讀回確認，但本側欄重新讀取失敗；請重新讀取 Current，勿直接重送。',
};

function formatPreview(preview) {
  const statuses = { initial: '尚無正式 Current；以下為首次候選影響。', identical: '同版同內容：略過，沒有變更。',
    changed: '候選內容或版本有變更。', conflict: '版本相同但內容不同：請核對差異並明確確認警告。',
    'replace-required': '差異預覽僅接受完整 replace；patch 保留隔離驗證。', 'invalid-current': CURRENT_ERRORS['corrupt-current'] };
  const lines = [preview.repair ? '修復模式：既有 Current 已確認損壞；無法可靠比較舊內容及統計，以下僅列完整候選。' : statuses[preview.status] ?? '無法建立預覽。'];
  if (preview.candidate) {
    const label = (v) => v ? [v.rulesetId ?? '未提供資料集 ID', v.schemaVersion, v.rulesetVersion].join('／') : '尚未啟用';
    lines.push('目前：' + (preview.repair ? '損壞，無法確認' : label(preview.current)), '候選：' + label(preview.candidate),
      '平台：' + (preview.repair ? '未知' : preview.statistics.before.platforms) + ' → ' + preview.statistics.after.platforms +
      '；普通規則：' + (preview.repair ? '未知' : preview.statistics.before.rules) + ' → ' + preview.statistics.after.rules);
    const labels = { added: '新增', modified: '修改', removed: '移除' };
    if (!preview.repair) for (const [action, name] of Object.entries(labels)) lines.push(name + '：' + preview.changes.filter((c) => c.action === action).length + ' 筆');
    for (const c of preview.collections) lines.push('集合 ' + c.id + '：' + (c.before ?? '無') + ' → ' + (c.after ?? '移除') + (c.contentChanged ? '（內容變更）' : '（僅版本）'));
    for (const c of preview.conflicts) lines.push('同版提醒 ' + c.id + '：版本相同但內容不同。');
    for (const w of preview.warnings) lines.push('降版警告：' + w.id + ' 將採用較舊的內容版本。');
    lines.push('可能受影響平台（保守範圍）：' + (preview.potentiallyAffectedPlatforms.join('、') || '無'));
    lines.push('逐平台普通規則統計（依靜態適用範圍，含共用規則；非人工條件判定後數量）：');
    for (const p of preview.platformStatistics.filter((p) => p.affected)) lines.push(p.name + '（' + p.id + '）：' + (preview.repair ? '未知' : p.before) + ' → ' + p.after +
      (preview.repair ? '' : '；新增 ' + p.changes.added + '／修改 ' + p.changes.modified + '／刪除 ' + p.changes.removed));
  }
  lines.push('完整 Replace 僅在確認後寫入；保存上一份 SOP 供單次還原。還原後備份清空。個人筆記與偏好保留。');
  return lines.join('\n');
}

function formatIssue(e) {
  const guidance = issueGuidance(e);
  return (e.location ?? '候選資料') + '：' + guidance.reason + '\n修正：' + guidance.hint;
}
function formatTechnicalIssue(e) {
  const details = [];
  if(e.diagnostic)details.push(e.diagnostic);
  if (e.exceptionIds?.length) details.push('例外 ID：' + e.exceptionIds.join('、'));
  if (e.target) details.push('目標 target：' + JSON.stringify(e.target));
  if (e.differentFields?.length) details.push('不同效果欄位：' + e.differentFields.join('、'));
  if (e.possibleIntersection) details.push('可能交集' + (e.intersectionTruncated ? '（顯示前 ' + e.possibleIntersection.length + ' 項，共 ' + e.intersectionCount + ' 項）' : '') + '：' + JSON.stringify(e.possibleIntersection));
  return e.type + '｜' + e.path + (e.platformId ? '｜平台 ' + e.platformId : '') + (e.ruleId ? '｜規則 ' + e.ruleId : '') +
    '\n' + e.reason + (details.length ? '\n' + details.join('\n') : '') + '\n修正：' + e.hint;
}

export function createImportView(document, getCurrent = () => null, client = null) {
  const ids = ['candidate-file', 'candidate-results', 'candidate-preview', 'candidate-cancel', 'candidate-apply',
    'replace-dialog', 'replace-confirm', 'replace-cancel', 'replace-summary', 'current-ruleset', 'current-reload'];
  const [input, output, preview, cancel, apply, dialog, confirm, dismiss, summary, currentLabel, reload] = ids.map((id) => document.getElementById(id));
  const differences = createDifferenceView(document, document.getElementById('candidate-differences'));
  const issueDetails = document.getElementById('candidate-issue-details'), issueTechnical = document.getElementById('candidate-issue-technical');
  const identityPanel=document.getElementById('identity-panel'), identitySummary=document.getElementById('identity-summary'),
    identityContent=document.getElementById('identity-content'), identitySelect=document.getElementById('identity-choice'), identityNext=document.getElementById('identity-next');
  const identityReference=document.getElementById('identity-reference');
  let identityContinue=null,identitySelection=null;
  const risks = document.getElementById('replace-risks'), restore = document.getElementById('current-restore'),
    reconcileButton = document.getElementById('current-reconcile');
  let abortController = null, acknowledgements = [], pendingOperation = null;
  const session = document.defaultView?.sessionStorage, pendingKey = 'assistant.sopPending.v1';
  try { const saved = JSON.parse(session?.getItem(pendingKey) ?? 'null');
    if (saved && typeof saved.operationId === 'string' && typeof saved.candidateHash === 'string') pendingOperation = saved;
  } catch { /* stored metadata is optional; read Current remains authoritative */ }
  function savePending() {
    try { if (pendingOperation) session?.setItem(pendingKey, JSON.stringify({ operationId: pendingOperation.operationId,
      candidateHash: pendingOperation.candidateHash, baseRevision: pendingOperation.baseRevision, baseHash: pendingOperation.baseHash }));
    else session?.removeItem(pendingKey); } catch { /* no candidate body is persisted */ }
  }
  let repairToken = null;
  let revision = 0, disposed = false, ticket = null, busy = false, ready = !client;
  const show = (message, state = 'neutral') => { output.textContent = message; output.setAttribute('data-state', state); };
  function controls() {
    input.disabled = busy || !ready; reload.disabled = busy;
    cancel.disabled = busy; apply.disabled = busy || !ready || !ticket?.applicable || !client;
    restore.disabled = busy || !ready || !client?.getSnapshot()?.previous || !!pendingOperation;
    reconcileButton.disabled = busy || !pendingOperation;
    if (pendingOperation) { input.disabled = true; apply.disabled = true; }
  }
  function invalidate() { abortController?.abort(); revision++; ticket = null; apply.disabled = true; dialog.close(); preview.textContent = ''; differences.clear();
    issueDetails.hidden = true; issueDetails.open = false; issueTechnical.textContent = '';
    identityContinue=null; identitySelection=null; identityReference.textContent=''; identityPanel.hidden=true; identitySelect.replaceChildren(); identityContent.textContent=''; }
  const unsubscribe = client?.subscribe((result, changed) => {
    if (disposed) return;
    if(result.ok&&!validCurrentSnapshot(result.snapshot))result={ok:false,code:'invalid-current-response'};
    const nextRepair = !result.ok && result.code === 'corrupt-current' ? result.repairToken ?? null : null;
    if (nextRepair !== repairToken && (ticket || identityContinue)) invalidate();
    repairToken = nextRepair;
    ready = result.ok || !!repairToken;
    if (!result.ok) { invalidate(); currentLabel.textContent = CURRENT_ERRORS[result.code] ?? '無法連線背景服務；請重新讀取。'; }
    else {
      const snapshot = result.snapshot;
      currentLabel.textContent = snapshot.current ? '已套用 Current：Schema ' + snapshot.current.schemaVersion + '／內容 ' + snapshot.current.rulesetVersion +
        (snapshot.lastOperation ? '；最近已保存操作：' + (snapshot.lastOperation.kind === 'restore' ? '還原' : '匯入') : '') : '尚未匯入 Current';
      if (changed && !busy && (ticket || identityContinue)) { invalidate(); show('Current 已更新，舊候選已失效，請重新選檔並預覽。'); }
    }
    controls();
  }) ?? (() => {});
  const listener = async () => {
    if (busy || !ready) return;
    invalidate();
    const request = ++revision, file = input.files?.[0];
    cancel.disabled = false;
    const baseRevision = client?.getSnapshot()?.revision ?? null;
    const repairBaseline = repairToken;
    let baseline;
    try {
      const value=repairBaseline?null:getCurrent();
      if(value===undefined||value!==null&&(value.mode!=='replace'||!parseCandidate(JSON.stringify(value)).ok))throw Error('Invalid Current');
      if(client&&!repairBaseline&&!validCurrentSnapshot(client.getSnapshot()))throw Error('Current not ready');
      baseline=structuredClone(value);
    } catch (error) {
      ready=false;controls();show(CURRENT_ERRORS['invalid-current-response'],'error');
      issueTechnical.textContent='CURRENT_BASELINE_INVALID\n'+String(error.stack??error);issueDetails.hidden=false;return;
    }
    show('正在本機驗證候選資料；尚未套用。');
    abortController = new AbortController();
    const loaded = await readImportFile(file, baseline, abortController.signal);
    const acceptValidation = (validation) => {
    if (disposed || request !== revision) return;
    if (!validation.ok) { show(validation.errors.map(formatIssue).join('\n\n'), 'error');
      issueTechnical.textContent = validation.errors.map(formatTechnicalIssue).join('\n\n'); issueDetails.hidden = false; return; }
    const originalMode = validation.originalMode;
    if (client && originalMode !== 'replace') { show(CURRENT_ERRORS['replace-required']); return; }
    if (repairBaseline !== repairToken || (!repairBaseline && (canonicalContent(baseline) !== canonicalContent(getCurrent()) || (client && baseRevision !== client.getSnapshot()?.revision)))) {
      preview.textContent = '基準已過期，請重新選檔並預覽；正式資料未變更。'; return;
    }
    const comparison = compareRulesets(baseline, validation.candidate);
    const policy = importPolicy(comparison);
    show((validation.identityNotice ? validation.identityNotice + '\n' : '') + '候選資料驗證通過：' + validation.candidate.platforms.length + ' 個平台、' + validation.candidate.rules.length + ' 條規則。' +
      (comparison.status === 'identical' ? '尚未生效；同版同內容，正常略過。' : '尚未生效；請核對完整差異與警告。'), comparison.status === 'identical' || policy.reasons.length ? 'warning' : 'success');
    comparison.repair = !!repairBaseline;
    preview.textContent = formatPreview(comparison);
    differences.set(comparison);
    // M4's explicit-current patch harness remains validation only. The formal
    // UI must inspect the original mode, never submit a synthesized patch.
    ticket = { candidate: validation.candidate, baseRevision, baseline: baseline ? canonicalContent(baseline) : null, repair: !!repairBaseline, repairToken: repairBaseline,
      applicable: originalMode === 'replace' && policy.allowed && comparison.status !== 'identical', comparison, policy, kind: 'import' };
    controls();
    };
    const beginRules=(loaded)=>{
    if(loaded.ok&&loaded.draft){
      const identity=createIdentitySession(loaded.draft,baseline,loaded.ruleRows);
      const render = (result) => {
        if(disposed||request!==revision)return;
        if(!result.pending){identityContinue=null;identityPanel.hidden=true;acceptValidation(result);return;}
        const item=result.pending[0];identityPanel.hidden=false;
        identitySummary.textContent=result.notice+' 尚有 '+result.pending.length+' 筆需要確認。';
        identityContent.textContent=(item.row?'規則總表第 '+item.row+' 列：':'')+item.rule.title+'\n'+item.rule.content+
          (item.linked?'\n此配對涉及例外引用，請核對原規則與目標。':'')+(item.duplicate?'\n複製資料使用了相同識別，請確認哪筆保留原規則。':'');
        identitySelect.replaceChildren();
        const add=(value,text)=>{const option=document.createElement('option');option.value=value;option.textContent=text;identitySelect.append(option);};
        add('','請選擇新增或修改意圖');add('new','這是一條新增規則');
        if(item.mayKeep)add('keep','這筆保留為原規則');
        const scopeLabel=scope=>scope.kind==='global'?'共同規則':scope.kind==='platform'?
          '平台：'+(loaded.draft.platforms.find(p=>p.id===scope.platformId)?.name??scope.platformId):
          '品類：'+(loaded.draft.productTypes.find(p=>p.id===scope.productTypeId)?.name??scope.productTypeId);
        for(const option of item.options)add(option.value,'修改原規則：'+option.title+'｜'+scopeLabel(option.scope)+'｜'+option.content.slice(0,80));
        identitySelect.value='';identitySelect.disabled=false;identityNext.disabled=false;
        identityReference.textContent='';
        identitySelection=()=>{const option=item.options.find(o=>o.value===identitySelect.value);
          const names=(ids,items)=>ids===null?'不限制':ids.map(id=>items.find(p=>p.id===id)?.name??id).join('、');
          identityReference.textContent=option?option.title+'\n'+option.content+'\n'+scopeLabel(option.scope)+
            '\n適用平台：'+names(option.appliesTo.platformIds,loaded.draft.platforms)+
            '\n適用品類：'+names(option.appliesTo.productTypeIds,loaded.draft.productTypes)+
            '\n額外條件：'+(option.appliesTo.whenAll.map(c=>(loaded.draft.facts.find(f=>f.id===c.factId)?.name??c.factId)+'＝'+c.equals).join('；')||'無'):
            identitySelect.value==='new'?'將建立一條新規則；未配對的舊規則會列為移除，請在下一步核對。':'';};
        identityContinue=()=>{if(!identitySelect.value){show('請選擇這筆是新增還是修改；尚未產生正式差異。','warning');return;}
          render(identity.choose(item.index,identitySelect.value));};
        show('需要確認規則身分；Current 尚未變更，正式差異會在確認後產生。','warning');
      };
      render(identity.inspect());
    }else acceptValidation(loaded);
    };
    if(loaded.ok&&loaded.catalogDraft){
      const catalogs=createCatalogSession(loaded.catalogDraft,baseline);
      const renderCatalog=(result)=>{
        if(disposed||request!==revision)return;
        if(!result.pending){identityContinue=null;identitySelection=null;identityPanel.hidden=true;
          if(!result.ok){acceptValidation(result);return;}beginRules(checkedWorkerResult(result));return;}
        const item=result.pending[0],label=item.kind==='platforms'?'平台':'品類';
        identityPanel.hidden=false;identitySummary.textContent=result.notice+' 尚有 '+result.pending.length+' 筆主檔需要確認。';
        identityContent.textContent=item.sheet+'第 '+item.row+' 列：'+item.name+'\n請確認這是新'+label+'，還是原有'+label+'改名／修改。'+(item.duplicate?'\n複製資料帶有相同識別，不能讓兩筆共用身分。':'');
        identitySelect.replaceChildren();
        const add=(value,text)=>{const option=document.createElement('option');option.value=value;option.textContent=text;identitySelect.append(option);};
        add('','請選擇新增或修改意圖');add('new','這是新增'+label);
        if(item.mayKeep)add('keep','這筆保留為原有'+label);
        for(const option of item.options)add(option.value,'修改原有'+label+'：'+option.name);
        identitySelect.value='';identitySelect.disabled=false;identityNext.disabled=false;identityReference.textContent='';
        identitySelection=()=>{const option=item.options.find(o=>o.value===identitySelect.value);
          identityReference.textContent=option?option.name+'\n'+(item.kind==='platforms'?'網站：'+(option.item.sites.map(s=>s.host+(s.path??'')).join('、')||'未設定網站'):'')+
            '\n配對會沿用原有身分；請核對規則、例外及既有筆記的關聯。':identitySelect.value==='new'?'將建立新項目；未配對的舊項目會列為移除，請核對完整差異。':'';};
        identityContinue=()=>{if(!identitySelect.value){show('請先確認主檔是新增還是修改；正式資料未變更。','warning');return;}renderCatalog(catalogs.choose(item.key,identitySelect.value));};
        show('需要確認平台／品類身分；尚未產生正式差異，Current 未變更。','warning');
      };renderCatalog(catalogs.inspect());
    }else beginRules(loaded);
  };
  const cancelListener = () => {
    if (busy) return;
    invalidate(); input.value = ''; cancel.disabled = true;
    show('已取消候選預覽；正式資料未變更。'); input.focus();
  };
  const applyListener = () => {
    if (busy || !ready || !ticket?.applicable || !client) return;
    const changes = ticket.comparison.changes;
    risks.replaceChildren();
    acknowledgements = ticket.policy.reasons.map((reason) => {
      const label = document.createElement('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.disabled = false;
      const text = document.createElement('span'); text.textContent = reason.text; label.append(checkbox, text); risks.append(label);
      return { id: reason.id, checkbox };
    });
    summary.textContent = (ticket.repair ? '修復警告：Current 已確認損壞，無法比較舊內容；修復將完整替換損壞資料且無法恢復。' : '') + '以 Schema ' + ticket.candidate.schemaVersion + '／內容 ' + ticket.candidate.rulesetVersion +
      ' 完整替換 Current。' + (ticket.comparison.warnings.length ? '警告：此更新包含內容降版。' : '') +
      (ticket.repair ? '舊資料的新增、修改及移除數量無法確認。' : '新增 ' + changes.filter((c) => c.action === 'added').length + '、修改 ' + changes.filter((c) => c.action === 'modified').length +
      '、移除 ' + changes.filter((c) => c.action === 'removed').length + ' 筆。') + (ticket.kind === 'restore'
        ? '這次將還原上一份 SOP，還原成功後備份清空。' : '上一份 Current 會保存供單次還原。') + '個人筆記與設定保留。';
    dialog.showModal(); dismiss.focus();
  };
  const dismissListener = () => dialog.close();
  const confirmListener = async () => {
    if (busy || !ready || !ticket?.applicable || !dialog.open || !client) return;
    if (acknowledgements.some((a) => !a.checkbox.checked)) { show('請逐項確認風險，或取消；尚未寫入。', 'warning'); return; }
    const pending = ticket;
    busy = true; controls(); confirm.disabled = true; dismiss.disabled = true; dialog.close();
    show('正在鎖定、重驗並寫入 Current，等待讀回確認…');
    let result;
    try {
      pendingOperation = { candidate: pending.candidate, baseRevision: pending.baseRevision, baseline: pending.baseline,
        repair: pending.repair, repairToken: pending.repairToken, confirmed: true, operationId: crypto.randomUUID(),
        candidateHash: await sopHash(pending.candidate), policyVersion: pending.policy.version, acknowledged: acknowledgements.map((a) => a.id) };
      pendingOperation.baseHash = pending.baseline ? await sopHash(JSON.parse(pending.baseline)) : null;
      savePending();
      result = await client[pending.kind === 'restore' ? 'restore' : 'replace'](pendingOperation);
    }
    catch { result = { ok: false, code: 'outcome-unknown' }; }
    if (disposed) return;
    if (result.ok || ['not-applied', 'stale-baseline', 'invalid-candidate', 'risk-confirmation-required', 'storage-full'].includes(result.code)) pendingOperation = null;
    savePending();
    busy = false; invalidate(); input.value=''; confirm.disabled = false; dismiss.disabled = false; controls();
    show(result.ok ? (result.status === 'noop' ? '內容相同，未寫入。' : 'SOP 保存完成，Current 已讀回確認。') +
      (result.refreshPending ? '背景已確認保存，但側欄顯示待重新讀取；勿重送。' : '') : CURRENT_ERRORS[result.code] ?? '保存結果待核對，請核對上次保存結果，勿重送。', result.ok ? 'success' : 'error');
    reload.focus();
  };
  const reloadListener = () => { if (busy) return; invalidate(); if (client) { ready = false; controls(); void client.refresh(); } };
  const restoreListener = () => {
    if (busy || !ready || pendingOperation) return;
    const snapshot = client?.getSnapshot(); if (!snapshot?.previous) return;
    invalidate(); const comparison = compareRulesets(snapshot.current, snapshot.previous), policy = importPolicy(comparison);
    ticket = { kind: 'restore', candidate: snapshot.previous, baseRevision: snapshot.revision, baseline: canonicalContent(snapshot.current),
      comparison, policy, applicable: policy.allowed };
    preview.textContent = '還原預覽\n' + formatPreview(comparison); differences.set(comparison); controls(); applyListener();
  };
  const reconcileListener = async () => {
    if (busy || !pendingOperation || !client) return; busy = true; controls();
    const result = await client.reconcile(pendingOperation);
    if (result.ok || ['not-applied', 'stale-baseline'].includes(result.code)) pendingOperation = null;
    savePending();
    busy = false; controls(); show(result.ok ? '已核對：SOP 保存完成，Current 已讀回確認。' : CURRENT_ERRORS[result.code] ?? '結果仍待核對，請保留原始檔案。', result.ok ? 'success' : 'error');
  };
  const bindings = [[identitySelect,'change',()=>identitySelection?.()], [identityNext,'click',()=>identityContinue?.()], [input, 'change', listener], [cancel, 'click', cancelListener], [apply, 'click', applyListener],
    [confirm, 'click', confirmListener], [dismiss, 'click', dismissListener], [reload, 'click', reloadListener], [restore, 'click', restoreListener], [reconcileButton, 'click', reconcileListener]];
  for (const [node, event, callback] of bindings) node.addEventListener(event, callback);
  controls();
  return { dispose() { disposed = true; abortController?.abort(); revision++; unsubscribe(); for (const [node, event, callback] of bindings) node.removeEventListener(event, callback); dialog.close(); } };
}
