import { isNameLayout, normalizeCatalogNames } from './catalog-names.js';
// Explicit current-template adapter; rejects ambiguity, never evaluates formulas.
export function mapSources(s){
 if(isNameLayout(s))return mapSources(normalizeCatalogNames(s));
 for(const [sheet,headers] of Object.entries({'規則總表':{A4:'規則 ID',B4:'適用層級',C4:'標題',D4:'規則正文',R4:['來源 ID','來源文件（選擇名稱）']},'例外規則':{A4:'例外 ID',G4:'目標規則 ID',H4:'行為',I4:'完整替換正文'},'平台資料':{A4:'平台 ID',D4:'啟用 enabled（TRUE/FALSE）'},'商品品類':{A4:'品類 ID'},'來源資料':{A4:'來源 ID',B4:'文件版本 documentVersion',E4:'資料性質 nature'},'人工條件':{A4:'factId',C4:'允許值（逗號分隔）'},'轉檔設定':{A4:'JSON 欄位路徑',B4:'人類設定值'}}))for(const [cell,expected] of Object.entries(headers))if(!(Array.isArray(expected)?expected:[expected]).includes(s[sheet]?.[cell]))throw Error('HEADER_CONTRACT '+sheet+'!'+cell);
 const cols=n=>{let t='';for(;n;n=Math.floor((n-1)/26))t=String.fromCharCode(65+(n-1)%26)+t;return t;};
 function rows(name,n){const grid=s[name],out=[];const last=Math.max(4,...Object.keys(grid).map(k=>Number(k.replace(/\D/g,''))));for(let row=5;row<=last;row++){const values=Array.from({length:n},(_,i)=>grid[cols(i+1)+row]??'');if(values.some((v,i)=>v!==''&&!(name==='規則總表'&&[7,8,20].includes(i))))out.push({row,v:values});}return out;}
 const split=(v,sep=',')=>v===''?[]:String(v).split(sep);
 const number=v=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw Error('INTEGER_REQUIRED');return v;};
 const pairs=(v,delimiter,first,second)=>split(v,delimiter).map(x=>{const at=x.indexOf(':');if(at<=0||at===x.length-1)throw Error('PAIR_REQUIRED');return {[first]:x.slice(0,at),[second]:x.slice(at+1)};});
 function when(v){return split(v,';').map(x=>{const at=x.indexOf('=');if(at<=0||at===x.length-1)throw Error('CONDITION_REQUIRED');return {factId:x.slice(0,at),equals:x.slice(at+1)};});}
 function applies(platforms,types,conditions,branches){return {platformIds:platforms===''?null:split(platforms),subflowRefs:branches===''?null:pairs(branches,';','platformId','branchId'),productTypeIds:types===''?null:split(types),whenAll:when(conditions)};}
 function placements(attention,sop,checklist){return [['attention',attention],['sop',sop],['checklist',checklist]].filter(([,x])=>x!=='').map(([section,v])=>({section,order:number(v)}));}
 const settings=Object.create(null);for(const {v:[key,value]} of rows('轉檔設定',3)){if(typeof key!=='string'||!key||Object.hasOwn(settings,key))throw Error('SETTING_KEY');settings[key]=value;}
 const required=['schemaVersion','mode','rulesetId','rulesetVersion','versions.global','versions.exceptions','versions.catalogs'];for(const k of required)if(!Object.hasOwn(settings,k)||settings[k]==='')throw Error('SETTING_MISSING '+k);
 const authoring=settings.schemaVersion==='3.1.0';
 if(!['3.0.0','3.1.0'].includes(settings.schemaVersion)||settings.mode!=='replace')throw Error('SCHEMA_OR_MODE');
 if(authoring&&s['規則總表'].V4!=='來源方式（自行制定／引用文件）')throw Error('AUTHORING_LAYOUT');
 const sourceRows=rows('來源資料',5),sources=sourceRows.map(({v:[id,documentVersion,title,documentPath,nature]})=>({id,documentVersion,title,documentPath,nature}));
 const sourceMap=new Map();for(const source of sources){if(sourceMap.has(source.id))throw Error('AMBIGUOUS_SOURCE_VERSION');sourceMap.set(source.id,source);}
 const sourceRefs=(selection,policyId,locator,location)=>{
  // Display title may change; the explicit stable ID suffix remains identity.
  // Plain IDs stay supported for all four historical workbook baselines.
  const id=sourceMap.has(selection)?selection:typeof selection==='string'?/〔([^〔〕]+)〕$/.exec(selection)?.[1]:undefined;
  const source=sourceMap.get(id);if(!source){const e=Error('SOURCE_MISSING '+selection);e.location=location;throw e;}
  return [{sourceId:id,documentVersion:source.documentVersion,policyId,locator}];};
 const modern=s['平台資料'].K4==='平台版本（必填）'&&s['商品品類'].D4==='品類版本（必填）';
 const legacy=!s['平台資料'].K4&&!s['商品品類'].D4;if(!modern&&!legacy)throw Error('TEMPLATE_LAYOUT');
 const platformRows=rows('平台資料',modern?11:10),typeRows=rows('商品品類',modern?4:3);
 const platforms=platformRows.map(({v:[id,name,,enabled,order,strategy,subflow,hosts,paths,branches]})=>{
  const h=split(hosts,';'),p=split(paths,';'),b=split(branches,';');if(p.length>h.length||b.length>h.length)throw Error('SITE_ALIGNMENT');
  return {id,name,enabled,order:number(order),strategy,subflows:pairs(subflow,';','id','name'),sites:h.map((host,i)=>({host,...(p[i]?{path:p[i]}:{}),...(b[i]?{branch:b[i]}:{})}))};
 });
 const productTypes=typeRows.map(({v:[id,name]})=>({id,name}));
 const pVersions=Object.create(null),tVersions=Object.create(null);
 for(const [rows,out,prefix,index] of [[platformRows,pVersions,'versions.platforms.',10],[typeRows,tVersions,'versions.productTypes.',3]])for(const {v,row} of rows){if(Object.hasOwn(out,v[0]))throw Error('DUPLICATE_ID');out[v[0]]=modern?v[index]:settings[prefix+v[0]];if(out[v[0]]===undefined||out[v[0]]===''){const e=Error('VERSION_MISSING 請填寫'+(index===10?'平台':'品類')+'版本；系統不會猜測版本。');e.location=(index===10?'平台資料!K':'商品品類!D')+row;throw e;}}
 for(const k of Object.keys(settings)){if(k.startsWith('已停用｜')){if(!modern)throw Error('ARCHIVE_IN_LEGACY');continue;}if(required.includes(k))continue;const match=/^versions\.(platforms|productTypes)\.(.+)$/.exec(k);if(!match||modern)throw Error('UNKNOWN_OR_DOUBLE_SETTING '+k);if(!Object.hasOwn(match[1]==='platforms'?pVersions:tVersions,match[2]))throw Error('ORPHAN_VERSION');}
 const scope=(kind,platformId,typeId)=>kind==='GLOBAL'?{kind:'global'}:kind==='PLATFORM'?{kind:'platform',platformId}:kind==='PRODUCT TYPE'?{kind:'productType',productTypeId:typeId}:(()=>{throw Error('SCOPE_KIND '+kind)})();
 const rules=rows('規則總表',authoring?22:21).filter(({v})=>!authoring||v.some((x,i)=>x!==''&&![0,7,8,20,21].includes(i))).map(({v,row})=>{
  const location='規則總表!R'+row;
  if(authoring&&!['自行制定','引用文件'].includes(v[21])){const e=Error('請選擇自行制定或引用文件');e.location='規則總表!V'+row;throw e;}
  if(authoring&&v[21]==='自行制定'&&[v[17],v[18],v[6]].some(x=>x!=='')){const e=Error('自行制定仍有來源欄位，請確認引用方式；不會自動丟棄來源');e.location=location;throw e;}
  if(authoring){v[1]=({'共同規則':'GLOBAL','平台規則':'PLATFORM','品類規則':'PRODUCT TYPE'})[v[1]]??v[1];
   for(const [index,items] of [[4,platforms],[5,productTypes]])if(v[index]!==''&&!items.some(x=>x.id===v[index])){
    const id=typeof v[index]==='string'?/〔([^〔〕]+)〕$/.exec(v[index])?.[1]:undefined;
    if(id&&items.some(x=>x.id===id))v[index]=id;
   }}
  const p=authoring&&v[1]==='PLATFORM'&&v[14]===''?v[4]:v[14];
  return {id:v[0],scope:scope(v[1],v[4],v[5]),title:v[2],content:v[3],category:authoring&&v[9]===''?'workflow':v[9],priority:authoring&&v[10]===''?'medium':v[10],
   placements:authoring&&[v[11],v[12],v[13]].every(x=>x==='')?[{section:'sop',order:row-5}]:placements(v[11],v[12],v[13]),
   appliesTo:applies(p,authoring&&v[1]==='PRODUCT TYPE'&&v[15]===''?v[5]:v[15],v[16],v[19]),
   sourceRefs:authoring&&v[21]==='自行制定'?[]:sourceRefs(v[17],v[18],v[6],location),
   ...(authoring?{origin:v[21]==='自行制定'?'selfAuthored':'documentReferenced'}:{})};});
 const exceptions=rows('例外規則',24).map(({v})=>{
  const matches=rules.filter(r=>r.id===v[6]&&(r.scope.kind==='global'||r.scope.kind==='platform'&&r.scope.platformId===v[3]||r.scope.kind==='productType'&&r.scope.productTypeId===v[4]));if(matches.length!==1&&!(authoring&&matches.length===0))throw Error('TARGET_MISSING_OR_AMBIGUOUS '+v[6]);
  // ID-less target is unresolved, never inferred from the exception's range:
  // a platform-limited exception can legitimately target a GLOBAL rule.
  const targetScope=matches[0]?.scope??{kind:'unresolved'};
  return {id:v[0],target:{...targetScope,ruleId:v[6]},action:v[7],appliesTo:applies(v[3],v[4],v[13],v[22]),reason:v[12],sourceRefs:sourceRefs(v[20],v[21],v[9]),...(v[7]==='replace'?{replacement:{title:v[14],content:v[8],category:v[15],priority:v[16],placements:placements(v[17],v[18],v[19])}}:{})};
 });
 const facts=rows('人工條件',4).map(({v:[id,name,values]})=>({id,name,values:split(values)}));
 return {schemaVersion:settings.schemaVersion,mode:'replace',rulesetId:settings.rulesetId,rulesetVersion:settings.rulesetVersion,versions:{global:settings['versions.global'],exceptions:settings['versions.exceptions'],catalogs:settings['versions.catalogs'],platforms:pVersions,productTypes:tVersions},sources,productTypes,facts,platforms,rules,exceptions};
}
