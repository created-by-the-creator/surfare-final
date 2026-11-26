import fs from 'node:fs';
import path from 'node:path';
import {detect} from '../backend/server/services/detect.js';
import {aiProviders} from '../backend/server/services/ai-generation.js';
import {analyzePatterns} from '../backend/lib/pattern-detection.js';
import {describeQrPayload} from '../backend/lib/qr-links.js';
import {isPrivateQrPayload} from '../backend/lib/qr-payload.js';
const dir=path.resolve('artifacts/corpus-evaluation-200');
const input=JSON.parse(fs.readFileSync(path.join(dir,'local.json'),'utf8')).rows;
if(input.length!==200)throw Error('Finish all 200 local checks first.');
const output=path.join(dir,'online.json');
const old=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):null;
const rows=old?.rows||[],done=new Set(rows.map(r=>r.id));
const remaining=input.filter(r=>!done.has(r.id)).sort((a,b)=>a.id.slice(-3).localeCompare(b.id.slice(-3))||a.kind.localeCompare(b.kind));
let cursor=0;const startedAt=old?.startedAt||new Date().toISOString();
const providers=aiProviders(process.env).map(({providerId,model})=>({providerId,model}));
const write=()=>fs.writeFileSync(output,JSON.stringify({startedAt,updatedAt:new Date().toISOString(),providers,scope:'200 dataset-derived inputs through the actual backend detect service using live configured providers, with actual offline browser extraction. Same inputs and original source labels as local check. No test URL pages visited; not a deployed UI or live reputation test. Two concurrent checks maximum, two-second gap per worker. No benchmark-level retries.',rows:rows.toSorted((a,b)=>a.id.localeCompare(b.id))},null,2));
async function run(){
 while(cursor<remaining.length){
  const item=remaining[cursor++],start=Date.now();let row;
  if(item.error||item.errorKey||!item.text)row={id:item.id,kind:item.kind,label:item.label,onlineStatus:'extraction_failed',flagged:null};
  else{
   const urls=analyzePatterns(item.text,item.kind==='links'?[item.text]:[]).urls.map(r=>r.url).filter(u=>u.length<=2048);
   const policyBlocked=isPrivateQrPayload(item.text)||urls.some(isPrivateQrPayload)||['qr','image'].includes(item.kind)&&[item.text,...urls].some(value=>describeQrPayload(value).blocked);
   try{
    const response=await detect(new Request('http://localhost/api/detect',{method:'POST',body:JSON.stringify({kind:({text:'message',links:'link',qr:'qr',image:'image'})[item.kind],text:item.text,urls,uncertain:item.uncertain,ai:true,consent:true})}),process.env);
    const r=await response.json();
    row={id:item.id,kind:item.kind,label:item.label,level:r.level,flagged:r.level?['High risk','Suspicious'].includes(r.level):null,onlineStatus:r.aiReview?.status||'error',httpStatus:response.status,provider:r.aiReview?.provider,model:r.aiReview?.model,policyBlocked,signals:r.indicators?.map(i=>i.id)||[]};
   }catch(error){row={id:item.id,kind:item.kind,label:item.label,onlineStatus:'request_error',flagged:null,error:error.name};}
  }
  rows.push({...row,elapsedMs:Date.now()-start});write();
  console.log(`${rows.length}/200 ${item.id}: ${row.onlineStatus} / ${row.level||''}`);
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
}
await Promise.all([run(),run()]);write();
