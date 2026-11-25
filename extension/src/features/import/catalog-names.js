export const NAME_HEADERS={E4:'平台名稱（選擇）',F4:'品類名稱（選擇）',O4:'限制平台名稱（分號分隔）',P4:'限制品類名稱（分號分隔）'};
export const isNameLayout=s=>s?.['規則總表']?.E4===NAME_HEADERS.E4;
export const catalogIssue=(message,location)=>Object.assign(Error(message),{location});
export function catalogRows(grid,width){
 const rows=[...new Set(Object.keys(grid).filter(a=>/^[A-Z]+\d+$/.test(a)&&grid[a]!=='').map(a=>Number(a.replace(/[A-Z]/g,''))).filter(r=>r>=5))].sort((a,b)=>a-b);
 return rows.map(row=>({row,values:Array.from({length:width},(_,i)=>grid[String.fromCharCode(65+i)+row]??'')}));
}
// New-layout adapter. Source formulas and cached helper values are never used.
export function normalizeCatalogNames(input){
 const s=structuredClone(input),rules=s['規則總表'];
 for(const [a,v] of Object.entries(NAME_HEADERS))if(rules[a]!==v)throw catalogIssue('名稱選擇範本欄位不完整。','規則總表!'+a);
 const catalogs=[['平台資料',11],['商品品類',4]].map(([sheet,width])=>{
  const names=new Map(),ids=new Set();
  for(const {row,values:v} of catalogRows(s[sheet],width)){
   if(typeof v[1]!=='string'||!v[1].trim()||/[;；]/.test(v[1]))throw catalogIssue('請填寫可辨識的名稱，名稱不能含分號。',sheet+'!B'+row);
   if(names.has(v[1]))throw catalogIssue('名稱重複，請為不同項目填寫可區分的名稱；不會自動合併。',sheet+'!B'+row);
   names.set(v[1],v[0]);ids.add(v[0]);
  }return {names,ids};
 });
 const resolve=(value,index,location)=>{
  if(value==='')return '';
  const {names,ids}=catalogs[index],named=names.get(value),token=typeof value==='string'?/〔([^〔〕]+)〕$/.exec(value)?.[1]:null;
  if(named!==undefined&&ids.has(value)&&named!==value)throw catalogIssue('名稱與舊編號對應不同項目，請使用可區分的名稱。',location);
  if(named!==undefined)return named;if(ids.has(value))return value;if(token&&ids.has(token))return token;
  throw catalogIssue('找不到已登錄的'+(index===0?'平台':'品類')+'，請先到主檔登錄或選擇有效名稱；不會猜測相似名稱。',location);
 };
 const multiple=(v,i,loc)=>v===''?'':String(v).split(/[;；]/).map(x=>resolve(x,i,loc)).join(',');
 const branches=(v,loc)=>v===''?'':String(v).split(';').map(x=>{const at=x.indexOf(':');if(at<1)throw catalogIssue('子流程選項不完整。',loc);return resolve(x.slice(0,at),0,loc)+x.slice(at);}).join(';');
 for(const {row,values:v} of catalogRows(rules,22)){
  const kind=({'共同規則':'GLOBAL','平台規則':'PLATFORM','品類規則':'PRODUCT TYPE'})[v[1]]??v[1];
  if(kind==='GLOBAL'&&[v[4],v[5],v[14],v[15],v[16],v[19]].some(x=>x!==''))throw catalogIssue('共同規則不能限制平台、品類或條件，請選擇正確層級。','規則總表!B'+row);
  if(kind==='PLATFORM'&&v[5]!==''||kind==='PRODUCT TYPE'&&v[4]!=='')throw catalogIssue('所屬欄與適用層級不一致；額外限制請填限制欄。','規則總表!'+(kind==='PLATFORM'?'F':'E')+row);
  for(const [col,index] of [['E',0],['F',1]])rules[col+row]=resolve(v[col==='E'?4:5],index,'規則總表!'+col+row);
  for(const [col,index] of [['O',0],['P',1]])rules[col+row]=multiple(v[col==='O'?14:15],index,'規則總表!'+col+row);
  for(const [kindValue,col,duplicate] of [['PLATFORM','E','O'],['PRODUCT TYPE','F','P']])if(kind===kindValue){
   if(rules[col+row]==='')throw catalogIssue('請選擇所屬'+(col==='E'?'平台':'品類')+'名稱。','規則總表!'+col+row);
   if(rules[duplicate+row]!==''&&rules[duplicate+row]!==rules[col+row])throw catalogIssue('重複限制欄請留白，由系統依所選名稱處理。','規則總表!'+duplicate+row);
  }
  rules['T'+row]=branches(v[19],'規則總表!T'+row);
 }
 for(const {row,values:v} of catalogRows(s['例外規則'],24)){
  for(const [col,index] of [['D',0],['E',1]])s['例外規則'][col+row]=multiple(v[col==='D'?3:4],index,'例外規則!'+col+row);
  s['例外規則']['W'+row]=branches(v[22],'例外規則!W'+row);
 }
 Object.assign(rules,{E4:'平台 ID',F4:'品類 ID',O4:'適用平台 IDs（逗號分隔）',P4:'適用品類 IDs（逗號分隔）'});return s;
}
