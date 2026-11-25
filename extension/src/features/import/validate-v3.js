import schema from './validate-schema-3.generated.js';

import schema31 from './validate-schema-31.generated.js';
const issue = (type, path, reason, context = {}) => ({type,path,reason,hint:'請依候選格式契約修正資料；不會自動補造來源。',...context});
const result = (errors,candidate=null) => ({ok:!errors.length,errors,candidate:errors.length?null:candidate});
export function structure3(value) {
  const validator = value?.schemaVersion === '3.1.0' ? schema31 : schema;
  if (validator(value)) return [];
  // Generated mode/action dispatch validates only the applicable branch. Prefer
  // a concrete error over combination summaries; expose just one bounded issue.
  let e = validator.errors.find(e => e.keyword !== 'oneOf') ?? validator.errors[0];
  // Scope branches are contract oneOf alternatives. Keep the validator's
  // decision unchanged, but describe the branch selected by the actual kind,
  // rather than reporting GLOBAL's additionalProperties for a PLATFORM input.
  const scopeRoot = /^(.*\/scope)(?:\/.*)?$/.exec(e.instancePath)?.[1];
  let scopeKind;
  if (scopeRoot && e.schemaPath.startsWith('#/$defs/scope/oneOf/')) {
    const scope = scopeRoot.slice(1).split('/').reduce((v, k) => v?.[k.replaceAll('~1', '/').replaceAll('~0', '~')], value);
    scopeKind = scope?.kind;
    const branch = { global: 0, platform: 1, productType: 2 }[scope?.kind];
    if (branch !== undefined) e = validator.errors.find((item) => item.schemaPath.startsWith('#/$defs/scope/oneOf/' + branch + '/') &&
      (item.instancePath === scopeRoot || item.instancePath.startsWith(scopeRoot + '/')) && item.keyword !== 'oneOf') ?? e;
  }
  const property = e.params.missingProperty ?? e.params.additionalProperty ?? e.params.tag;
  const segment = property === undefined ? '' : '/' + property.replaceAll('~', '~0').replaceAll('/', '~1');
  const path = (e.instancePath + segment) || '/';
  const detail = e.keyword === 'discriminator' ? `${e.params.tag} 必須是已知的字串選項。`
    : e.keyword === 'pattern' && e.params.pattern === '\\S' ? '文字必須包含非空白字元。'
    : e.keyword === 'additionalProperties' ? '含有不允許的未知欄位。'
    : e.keyword === 'required' ? '缺少必填欄位。' : '欄位不符合限制。';
  return [issue('INVALID_STRUCTURE', path, `欄位不符合 Schema ${value?.schemaVersion === '3.1.0' ? '3.1.0' : '3.0.0'}：${e.keyword}；${detail}`,
    { keyword: e.keyword, schemaPath: e.schemaPath, scopeKind })];
}
// Contract collections are sets; compound identity components are ordered.
// Neither comparison changes input text, identifiers or Unicode normalization.
const canonicalSets = value => JSON.stringify(normalizeSets(value));
const orderedKey = (...parts) => JSON.stringify(parts);
function normalizeSets(v) {
  if(Array.isArray(v)) return v.map(normalizeSets).sort((a,b)=>{a=JSON.stringify(a);b=JSON.stringify(b);return a<b?-1:a>b?1:0;});
  if(v && typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalizeSets(v[k])]));
  return v;
}
const scopeKey=s=>canonicalSets(s);
const ruleKey=r=>canonicalSets({...r.scope,ruleId:r.id});
const targetKey=t=>canonicalSets(t);
const subset=(a,b)=>b===null || (a!==null && a.every(x=>b.includes(x)));

function createFlowRanges(platforms) {
  const flows = [], indices = new Map(), platformIndices = new Map(), cache = new Map();
  for (const p of platforms.values()) {
    const owned = [];
    for (const branchId of p.subflows.length ? p.subflows.map(b => b.id) : [null]) {
      const index = flows.length;
      flows.push({ platformId: p.id, branchId });
      indices.set(orderedKey(p.id, branchId), index);
      owned.push(index);
    }
    platformIndices.set(p.id, owned);
  }
  const mask = a => {
    // Product tags and facts do not change the finite platform/flow universe.
    const key = canonicalSets({ platformIds: a.platformIds, subflowRefs: a.subflowRefs });
    if (cache.has(key)) return cache.get(key);
    const bits = new Uint32Array(Math.ceil(flows.length / 32));
    const add = index => { if (index !== undefined) bits[index >>> 5] |= 1 << (index & 31); };
    if (a.subflowRefs !== null) {
      for (const r of a.subflowRefs) add(indices.get(orderedKey(r.platformId, r.branchId)));
    } else {
      for (const id of a.platformIds ?? platforms.keys()) for (const index of platformIndices.get(id) ?? []) add(index);
    }
    const words = [];
    for (let i = 0; i < bits.length; i++) if (bits[i]) words.push(i);
    const value = { bits, words };
    cache.set(key, value);
    return value;
  };
  const contains = (a, b) => {
    if (a === b) return true;
    for (const i of a.words) if ((a.bits[i] & ~b.bits[i]) !== 0) return false;
    return true;
  };
  const intersects = (a, b) => {
    if (a === b) return a.words.length !== 0;
    for (const i of a.words.length < b.words.length ? a.words : b.words) if ((a.bits[i] & b.bits[i]) !== 0) return true;
    return false;
  };
  const describeIntersection = (a, b) => {
    const possibleIntersection = [];
    let intersectionCount = 0;
    for (let i = 0; i < flows.length; i++) {
      if ((a.bits[i >>> 5] & b.bits[i >>> 5] & (1 << (i & 31))) === 0) continue;
      intersectionCount++;
      // Bounded diagnostics must not recreate the original resource amplification.
      if (possibleIntersection.length < 8) possibleIntersection.push({ ...flows[i] });
    }
    return { possibleIntersection, intersectionCount, intersectionTruncated: intersectionCount > possibleIntersection.length };
  };
  return { mask, contains, intersects, describeIntersection };
}

function disjointFacts(a, b) {
  const small = a.size < b.size ? a : b;
  const other = small === a ? b : a;
  for (const [id, value] of small) if (other.has(id) && other.get(id) !== value) return true;
  return false;
}

export function semantics3(data, platformValidator) {
  const errors=[];
  const stop=Symbol('limit');
  const add=(type,path,reason,context)=>{errors.push(issue(type,path,reason,context));if(errors.length===100)throw stop;};
  const unique=(items,key,path,type='DUPLICATE_CONFIG')=>{const seen=new Set();for(const item of items){const k=key(item);if(seen.has(k))add(type,path,'配置身分或集合鍵重複。');seen.add(k);}};
  try {
    errors.push(...platformValidator({...data,rules:[]}).slice(0,100));
    if(errors.length===100) return errors;
    const platforms=new Map(data.platforms.map(p=>[p.id,p]));
    const types=new Set(data.productTypes.map(p=>p.id));
    const facts=new Map(data.facts.map(f=>[f.id,f]));
    const sources=new Set(data.sources.map(s=>orderedKey(s.id,s.documentVersion)));
    unique(data.sources,s=>orderedKey(s.id,s.documentVersion),'/sources');
    unique(data.productTypes,s=>s.id,'/productTypes');unique(data.facts,s=>s.id,'/facts');
    for(const key of ['platforms','productTypes']) {
      const actual=Object.keys(data.versions[key]).sort();
      const expected=(key==='platforms'?data.platforms:data.productTypes).map(x=>x.id).sort();
      if(JSON.stringify(actual)!==JSON.stringify(expected))add('VERSION_MAP_MISMATCH',`/versions/${key}`,'版本 map 必須精確對應最終目錄。');
    }
    const refs=(items,path)=>{unique(items,canonicalSets,path);for(const r of items)if(!sources.has(orderedKey(r.sourceId,r.documentVersion)))add('SOURCE_REFERENCE_INVALID',path,'來源 ID／文件版本不存在。',{sourceId:r.sourceId,documentVersion:r.documentVersion});};
    const placements=(items,path)=>unique(items,p=>p.section,path,'DUPLICATE_PLACEMENT');
    const range=(a,path)=>{
      for(const id of a.platformIds??[])if(!platforms.has(id))add('PLATFORM_REFERENCE_INVALID',path,'平台不存在。');
      for(const id of a.productTypeIds??[])if(!types.has(id))add('PRODUCT_TYPE_REFERENCE_INVALID',path,'品類不存在。');
      for(const r of a.subflowRefs??[])if(!platforms.get(r.platformId)?.subflows.some(b=>b.id===r.branchId) || (a.platformIds!==null&&!a.platformIds.includes(r.platformId)))add('SUBFLOW_REFERENCE_INVALID',path,'流程不存在或超出平台範圍。');
      unique(a.whenAll,f=>f.factId,path,'DUPLICATE_FACT_CONDITION');
      for(const f of a.whenAll)if(!facts.get(f.factId)?.values.includes(f.equals))add('FACT_REFERENCE_INVALID',path,'人工條件或值不存在。');
    };
    const flowRanges = createFlowRanges(platforms);
    const contained=(a,b)=>{
      if(!subset(a.platformIds,b.platformIds)||!subset(a.productTypeIds,b.productTypeIds))return false;
      if (!flowRanges.contains(flowRanges.mask(a), flowRanges.mask(b))) return false;
      return b.whenAll.every(f=>a.whenAll.some(g=>f.factId===g.factId&&f.equals===g.equals));
    };
    unique(data.rules,ruleKey,'/rules','DUPLICATE_RULE_ID');
    const rules=new Map(data.rules.map(r=>[ruleKey(r),r]));
    for(const [i,r] of data.rules.entries()){
      const path=`/rules/${i}`;range(r.appliesTo,path+'/appliesTo');refs(r.sourceRefs,path+'/sourceRefs');placements(r.placements,path+'/placements');
      const a=r.appliesTo,s=r.scope;
      if(s.kind==='global'&&(a.platformIds!==null||a.subflowRefs!==null||a.productTypeIds!==null||a.whenAll.length))add('RULE_SCOPE_MISMATCH',path,'共同規則必須為共同基礎範圍。');
      if(s.kind==='platform'&&(!platforms.has(s.platformId)||canonicalSets(a.platformIds)!==canonicalSets([s.platformId])))add('RULE_SCOPE_MISMATCH',path,'平台 scope 與適用平台必須一致。');
      if(s.kind==='productType'&&(!types.has(s.productTypeId)||canonicalSets(a.productTypeIds)!==canonicalSets([s.productTypeId])))add('RULE_SCOPE_MISMATCH',path,'品類 scope 與適用品類必須一致。');
    }
    unique(data.exceptions,e=>e.id,'/exceptions','DUPLICATE_EXCEPTION_ID');
    const configs=new Map(),groups=new Map();
    for(const [i,e] of data.exceptions.entries()){
      const path=`/exceptions/${i}`;range(e.appliesTo,path+'/appliesTo');refs(e.sourceRefs,path+'/sourceRefs');if(e.replacement)placements(e.replacement.placements,path+'/replacement/placements');
      const key=targetKey(e.target),target=rules.get(key);
      if(!target)add('TARGET_REFERENCE_INVALID',path+'/target','目標普通規則不存在。',{exceptionIds:[e.id],target:e.target});
      else if(!contained(e.appliesTo,target.appliesTo))add('EXCEPTION_SCOPE_OUTSIDE_TARGET',path+'/appliesTo','例外範圍超出目標規則。',{exceptionIds:[e.id],target:e.target});
      const {id,...config}=e,configKey=canonicalSets(config);
      if(configs.has(configKey))add('DUPLICATE_EXCEPTION_CONFIG',path,'不同 ID 的完整業務配置相同。',{exceptionIds:[configs.get(configKey),id],target:e.target});
      configs.set(configKey,id);
      // Share compact masks for equivalent flow ranges; never expand flows per exception.
      const entry={e,effect:canonicalSets({action:e.action,...(e.replacement?{replacement:e.replacement}:{})}),range:flowRanges.mask(e.appliesTo),facts:new Map(e.appliesTo.whenAll.map(f=>[f.factId,f.equals]))};
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry);
    }
    for(const entries of groups.values())for(let i=0;i<entries.length;i++)for(let j=0;j<i;j++){
      const a=entries[i],b=entries[j];if(a.effect===b.effect)continue;
      if(disjointFacts(a.facts,b.facts))continue;
      if(!flowRanges.intersects(a.range,b.range))continue;
      const differentFields=a.e.action!==b.e.action?['action']:Object.keys(a.e.replacement).filter(k=>canonicalSets(a.e.replacement[k])!==canonicalSets(b.e.replacement[k]));
      add('EXCEPTION_EFFECT_CONFLICT','/exceptions','同目標效果不同，流程及單值人工條件無法證明互斥；不同品類可同時命中。',{exceptionIds:[b.e.id,a.e.id],target:a.e.target,...flowRanges.describeIntersection(a.range,b.range),differentFields});
    }
  }catch(e){if(e!==stop)throw e;}
  return errors;
}

export function candidate3(value,current,platformValidator) {
  let errors=structure3(value);if(errors.length)return result(errors);
  let candidate=structuredClone(value);
  if(value.mode==='patch'){
    if(current?.schemaVersion!=='3.0.0')return result([issue('PATCH_SCHEMA_MISMATCH','/schemaVersion','不可跨 Schema patch。')]);
    if(current.mode!=='replace'||structure3(current).length||semantics3(current,platformValidator).length)return result([issue('INVALID_CURRENT','/','current 必須是有效完整狀態。')]);
    if(value.rulesetId!==current.rulesetId)return result([issue('PATCH_RULESET_MISMATCH','/rulesetId','不可跨 ruleset patch。')]);
    if(value.baseRulesetVersion!==current.rulesetVersion)return result([issue('PATCH_BASE_VERSION_MISMATCH','/baseRulesetVersion','patch 基準與 current 不同。')]);
    const fail=(type,path,reason)=>result([issue(type,path,reason)]);
    const upsert=value.exceptions?.upsert??[],remove=value.exceptions?.remove??[];
    if(new Set(upsert.map(e=>e.id)).size!==upsert.length||new Set(remove).size!==remove.length)return fail('PATCH_DUPLICATE_OPERATION','/exceptions','操作 ID 重複。');
    if(upsert.some(e=>remove.includes(e.id)))return fail('PATCH_OPERATION_CONFLICT','/exceptions','同 ID 不可同時 upsert／remove。');
    if(remove.some(id=>!current.exceptions.some(e=>e.id===id)))return fail('PATCH_REMOVE_NOT_FOUND','/exceptions/remove','刪除 ID 不存在 current。');
    const scopes=value.rules?.replaceScopes??[];
    if(new Set(scopes.map(s=>scopeKey(s.scope))).size!==scopes.length)return fail('PATCH_DUPLICATE_SCOPE','/rules','替換 scope 重複。');
    if(scopes.some(s=>s.items.some(r=>scopeKey(r.scope)!==scopeKey(s.scope))))return fail('PATCH_SCOPE_MISMATCH','/rules','items scope 與操作 scope 不同。');
    if(new Set((value.platforms??[]).map(p=>p.id)).size!==(value.platforms??[]).length)return fail('PATCH_DUPLICATE_PLATFORM','/platforms','平台操作重複。');
    candidate=structuredClone(current);
    candidate.rulesetVersion=value.rulesetVersion;candidate.versions=structuredClone(value.versions);
    for(const key of ['sources','productTypes','facts'])if(Object.hasOwn(value,key))candidate[key]=structuredClone(value[key]);
    const ps=new Map(candidate.platforms.map(p=>[p.id,p]));for(const p of value.platforms??[])ps.set(p.id,structuredClone(p));candidate.platforms=[...ps.values()];
    const finalTypes = new Set(candidate.productTypes.map(t => t.id));
    if (scopes.some(({scope}) => scope.kind === 'platform' ? !ps.has(scope.platformId) : scope.kind === 'productType' && !finalTypes.has(scope.productTypeId))) {
      return fail('PATCH_SCOPE_REFERENCE_INVALID', '/rules/replaceScopes', '操作 scope 的 owner 不存在於最終目錄，空 items 也必須引用有效 owner。');
    }
    const touched=new Set(scopes.map(s=>scopeKey(s.scope)));
    candidate.rules=[...candidate.rules.filter(r=>!touched.has(scopeKey(r.scope))),...structuredClone(scopes.flatMap(s=>s.items))];
    const es=new Map(candidate.exceptions.filter(e=>!remove.includes(e.id)).map(e=>[e.id,e]));for(const e of upsert)es.set(e.id,structuredClone(e));candidate.exceptions=[...es.values()];
  }
  errors=structure3(candidate);if(errors.length)return result(errors);
  if (new TextEncoder().encode(JSON.stringify(candidate)).length > 2 * 1024 * 1024) return result([issue('CANDIDATE_SIZE_LIMIT', '/', '完整候選資料超過 UTF-8 2 MiB。')]);
  errors=semantics3(candidate,platformValidator);
  return result(errors,candidate);
}
