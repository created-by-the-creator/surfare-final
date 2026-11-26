import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), dir=path.join(root,'artifacts/evaluation');
const cases=JSON.parse(await fs.readFile(path.join(dir,'cases.json'),'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const rows=[]; let external=0;
try {
 const page=await browser.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(external++,route.abort()));
 await page.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded'});
 for (const item of cases) {
  const base64=item.file?(await fs.readFile(path.join(dir,item.file))).toString('base64'):null;
  const start=Date.now();
  try {
   const result=await page.evaluate(async ({item,base64})=>{
    const {analyzeInput}=await import('/src/engine/analyze.js');
    const inputs=item.kind==='text'?{message:item.text}:item.kind==='links'?{url:item.text}:{};
    if(base64)inputs[item.kind==='qr'?'qr':'image']=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],item.file,{type:'image/png'});
    const result=await analyzeInput(item.kind,inputs,{onlineLookup:false,ai:false});
    return {level:result.level,flagged:['high','suspicious'].includes(result.level),text:result.checkedText||'',errorKey:result.errorKey||null,uncertain:result.mediaInfo?.uncertainExtraction||false,ocrConfidence:result.mediaInfo?.ocrConfidence??null,qrValues:result.mediaInfo?.qrValues||[],signals:result.signals?.map(s=>s.id)||[]};
   },{item,base64});
   rows.push({...item,...result,expectedText:item.text,elapsedMs:Date.now()-start});
  } catch(error) {rows.push({...item,error:error.message,elapsedMs:Date.now()-start});}
  await fs.writeFile(path.join(dir,'local.json'),JSON.stringify({checkedAt:new Date().toISOString(),externalRequestsBlocked:external,rows},null,2));
  console.log(`${item.id}: ${rows.at(-1).level||'ERROR'}`);
 }
} finally {await browser.close();}
