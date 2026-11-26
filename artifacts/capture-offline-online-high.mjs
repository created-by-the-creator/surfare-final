import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {NOTICE_VERSION} from '../frontend/src/privacy/acknowledgment.js';
const browser=await chromium.launch({channel:'chrome',headless:true});
const records=[];
try{
 for(const online of process.env.CAPTURE_ONLINE_ONLY==='true'?[true]:[false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(({version,online})=>{
   localStorage.setItem('surfare-welcome-seen','true');
   localStorage.setItem('surfare-language','en');
   localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
   sessionStorage.setItem('surfare-ai-opt-in',String(online));
  },{version:NOTICE_VERSION,online});
  const page=await context.newPage();
  if(process.env.CAPTURE_BACKEND_ORIGIN)await page.route('**/api/detect',async route=>{
   const response=await route.fetch({url:process.env.CAPTURE_BACKEND_ORIGIN+'/api/detect',timeout:105000});
   await route.fulfill({response});
  });
  await page.goto('http://127.0.0.1:5175',{waitUntil:'networkidle'});
  console.log('Loaded',online?'online':'offline');
  await page.evaluate(()=>import('/src/engine/check-content.js'));
  await page.evaluate(async()=>{const {ASSETS}=await import('/src/assets.js');window.capturePreloadedIcon=new Image();window.capturePreloadedIcon.src=ASSETS.iconAlert;await window.capturePreloadedIcon.decode();});
  await page.locator('.check-tab').first().click();
  await page.locator('.check-form-column textarea').fill('Your bank account will be blocked today. Send me your OTP now.');
  await page.evaluate(()=>document.fonts.ready);
  // Load display assets before disabling the browser network for the offline run.
  await page.locator('img').evaluateAll(imgs=>Promise.race([new Promise(resolve=>setTimeout(resolve,2500)),Promise.all(imgs.map(img=>{img.loading='eager';return img.decode().catch(()=>{});} ))]));
  if(!online)await context.setOffline(true);
  console.log('Network prepared');
  await page.locator(`.connection-status.is-${online?'online':'offline'}`).waitFor();
  const response=online?page.waitForResponse(r=>new URL(r.url()).pathname==='/api/detect',{timeout:90000}).then(r=>r.json()):null;
  await page.locator('.check-button').click();
  console.log('Check submitted');
  let review=null;
  if(response){const data=await response;review={level:data.level,status:data.aiReview?.status,provider:data.aiReview?.provider,model:data.aiReview?.model};console.log('AI review',JSON.stringify(review));if(process.env.CAPTURE_REQUIRE_COMPLETED==='true')assert.equal(review.status,'completed');}
  const result=page.locator('.result-panel.result-high');
  await result.locator('.risk-meter').waitFor({timeout:90000});
  assert.equal(await result.locator('.risk-meter-labels .is-active').innerText(),'HIGH RISK');
  await result.evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-(document.querySelector('.site-header')?.getBoundingClientRect().height||0)-12,behavior:'instant'}));
  const filename=`mobile-${online?'online':'offline'}-high-risk.png`;
  await page.screenshot({path:filename,animations:'disabled'});
  records.push({file:filename,online:await page.evaluate(()=>navigator.onLine),review,verdict:await result.locator('.result-state-title').innerText(),mocked:false});
  console.log('Saved',filename);
  await context.close();
 }
 const prior=process.env.CAPTURE_ONLINE_ONLY==='true'?JSON.parse(await fs.readFile('artifacts/offline-online-screenshots.json','utf8')).filter(record=>!record.online):[];
 await fs.writeFile('artifacts/offline-online-screenshots.json',JSON.stringify([...prior,...records],null,2));
}finally{await browser.close();}
