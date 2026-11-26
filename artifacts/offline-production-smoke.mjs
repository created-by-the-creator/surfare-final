import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '@playwright/test';
import {NOTICE_VERSION} from '../frontend/src/privacy/acknowledgment.js';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:1050}});
 const page=await context.newPage();
 await page.addInitScript(version=>{
  localStorage.setItem('surfare-welcome-seen','true');
  localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
 },NOTICE_VERSION);
 await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 const requests=[],cached=[];
 page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});
 page.on('response',r=>{if(r.fromServiceWorker())cached.push(r.url());});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#hero-title').waitFor();
 await page.locator('.check-tab').nth(0).click();
 await page.locator('.check-form-column textarea').fill('Send your OTP now or your bank account will be blocked.');
 await page.locator('.check-button').click();
 await page.locator('.result-high').waitFor();
 await page.locator('.check-button').click();
 if(await page.locator('.feedback-close').count())await page.locator('.feedback-close').click();
 await page.locator('.check-tab').nth(1).click();
 const url=JSON.parse(fs.readFileSync('artifacts/corpus-evaluation-200/cases.json','utf8')).find(r=>r.kind==='links'&&r.label).expectedText;
 await page.locator('.check-form-column textarea').fill(url);
 await page.locator('.check-button').click();
 await page.locator('.result-high').waitFor();
 assert.equal(requests.length,0,'Local checking attempted to call an API while offline');
 assert(cached.some(u=>u.includes('check-content-')),'The offline detector bundle was not served from the service worker');
 const result={offlineReload:true,messageHigh:true,knownUrlHigh:true,apiRequests:requests.length,detectorServedFromServiceWorker:true};
 fs.writeFileSync('artifacts/offline-improvement/production-offline-smoke.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
