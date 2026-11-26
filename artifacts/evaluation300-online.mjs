import fs from 'node:fs';
import path from 'node:path';
import {detect} from '../backend/server/services/detect.js';
import {aiProviders} from '../backend/server/services/ai-generation.js';
import {analyzePatterns} from '../backend/lib/pattern-detection.js';
import {describeQrPayload} from '../backend/lib/qr-links.js';
import {isPrivateQrPayload} from '../backend/lib/qr-payload.js';
const dir=path.resolve('artifacts/evaluation-300');
const input=JSON.parse(fs.readFileSync(path.join(dir,'local.json'),'utf8')).rows;
if(input.length!==300)throw Error('Finish the 300 local inputs first.');
const output=path.join(dir,'online.json');
const old=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):null;
const rows=old?.rows||[],done=new Set(rows.map(r=>r.id));
// Interleave modes so any quota exhaustion does not fall entirely on one mode.
const remaining=input.filter(r=>!done.has(r.id)).sort((a,b)=>a.id.slice(-3).localeCompare(b.id.slice(-3))||a.kind.localeCompare(b.kind));
let cursor=0;const startedAt=old?.startedAt||new Date().toISOString();
const providers=aiProviders(process.env).map(({providerId,model})=>({providerId,model}));
const write=()=>fs.writeFileSync(output,JSON.stringify({startedAt,updatedAt:new Date().toISOString(),providers,scope:'300 submissions through actual backend detect with live configured providers, fed by actual offline browser extraction. Not a deployed UI or live destination reputation test. No test pages visited. Two in-flight requests maximum; 2-second gap per worker. First completed/status result retained; no benchmark-level retries.',rows:rows.toSorted((a,b)=>a.id.localeCompare(b.id))},null,2));
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
    row={id:item.id,kind:item.kind,label:item.label,level:r.level,flagged:['High risk','Suspicious'].includes(r.level),onlineStatus:r.aiReview?.status||'error',httpStatus:response.status,provider:r.aiReview?.provider,model:r.aiReview?.model,policyBlocked,signals:r.indicators?.map(i=>i.id)||[]};
   }catch(error){row={id:item.id,kind:item.kind,label:item.label,onlineStatus:'request_error',flagged:null,error:error.name};}
  }
  rows.push({...row,elapsedMs:Date.now()-start});write();
  console.log(`${rows.length}/300 ${item.id}: ${row.onlineStatus} / ${row.level||''}`);
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
}
await Promise.all([run(),run()]);write();
