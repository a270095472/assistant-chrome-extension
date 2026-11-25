import { readCandidateFile, emptyRuleset, parseCandidate, validateStructure } from './validate.js';
import { XLSX_LIMITS } from './xlsx-zip.js';
import { createCatalogSession } from './catalog-identity.js';
const problem = (reason) => ({ ok: false, errors: [{ type: '檔案', path: '/', reason, hint: '請重新選擇支援的完整 XLSX 或 JSON。' }] });
export function checkedWorkerResult(value) {
  const mismatch=()=>problem('解析器回傳資料不完整或版本不一致；請重新載入擴充套件後重試。Current 未變更。');
  if(!value||typeof value.ok!=='boolean')return mismatch();
  if(!value.ok)return Array.isArray(value.errors)&&value.errors.length?{ok:false,errors:value.errors}:mismatch();
  if(value.catalogDraft){
    if(value.draft||value.candidate||value.originalMode!=='replace'||value.format!=='xlsx')return mismatch();
    const grids=value.catalogDraft.grids;
    const bounds={'規則總表':22,'例外規則':24,'平台資料':11,'商品品類':4,'轉檔設定':3,'來源資料':5,'人工條件':4};
    if(!grids||Object.keys(grids).length!==7)return mismatch();
    let count=0;
    for(const [sheet,width] of Object.entries(bounds)){
      if(!grids[sheet]||typeof grids[sheet]!=='object'||Array.isArray(grids[sheet]))return mismatch();
      for(const [a,v] of Object.entries(grids[sheet])){
        const m=/^([A-Z]+)([1-9][0-9]*)$/.exec(a);if(!m||Number(m[2])>XLSX_LIMITS.rows)return mismatch();
        const col=[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
        if(col>width||!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||++count>XLSX_LIMITS.cells)return mismatch();
      }
    }
    let serial=0;const preflight=createCatalogSession(value.catalogDraft,null,()=> 'preflight-final-'+serial++);
    const result=preflight.preflight();
    if(result.pending)return problem('平台或品類超過可確認容量，未截斷或匯入。');
    if(!result.ok)return result;
    const checked=checkedWorkerResult(result);return checked.ok?value:checked;
  }
  if(value.draft&&value.candidate)return mismatch();
  if(value.draft){
    if(value.draft.schemaVersion!=='3.1.0'||value.draft.mode!=='replace'||!Array.isArray(value.draft.rules))return mismatch();
    // Structural preflight only. Temporary IDs/targets never become the
    // candidate; real identity, reference and semantic checks still follow.
    const provisional=structuredClone(value.draft);
    for(const [i,r] of provisional.rules.entries()){
      if(!r||typeof r!=='object')return mismatch();if(r.id==='')r.id='preflight-'+i;
    }
    if(Array.isArray(provisional.exceptions))for(const e of provisional.exceptions)if(e?.target?.kind==='unresolved')
      e.target={kind:'global',ruleId:e.target.ruleId};
    const errors=validateStructure(provisional).map(e=>{
      const m=/^\/rules\/(\d+)(?:\/([^/]+))?/.exec(e.path),row=m&&value.ruleRows?.[Number(m[1])];
      if(!row)return e;
      let col=({id:'A',scope:'B',title:'C',content:'D',category:'J',priority:'K',placements:'L',appliesTo:'O',sourceRefs:'R',origin:'V'})[m[2]]??'A';
      if(e.path.endsWith('/platformId'))col='E';if(e.path.endsWith('/policyId'))col='S';if(e.path.endsWith('/locator'))col='G';
      return {...e,jsonPath:e.path,location:'規則總表!'+col+row,scopeKind:value.draft.rules[Number(m[1])]?.scope?.kind};
    });
    return errors.length?{ok:false,errors}:value;
  }
  if(!value.candidate||value.originalMode!=='replace')return mismatch();
  const checked=parseCandidate(JSON.stringify(value.candidate));
  return checked.ok?{...value,candidate:checked.candidate}:checked;
}
export async function readImportFile(file, baseline, signal) {
  try {
  if (!file) return problem('尚未選擇檔案。');
  if (/\.json$/i.test(file.name ?? 'fixture.json')) {
    let originalMode;
    const result = await readCandidateFile({ size: file.size, async text() {
      const text = await file.text(); try { originalMode = JSON.parse(text)?.mode; } catch { /* standard diagnostic */ } return text;
    } }, baseline ?? emptyRuleset());
    return { ...result, originalMode, format: 'json' };
  }
  if (!/\.xlsx$/i.test(file.name ?? '') || file.size > XLSX_LIMITS.input) return problem('僅接受 XLSX（最多 4 MiB）或 JSON（最多 2 MiB）。');
  const bytes = await file.arrayBuffer();
  if (signal?.aborted) return problem('已取消解析。');
  return await new Promise((resolve) => {
    const worker = new Worker(new URL('./xlsx-worker.js', import.meta.url), { type: 'module' });
    let timer;
    const finish = (result) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); resolve(result); };
    const abort = () => finish(problem('已取消解析。'));
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      try { finish(checkedWorkerResult(data)); }
      catch (error) { const failed=problem('解析器回傳資料不完整，無法建立候選；Current 未變更。');
        failed.errors[0].diagnostic=String(error.stack??error);finish(failed); }
    };
    worker.onerror = (e) => { e.preventDefault(); finish(problem('XLSX 解析器無法執行。')); };
    timer = setTimeout(() => finish(problem('XLSX 解析超過 10 秒，已停止；正式資料未變更。')), 10000);
    worker.postMessage(bytes, [bytes]);
  });
  } catch { return problem('檔案讀取或解析器啟動失敗；正式資料未變更。'); }
}
