// UI-independent persistence adapter. A future sync adapter can wrap these methods.
export const TABLES = ['checks','notes','worksheets','problems','mistakes','analyses','mocks','memorize','edits'];
let database;
const request = r => new Promise((resolve,reject) => {r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const finished = tx => new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('保存が中断されました'));});
export async function openStore(){
 if(database)return database;
 const r=indexedDB.open('public-cosme-study-notebook',1);
 r.onupgradeneeded=()=>{for(const name of TABLES)r.result.createObjectStore(name,{keyPath:'id'});};
 database=await request(r);database.onversionchange=()=>{database.close();database=null;};return database;
}
export async function all(table){const db=await openStore();return request(db.transaction(table).objectStore(table).getAll());}
export async function put(table,value){const db=await openStore();const tx=db.transaction(table,'readwrite');const done=finished(tx);tx.objectStore(table).put(value);await done;return value;}
export async function remove(table,id){const db=await openStore();const tx=db.transaction(table,'readwrite');const done=finished(tx);tx.objectStore(table).delete(id);await done;}
export async function snapshot(){const db=await openStore();const tx=db.transaction(TABLES);const tables=Object.fromEntries(await Promise.all(TABLES.map(async name=>[name,await request(tx.objectStore(name).getAll())])));return {app:'cosme-kentei-1kyu-public',version:1,exportedAt:new Date().toISOString(),tables};}
const str=x=>typeof x==='string';
const date=x=>str(x)&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const textFields = (row, fields) => fields.every(k => str(row[k]));
const strings = value => Array.isArray(value) && value.every(str);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const SKELETON = ['水性','油性','界面活性剤','機能性','安定化・その他'];
const tableLabels = {checks:'チェック',notes:'メモ',worksheets:'週の表',problems:'問題記録',mistakes:'間違いノート',analyses:'成分分析',mocks:'模試',memorize:'直前暗記',edits:'まとめ・比較'};
function validRow(name, row) {
 switch (name) {
  case 'checks': return typeof row.checked === 'boolean' && (row.date === '' || date(row.date));
  case 'notes': return str(row.text) && (['settings:testDate','settings:studyStart'].includes(row.id) ? row.text === '' || date(row.text) : row.id !== 'settings:weeklyHours' || (Number.isFinite(Number(row.text)) && Number(row.text) >= 0.5 && Number(row.text) <= 80));
  case 'worksheets': return textFields(row,['weekId','title']) && plain(row.cells) && Object.values(row.cells).every(str);
  case 'problems': return textFields(row,['problemNo','theme']) && row.problemNo.trim() && Array.isArray(row.attempts) && row.attempts.length > 0 && row.attempts.every(a => plain(a) && date(a.date) && ['o','t','x'].includes(a.result) && (a.result === 'o' ? a.miss === '' : ['A','B','C','D'].includes(a.miss)));
  case 'mistakes': return textFields(row,['problemNo','point','correct','why','nextTip']);
  case 'analyses': return textFields(row,['product_name','product_type','full_ingredients','explain_30s']) && Array.isArray(row.major) && row.major.every(r => strings(r) && r.length === 3) && plain(row.skeleton) && Object.values(row.skeleton).every(str) && Object.keys(row.skeleton).every(k=>SKELETON.includes(k));
  case 'mocks': return date(row.date) && textFields(row,['round','answerTime','reviewTime','weakness','improvement']) && Number.isInteger(row.score) && Number.isInteger(row.total) && row.total > 0 && row.score >= 0 && row.score <= row.total && plain(row.misses) && ['A','B','C','D'].every(k=>Number.isInteger(row.misses[k]) && row.misses[k]>=0);
  case 'memorize': return textFields(row,['q','a']) && Array.isArray(row.checks) && row.checks.every(date);
  case 'edits': {
   if (!plain(row.value)) return false;
   if (row.id.startsWith('compare:')) return Object.values(row.value).every(str);
   if (row.id.startsWith('chapter:')) return Array.isArray(row.value.rows) && row.value.rows.every(r=>strings(r)&&r.length===3) && str(row.value.explain) && (row.value.photo === undefined || row.value.photo === '' || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(row.value.photo));
   return false;
  }
  default: return false;
 }
}
export function validateBackup(value) {
 if (value?.app !== 'cosme-kentei-1kyu-public' || value.version !== 1 || !plain(value.tables) || TABLES.some(t=>!Array.isArray(value.tables[t]))) throw Error('このアプリのバックアップではありません');
 for (const name of TABLES) {
  const seen = new Set();
  for (const row of value.tables[name]) {
   if (!plain(row) || !str(row.id) || !row.id || seen.has(row.id)) throw Error('重複または不正なIDがあります');
   seen.add(row.id);
   if (!validRow(name,row)) throw Error(`${tableLabels[name]}に不正なデータがあります`);
  }
 }
 if (value.tables.memorize.length > 50) throw Error('直前暗記は50項目までです');
 return value;
}
export async function restore(value){validateBackup(value);const db=await openStore();const tx=db.transaction(TABLES,'readwrite');const done=finished(tx);for(const name of TABLES){const store=tx.objectStore(name);store.clear();for(const row of value.tables[name])store.put(row);}await done;}
export async function clear(){const db=await openStore();const tx=db.transaction(TABLES,'readwrite');const done=finished(tx);for(const name of TABLES)tx.objectStore(name).clear();await done;}
