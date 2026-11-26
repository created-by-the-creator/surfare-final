import fs from 'node:fs';
import {detect} from '../backend/server/services/detect.js';
import {analyzePatterns} from '../backend/lib/pattern-detection.js';
const dir='artifacts/corpus-evaluation-200';
const local=JSON.parse(fs.readFileSync(`${dir}/local.json`,'utf8'));const rows=[];
for(const item of local.rows){
 const urls=analyzePatterns(item.text,item.kind==='links'?[item.text]:[]).urls.map(r=>r.url).filter(u=>u.length<=2048);
 const response=await detect(new Request('http://localhost/api/detect',{method:'POST',body:JSON.stringify({kind:({text:'message',links:'link',qr:'qr',image:'image'})[item.kind],text:item.text,urls,uncertain:item.uncertain,ai:false})}),{},()=>{throw Error('Network forbidden for baseline');});
 const result=await response.json();
 rows.push({id:item.id,kind:item.kind,label:item.label,level:result.level,flagged:result.level?['High risk','Suspicious'].includes(result.level):null,signals:result.indicators?.map(r=>r.id)||[],onlineStatus:result.aiReview?.status});
}
fs.writeFileSync(`${dir}/backend-local.json`,JSON.stringify({scope:'Diagnostic baseline: same backend as AI double-check, AI disabled and external networking forbidden. Separates backend/reference differences from AI contribution.',checkedAt:new Date().toISOString(),rows},null,2));
console.log('Saved',rows.length,'backend-only baseline results.');
