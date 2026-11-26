import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import {NOTICE_VERSION} from '../frontend/src/privacy/acknowledgment.js';
const browser=await chromium.launch({channel:'chrome',headless:true});
const records=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(version=>{
   localStorage.setItem('surfare-welcome-seen','true');localStorage.setItem('surfare-language','en');
   localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
   sessionStorage.setItem('surfare-ai-opt-in','false');
  },NOTICE_VERSION);
  await page.goto('http://127.0.0.1:5175',{waitUntil:'networkidle'});
  assert(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('/LoadingScreen.jsx'))));
  await page.locator('.check-tab').first().click();
  await page.locator('.tab-panel textarea').fill('Your bank account will be blocked today. Send me your OTP now.');
  await page.locator('.check-button').click();
  const result=page.locator('.result-panel.result-high');await result.waitFor();
  assert.equal(await result.locator('.risk-meter-labels .is-active').innerText(),'HIGH RISK');
  await result.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`artifacts/fix-ui-result-${width}.png`});
  assert.deepEqual(errors,[]);
  records.push({width,loadingScreenModulePresent:true,highRiskResult:true,horizontalOverflow:false,pageErrors:errors});
  await page.close();
 }
 await fs.writeFile('artifacts/fix-ui-chrome.json',JSON.stringify(records,null,2));
 console.log(JSON.stringify(records,null,2));
}finally{await browser.close();}
