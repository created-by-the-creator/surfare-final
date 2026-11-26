import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import {NOTICE_VERSION} from '../frontend/src/privacy/acknowledgment.js';
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 for(const mobile of [true,false]){
  const context=await browser.newContext({viewport:{width:mobile?390:1440,height:mobile?844:1000},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.addInitScript(version=>{
   localStorage.setItem('surfare-welcome-seen','true');localStorage.setItem('surfare-language','en');
   localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
  },NOTICE_VERSION);
  await page.goto('http://127.0.0.1:5175');
  await page.locator('.practice-mission').first().click();
  await page.locator('.surf-start').click();
  await page.locator('.surf-course.at-gates').waitFor();
  const selected=()=>page.locator('.surf-gate-legend li').evaluateAll(items=>items.findIndex(item=>item.classList.contains('is-target')));
  const activate=async selector=>mobile?page.locator(selector).tap():page.locator(selector).click();
  assert.equal(await selected(),1);
  await activate('.surf-steer-left');
  await page.waitForFunction(()=>document.querySelectorAll('.surf-gate-legend li')[0].classList.contains('is-target'));
  await activate('.surf-steer-right');
  await page.waitForFunction(()=>document.querySelectorAll('.surf-gate-legend li')[1].classList.contains('is-target'));
  await activate('.surf-catch');
  await page.locator('.practice-feedback.is-right').waitFor();
  await page.screenshot({path:`artifacts/chrome-game-${mobile?'mobile':'desktop'}.png`});
  results.push({mobile,left:true,right:true,correctAnswerFeedback:true,virtualClock:false});
  await context.close();
 }
 await fs.writeFile('artifacts/chrome-game-real-touch.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
}finally{await browser.close();}
