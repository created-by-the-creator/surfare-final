import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {NOTICE_VERSION} from '../frontend/src/privacy/acknowledgment.js';

const samples=[
 {file:'mobile-low-risk.png',level:'low',label:'LOW RISK',message:'Your appointment is confirmed for tomorrow at 10 AM. No payment is required.'},
 {file:'mobile-medium-risk.png',level:'suspicious',label:'MEDIUM RISK',message:'Congratulations! You won a gift. Click here to claim your prize.'},
 {file:'mobile-high-risk.png',level:'high',label:'HIGH RISK',message:'Your bank account will be blocked today. Send me your OTP now.'},
];
const browser=await chromium.launch({channel:'chrome',headless:true});
const records=[];
try{
 for(const sample of samples){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(version=>{
   localStorage.setItem('surfare-welcome-seen','true');
   localStorage.setItem('surfare-language','en');
   localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
   sessionStorage.setItem('surfare-ai-opt-in','false');
  },NOTICE_VERSION);
  await page.route('**/*',route=>new URL(route.request().url()).pathname.startsWith('/api/')?route.abort():route.continue());
  await page.goto('http://127.0.0.1:5175',{waitUntil:'networkidle'});
  console.log('Loaded',sample.level);
  await page.locator('.check-tab').nth(0).click();
  await page.locator('.check-form-column textarea').fill(sample.message);
  await page.locator('.check-button').click();
  const result=page.locator(`.result-panel.result-${sample.level}`);
  await result.waitFor();
  assert.equal(await result.locator('.risk-meter-labels .is-active').innerText(),sample.label);
  await page.evaluate(()=>document.fonts.ready);
  await result.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>{img.loading='eager';return img.decode().catch(()=>{});})));
  await result.evaluate(element=>{
   const header=document.querySelector('.site-header');
   const inset=(header?.getBoundingClientRect().height||0)+12;
   window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-inset,behavior:'instant'});
  });
  const bar=await result.locator('.risk-meter').boundingBox();
  assert(bar&&bar.y>=0&&bar.y+bar.height<844,'Risk bar is outside the screenshot');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile layout overflows');
  assert.deepEqual(errors,[]);
  const output=path.resolve(sample.file);
  await page.screenshot({path:output,fullPage:false,animations:'disabled'});
  records.push({...sample,path:output,viewport:{width:390,height:844},imagePixels:{width:780,height:1688},bar,title:await result.locator('.result-state-title').innerText(),capture:'Actual local detector result; no mocked verdict or edited UI.'});
  await context.close();
 }
 await fs.writeFile('artifacts/mobile-risk-screenshots.json',JSON.stringify(records,null,2));
 console.log(JSON.stringify(records.map(r=>({file:r.file,title:r.title,label:r.label,path:r.path})),null,2));
}finally{await browser.close();}
