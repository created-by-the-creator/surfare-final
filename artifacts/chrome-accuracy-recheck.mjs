import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const dir='artifacts/corpus-evaluation-200';
const cases=JSON.parse(await fs.readFile(dir+'/cases.json','utf8'));
const files=JSON.parse(await fs.readFile(dir+'/image-files.json','utf8'));
const selected=['text','links','qr','image'].flatMap(kind=>[true,false].flatMap(label=>cases.filter(c=>c.kind===kind&&c.label===label).slice(0,5)));
const browser=await chromium.launch({channel:'chrome',headless:true});
const rows=[];let cursor=0;
try{
 await Promise.all([0,1].map(async()=>{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:5175');
  while(cursor<selected.length){
   const item=selected[cursor++];
   const filename=files[item.id]?.file;
   const base64=filename?(await fs.readFile(dir+'/'+filename)).toString('base64'):null;
   const result=await page.evaluate(async({item,filename,base64})=>{
    const {analyzeInput}=await import('/src/engine/analyze.js');
    const inputs=item.kind==='text'?{message:item.expectedText}:item.kind==='links'?{url:item.expectedText}:{};
    if(base64)inputs[item.kind==='qr'?'qr':'image']=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],filename,{type:'image/png'});
    const r=await analyzeInput(item.kind,inputs,{onlineLookup:false,ai:false});
    return {level:r.level,flagged:['high','suspicious'].includes(r.level),error:r.errorKey||null,text:r.checkedText};
   },{item,filename,base64});
   rows.push({...item,...result});console.log(rows.length+'/'+selected.length,item.id,result.level,result.error||'');
  }
  await page.close();
 }));
 const correct=rows.filter(r=>r.label===r.flagged&&!r.error).length;
 const report={testedAt:new Date().toISOString(),scope:'40 existing development cases: 10 per modality, 5 positive and 5 negative. Functional/accuracy regression spot-check; not a new independent benchmark.',n:rows.length,correct,accuracy:100*correct/rows.length,errors:rows.filter(r=>r.error),falsePositive:rows.filter(r=>!r.label&&r.flagged).length,falseNegative:rows.filter(r=>r.label&&!r.flagged).length,rows};
 await fs.writeFile('artifacts/chrome-accuracy-recheck.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,rows:undefined}));
}finally{await browser.close();}
