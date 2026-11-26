import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const mode=process.argv[2]||'benchmark';
const root=path.resolve('artifacts/offline-improvement');fs.mkdirSync(root,{recursive:true});
const dir=mode==='benchmark'?path.resolve('artifacts/corpus-evaluation-200'):path.join(root,mode==='confirmation'?'confirmation':'audit');
const files=JSON.parse(fs.readFileSync(path.join(dir,'image-files.json'),'utf8'));
const cases=JSON.parse(fs.readFileSync(path.join(dir,'cases.json'),'utf8')).map(c=>({...c,...files[c.id]}));
const browser=await chromium.launch({channel:'chrome',headless:true});
const rows=[];let cursor=0,blocked=0;const startedAt=new Date().toISOString();
const output=path.join(root,`${mode}-results.json`);
async function run(){
 const page=await browser.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(blocked++,route.abort()));
 await page.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded'});
 while(cursor<cases.length){
  const item=cases[cursor++],start=Date.now();let result;
  try{
   const base64=item.file?fs.readFileSync(path.join(dir,item.file)).toString('base64'):null;
   result=await page.evaluate(async({item,base64})=>{
    const {analyzeInput}=await import('/src/engine/analyze.js');
    const inputs=item.kind==='text'?{message:item.expectedText}:item.kind==='links'?{url:item.expectedText}:{};
    if(base64)inputs[item.kind==='qr'?'qr':'image']=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],item.file,{type:'image/png'});
    const r=await analyzeInput(item.kind,inputs,{onlineLookup:false,ai:false});
    const signals=r.signals.map(s=>({id:s.id,evidence:s.evidenceItems}));
    for(const s of signals)for(const e of s.evidence||[])if(r.checkedText.slice(e.start,e.end)!==e.text)throw Error('Ungrounded evidence');
    return{level:r.level,flagged:['high','suspicious'].includes(r.level),text:r.checkedText||'',errorKey:r.errorKey||null,ocrConfidence:r.mediaInfo?.ocrConfidence??null,qrValues:r.mediaInfo?.qrValues||[],signals};
   },{item,base64});
  }catch(error){result={error:error.message,flagged:null};}
  rows.push({...item,...result,elapsedMs:Date.now()-start});
  fs.writeFileSync(output,JSON.stringify({scope:mode==='benchmark'?'Frozen 200-case development benchmark; labels and inputs unchanged.':'Additional disjoint corpus check; source training/reference overlap remains.',startedAt,updatedAt:new Date().toISOString(),externalRequestsBlocked:blocked,rows:rows.toSorted((a,b)=>a.id.localeCompare(b.id))},null,2));
  console.log(`${rows.length}/${cases.length} ${item.id}: ${result.level||result.error}`);
 }
 await page.close();
}
try{await Promise.all([run(),run()]);}finally{await browser.close();}
