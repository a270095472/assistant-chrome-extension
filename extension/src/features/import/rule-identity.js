import { canonicalContent } from './compare.js';
import { parseCandidate } from './validate.js';
const validId = value => typeof value === 'string' && /^(?!(?:constructor|prototype)$)[a-z][a-zA-Z0-9_-]{0,63}$/.test(value);
const key = rule => canonicalContent([rule.scope, rule.id]);
const content = rule => { const { id, ...rest } = rule; return canonicalContent({ ...rest, origin: rest.origin ?? 'documentReferenced' }); };
const referenced = (data, rule) => data?.exceptions?.some(e => canonicalContent(e.target) === canonicalContent({ ...rule.scope, ruleId: rule.id }));
const error = reason => ({ok:false, errors:[{type:'RULE_IDENTITY',path:'/rules',reason,hint:'請確認規則的新增／修改意圖；正式資料尚未變更。'}]});

// Session-only allocation. The committed Current is the sole persistent ID map;
// Previous restores its exact IDs/content. No shadow store or deleted history.
export function createIdentitySession(input, current, rows = [], createId = () => 'r-' + crypto.randomUUID()) {
  const draft = structuredClone(input), generated = new Map(), decisions = new Map();
  const old = current?.rulesetId === draft.rulesetId && ['3.0.0','3.1.0'].includes(current?.schemaVersion) ? current.rules : [];
  const inputContent=draft.rules.map(content),oldContent=old.map(content),inputCounts=new Map();
  for(const value of inputContent)inputCounts.set(value,(inputCounts.get(value)??0)+1);
  const counts = new Map();
  for(const r of draft.rules)if(r.id!=='')counts.set(key(r),(counts.get(key(r))??0)+1);
  function inspect() {
    if(draft.rules.length>2000)return error('規則超過支援上限 2000 筆；沒有截斷或匯入。');
    const candidate = structuredClone(draft), claimed = new Set(), consumedOld = new Set(), pending = [];
    for(const r of candidate.rules)if(r.id!==''&&!validId(r.id))return error('規則編號格式不合法；不會自動改寫既有編號。');
    // Reserve every explicit unambiguous identity before processing blank rows.
    for(const r of candidate.rules)if(r.id!==''&&counts.get(key(r))===1)claimed.add(key(r));
    const allocate = index => {
      if(!generated.has(index)){
        const occupied=new Set([...draft.rules,...old].map(r=>r.id));
        for(const value of generated.values())occupied.add(value);
        let id;for(let attempt=0;attempt<32;attempt++){id=createId();if(validId(id)&&!occupied.has(id))break;id=null;}
        if(!id)throw Error('無法建立唯一規則識別；未寫入');generated.set(index,id);
      }return generated.get(index);
    };
    for(const [index,r] of candidate.rules.entries()) {
      const duplicate = r.id!==''&&counts.get(key(r))>1;
      if(r.id!==''&&!duplicate)continue;
      const available=old.map((rule,i)=>({rule,i})).filter(({rule,i})=>!claimed.has(key(rule))&&!consumedOld.has(i));
      const exact=available.filter(({i})=>oldContent[i]===inputContent[index]);
      const decision=decisions.get(index);
      if(decision===undefined){
        const sameInputs=inputCounts.get(inputContent[index]);
        if(!duplicate&&sameInputs===1&&exact.length===1&&!referenced(current,exact[0].rule)&&!referenced(draft,exact[0].rule)){
          r.id=exact[0].rule.id;claimed.add(key(r));consumedOld.add(exact[0].i);continue;
        }
        if(!duplicate&&sameInputs===1&&!old.length){r.id=allocate(index);claimed.add(key(r));continue;}
        // Do not infer edit vs delete/add, even when exactly one old row remains.
        pending.push({index,row:rows[index]??null,rule:structuredClone(r),duplicate,
          options:pending.length?[]:available.filter(({rule})=>!duplicate||key(rule)===key(r)).map(({rule,i})=>({value:'old:'+i,title:rule.title,content:rule.content,scope:rule.scope,appliesTo:rule.appliesTo})),
          mayKeep:duplicate&&!claimed.has(key(r)),linked:exact.some(({rule})=>referenced(current,rule)||referenced(draft,rule))});
        continue;
      }
      if(decision==='new')r.id=allocate(index);
      else if(decision==='keep'&&duplicate&&!claimed.has(key(r))) { /* user chose original copy */ }
      else {
        const match=/^old:(\d+)$/.exec(decision), found=match&&available.find(x=>x.i===Number(match[1]));
        if(!found)return error('同一條原規則不能配對到多筆資料，請重新確認。');
        r.id=found.rule.id;consumedOld.add(found.i);
      }
      if(claimed.has(key(r)))return error('規則身分重複，請選擇哪筆為新增副本。');
      claimed.add(key(r));
    }
    if(pending.length)return {ok:false,pending,notice:old.length?'請確認這些資料是修改原規則，還是新增規則。':'此裝置沒有可配對的規則紀錄；僅建立本機身分，無法恢復其他裝置的原編號。'};
    for(const e of candidate.exceptions)if(e.target.kind==='unresolved'){
      const previous=current?.rulesetId===draft.rulesetId?current.exceptions?.find(old=>old.id===e.id&&old.target.ruleId===e.target.ruleId):null;
      if(previous)e.target=structuredClone(previous.target);
      else{
        const targets=candidate.rules.filter(r=>r.id===e.target.ruleId&&(r.scope.kind==='global'||r.scope.kind==='platform'&&e.appliesTo.platformIds?.includes(r.scope.platformId)));
        if(targets.length!==1)return error('例外的原規則無法唯一辨識，請保留明確目標，不會自動改接。');
        e.target={...targets[0].scope,ruleId:e.target.ruleId};
      }
    }
    const checked=parseCandidate(JSON.stringify(candidate));
    if(!checked.ok)checked.errors=checked.errors.map(e=>{
      const m=/^\/rules\/(\d+)(?:\/([^/]+))?/.exec(e.path);if(!m||!rows[Number(m[1])])return e;
      const rule=candidate.rules[Number(m[1])];let col=({id:'A',scope:'B',title:'C',content:'D',category:'J',priority:'K',placements:'L',appliesTo:'O',sourceRefs:'R',origin:'V'})[m[2]]??'A';
      if(e.path.endsWith('/platformId')||e.type==='RULE_SCOPE_MISMATCH'&&rule.scope.kind==='platform')col='E';
      if(e.path.endsWith('/policyId'))col='S';if(e.path.endsWith('/locator'))col='G';
      return {...e,jsonPath:e.path,location:'規則總表!'+col+rows[Number(m[1])],scopeKind:rule.scope.kind};
    });
    return {...checked,originalMode:'replace',format:'xlsx',identityNotice:old.length?'規則識別以本次已確認配對與 Current 為準。':'此裝置沒有可配對紀錄；新規則已建立本機識別，並非恢復其他裝置的原編號。'};
  }
  return { inspect, choose(index,value){if(!Number.isInteger(index)||index<0||index>=draft.rules.length)throw Error('Invalid row');decisions.set(index,value);return inspect();} };
}
