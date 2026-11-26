import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {NOTICE_VERSION} from '../frontend/src/privacy/acknowledgment.js';
const browser=await chromium.launch({channel:'chrome',headless:true});
const report=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'no-preference'});
 await page.addInitScript(version=>{
  localStorage.setItem('surfare-welcome-seen','true');
  localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
 },NOTICE_VERSION);
 await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const section=page.locator('#risk-levels');await section.scrollIntoViewIfNeeded();
 const imgs=section.locator('.risk-art img');
 await imgs.first().waitFor();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('#risk-levels .risk-art img')).every(n=>n.complete&&n.naturalWidth>0&&n.currentSrc.endsWith('.gif')));
 for(let i=0;i<4;i++){
  const img=imgs.nth(i);const src=await img.evaluate(n=>n.currentSrc);assert(src.endsWith('.gif'));
  const snapshots=new Set();
  for(let sample=0;sample<7;sample++){
   const frame=await img.screenshot({animations:'disabled'});snapshots.add(createHash('sha256').update(frame).digest('hex'));
   await page.waitForTimeout(170);
  }
  assert(snapshots.size>1,`${src} did not visibly change frames`);
  report.push({src,distinctVisibleFrames:snapshots.size,animated:true});
 }
 await section.screenshot({path:'artifacts/risk-premium-desktop.png',animations:'disabled'});
 await section.locator('.privacy-toggle').click();
 assert(await page.getByRole('dialog').count()>0,'Privacy notice did not open');
 await page.keyboard.press('Escape');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('#risk-levels .risk-art img')).every(n=>n.complete&&n.currentSrc.endsWith('-still.png')));
 assert((await imgs.evaluateAll(nodes=>nodes.map(n=>n.currentSrc))).every(src=>src.endsWith('-still.png')),'Reduced-motion images are not static');
 await fs.writeFile('artifacts/risk-animation/verification.json',JSON.stringify({report,reducedMotionStatic:true,privacyDialogOpens:true},null,2));
 console.log(JSON.stringify({report,reducedMotionStatic:true,privacyDialogOpens:true},null,2));
}finally{await browser.close();}
