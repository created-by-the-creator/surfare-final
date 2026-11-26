import fs from 'node:fs/promises';
import path from 'node:path';
import { detect } from '../backend/server/services/detect.js';
import { aiProviders } from '../backend/server/services/ai-generation.js';
import { imageDetect } from '../backend/server/services/image-detect.js';
const dir=path.resolve('artifacts/evaluation');
const local=JSON.parse(await fs.readFile(path.join(dir,'local.json'),'utf8'));
const providers=aiProviders(process.env).map(({providerId,model})=>({providerId,model}));
const rows=[];
let cursor=0;
async function run(){
 while(cursor<local.rows.length){
  const item=local.rows[cursor++],start=Date.now();
  if(item.error||!item.text){rows.push({...item,onlineStatus:'extraction_failed'});continue;}
  const response=await detect(new Request('http://localhost/api/detect',{method:'POST',body:JSON.stringify({text:item.text,kind:({text:'message',links:'link',image:'image',qr:'qr'})[item.kind],ai:true,consent:true,uncertain:item.uncertain})}),process.env);
  const result=await response.json();
  rows.push({id:item.id,kind:item.kind,label:item.label,level:result.level,flagged:['High risk','Suspicious'].includes(result.level),onlineStatus:result.aiReview?.status||'error',provider:result.aiReview?.provider,model:result.aiReview?.model,httpStatus:response.status,elapsedMs:Date.now()-start});
  await fs.writeFile(path.join(dir,'online.json'),JSON.stringify({checkedAt:new Date().toISOString(),providers,scope:'Actual backend detect service with live external provider requests; local browser decoding/OCR feeds the service. Not a deployed-site UI or live reputation test.',rows},null,2));
  console.log(`${item.id}: ${rows.at(-1).onlineStatus} / ${result.level}`);
 }
}
await Promise.all([run(),run(),run()]);
// A known program-rendered screenshot is a negative control only, not a labeled AI-photo corpus.
const image=(await fs.readFile(path.join(dir,'origin-negative.jpg'))).toString('base64');
const response=await imageDetect(new Request('http://localhost/api/image-detect',{method:'POST',body:JSON.stringify({image:`data:image/jpeg;base64,${image}`,consent:true,provider:'sightengine',mode:'origin'})}),process.env);
await fs.writeFile(path.join(dir,'online-image-origin.json'),JSON.stringify({scope:'Single program-rendered non-generative screenshot control; no positive AI-image examples. Accuracy/FPR/FNR not estimable.',httpStatus:response.status,result:await response.json()},null,2));
