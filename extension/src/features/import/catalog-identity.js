import {mapSources} from './xlsx-map.js';
import {catalogRows,catalogIssue,isNameLayout} from './catalog-names.js';
import {canonicalContent} from './compare.js';
const validId=v=>typeof v==='string'&&/^(?!(?:constructor|prototype)$)[a-z][a-zA-Z0-9_-]{0,63}$/.test(v);
const fail=e=>({ok:false,errors:[{type:'CATALOG_IDENTITY',path:'/',location:e.location,reason:e.message.replace(/^VERSION_MISSING /,''),hint:'請核對主檔名稱與指出的位置；未保存任何資料。'}]});
const config=p=>{const {id,...rest}=p;return canonicalContent(rest);};
export function createCatalogSession(payload,current,createId=kind=>(kind==='platforms'?'p-':'t-')+crypto.randomUUID()){
 const input=structuredClone(payload?.grids),decisions=new Map(),generated=new Map();
 function inspect(){try{
  if(!isNameLayout(input))throw catalogIssue('名稱選擇範本回傳不完整。','規則總表!E4');
  const entries=[];
  for(const [sheet,width,kind] of [['平台資料',11,'platforms'],['商品品類',4,'productTypes']])for(const {row,values:v} of catalogRows(input[sheet],width))entries.push({sheet,row,kind,id:v[0],name:v[1],key:sheet+'!'+row});
  for(const kind of ['platforms','productTypes'])if(entries.filter(e=>e.kind===kind).length>100)throw catalogIssue('平台或品類超過支援上限 100 筆；未截斷或匯入。',kind==='platforms'?'平台資料!B4':'商品品類!B4');
  const counts=new Map();for(const e of entries)if(e.id!=='')counts.set(e.kind+':'+e.id,(counts.get(e.kind+':'+e.id)??0)+1);
  for(const e of entries)if(e.id!==''&&!validId(e.id))throw catalogIssue('既有內部識別損壞；不會重新編號，請保留原檔並回報。',e.sheet+'!A'+e.row);
  const provisional=structuredClone(input),temporary=new Map(),occupied=new Set(entries.map(e=>e.id));
  entries.forEach((e,i)=>{
   let id=e.id;
   if(e.id===''||counts.get(e.kind+':'+e.id)!==1){let attempt=0;do{id='preflight-catalog-'+i+'-'+attempt++;}while(occupied.has(id));occupied.add(id);temporary.set(e.key,id);}
   provisional[e.sheet]['A'+e.row]=id;
  });
  const preview=mapSources(provisional),old=current?.rulesetId===preview.rulesetId?current:null,used=new Set(),pending=[],resolved=structuredClone(input);
  for(const e of entries)if(e.id!==''&&counts.get(e.kind+':'+e.id)===1)used.add(e.kind+':'+e.id);
  for(const [i,e] of entries.entries()){
   if(e.id!==''&&counts.get(e.kind+':'+e.id)===1)continue;
   const item=preview[e.kind].find(p=>p.id===temporary.get(e.key)),options=(old?.[e.kind]??[]).filter(p=>!used.has(e.kind+':'+p.id));
   let decision=decisions.get(e.key);const exact=options.filter(p=>config(p)===config(item));
   if(decision===undefined&&e.id===''&&exact.length===1)decision='old:'+exact[0].id;
   if(decision===undefined){pending.push({...e,duplicate:e.id!=='',options:options.map(p=>({value:'old:'+p.id,name:p.name,item:p})),mayKeep:e.id!==''&&!used.has(e.kind+':'+e.id)});continue;}
   let id;
   if(decision==='new'){
    if(!generated.has(e.key)){const occupied=new Set([...entries.filter(x=>x.kind===e.kind).map(x=>x.id),...(old?.[e.kind]??[]).map(p=>p.id),...generated.values()]);let next;
     for(let attempt=0;attempt<32;attempt++){next=createId(e.kind);if(validId(next)&&!occupied.has(next))break;next=null;}if(!next)throw catalogIssue('無法建立唯一識別，未保存。',e.sheet+'!B'+e.row);generated.set(e.key,next);}
    id=generated.get(e.key);
   }else if(decision==='keep'&&e.id!==''&&!used.has(e.kind+':'+e.id))id=e.id;
   else if(decision.startsWith('old:')&&options.some(p=>'old:'+p.id===decision))id=decision.slice(4);
   else throw catalogIssue('同一原有項目不能配對到多筆資料，請重新確認。',e.sheet+'!B'+e.row);
   if(used.has(e.kind+':'+id))throw catalogIssue('主檔身分重複，請確認複製資料是否為新增。',e.sheet+'!B'+e.row);
   used.add(e.kind+':'+id);resolved[e.sheet]['A'+e.row]=id;
  }
  if(pending.length)return {ok:false,pending,notice:old?'請確認主檔是新增，還是修改原有項目；名稱相近不代表相同。':'此裝置沒有相應主檔紀錄，無法恢復其他裝置的原識別；請確認新增。'};
  return {ok:true,draft:mapSources(resolved),originalMode:'replace',format:'xlsx',ruleRows:payload.ruleRows};
 }catch(e){return fail(e);}}
 return {inspect,choose(key,value){decisions.set(key,value);return inspect();},preflight(){
  // All provisional decisions are confined to this disposable session.
  try{for(const [sheet,width] of [['平台資料',11],['商品品類',4]])for(const {row} of catalogRows(input[sheet],width))decisions.set(sheet+'!'+row,'new');return inspect();}catch(e){return fail(e);}
 }};
}
