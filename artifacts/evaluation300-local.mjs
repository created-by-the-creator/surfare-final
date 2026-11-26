import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('artifacts/evaluation-300');
const cases=JSON.parse(fs.readFileSync(path.join(dir,'cases.json'),'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const rows=[];let cursor=0,externalRequestsBlocked=0;
const startedAt=new Date().toISOString();
async function run(){
 const page=await browser.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(externalRequestsBlocked++,route.abort()));
 await page.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded'});
 while(cursor<cases.length){
  const item=cases[cursor++],started=Date.now();
  let result;
  try{
   const base64=item.file?fs.readFileSync(path.join(dir,item.file)).toString('base64'):null;
   result=await page.evaluate(async({item,base64})=>{
    const {analyzeInput}=await import('/src/engine/analyze.js');
    const inputs=item.kind==='text'?{message:item.expectedText}:item.kind==='links'?{url:item.expectedText}:{};
    if(base64)inputs[item.kind==='qr'?'qr':'image']=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],item.file,{type:'image/png'});
    const r=await analyzeInput(item.kind,inputs,{onlineLookup:false,ai:false});
    return{level:r.level,flagged:['high','suspicious'].includes(r.level),text:r.checkedText||'',errorKey:r.errorKey||null,uncertain:r.mediaInfo?.uncertainExtraction||false,ocrConfidence:r.mediaInfo?.ocrConfidence??null,qrValues:r.mediaInfo?.qrValues||[],signals:r.signals?.map(s=>s.id)||[]};
   },{item,base64});
  }catch(error){result={error:error.message,flagged:null};}
  rows.push({...item,...result,elapsedMs:Date.now()-started});
  fs.writeFileSync(path.join(dir,'local.json'),JSON.stringify({startedAt,updatedAt:new Date().toISOString(),externalRequestsBlocked,rows:rows.toSorted((a,b)=>a.id.localeCompare(b.id))},null,2));
  console.log(`${rows.length}/300 ${item.id}: ${result.level||result.error}`);
 }
 await page.close();
}
try{await Promise.all([run(),run()]);}finally{await browser.close();}
