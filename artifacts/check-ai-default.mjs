import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {NOTICE_VERSION} from '../frontend/src/privacy/acknowledgment.js';
const browser=await chromium.launch({channel:'chrome',headless:true});
const records=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();
  const posts=[];
  page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await context.addInitScript(version=>{
   localStorage.setItem('surfare-welcome-seen','true');localStorage.setItem('surfare-language','en');
   localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
  },NOTICE_VERSION);
  await page.goto('http://127.0.0.1:5175',{waitUntil:'networkidle'});
  const toggle=page.locator('.check-ai-choice input');
  await page.locator('.connection-status.is-online').waitFor();
  assert.equal(await toggle.isChecked(),true);
  assert.equal(posts.length,0,'Default does not submit');
  await context.setOffline(true);
  await page.locator('.connection-status.is-offline').waitFor();
  assert.equal(await toggle.isChecked(),false);assert.equal(await toggle.isDisabled(),true);
  await context.setOffline(false);await page.locator('.connection-status.is-online').waitFor();
  assert.equal(await toggle.isChecked(),true);
  await toggle.uncheck();await page.reload({waitUntil:'networkidle'});
  assert.equal(await toggle.isChecked(),false,'Explicit off survives reload');
  await context.setOffline(true);await page.locator('.connection-status.is-offline').waitFor();
  await context.setOffline(false);await page.locator('.connection-status.is-online').waitFor();
  assert.equal(await toggle.isChecked(),false,'Reconnect respects off choice');
  await page.locator('.tab-panel textarea').fill('Your bank account will be blocked today. Send me your OTP now.');
  await page.locator('.check-button').click();await page.locator('.result-panel.result-high').waitFor();
  assert.equal(posts.length,0,'Explicit off keeps the check local');
  await page.reload({waitUntil:'networkidle'});
  await toggle.check();assert.equal(posts.length,0,'Enabling does not submit');
  let payload;
  await page.route('**/api/detect',route=>{
   payload=route.request().postDataJSON();
   return route.fulfill({json:{level:'High risk',score:8,indicators:[],aiReview:{status:'completed'}}});
  });
  await page.locator('.tab-panel textarea').fill('Send me your OTP now.');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/detect'));
  await page.locator('.check-button').click();await response;
  assert.equal(payload.ai,true);assert.equal(payload.consent,true);assert.equal(posts.length,1);
  records.push({width,defaultOnline:true,noAutomaticSubmission:true,offlineUncheckedAndDisabled:true,reconnectRestoresPreference:true,explicitOffRetained:true,aiSubmittedOnlyAfterCheck:true});
  await context.close();
 }
 // A new visitor who declines the notice cannot submit to the provider.
 const page=await browser.newPage();let requests=0;
 page.on('request',r=>{if(r.method()==='POST')requests++;});
 await page.addInitScript(()=>localStorage.setItem('surfare-welcome-seen','true'));
 await page.goto('http://127.0.0.1:5175');
 await page.locator('.privacy-notice .notice-decline').click();
 await page.locator('.privacy-notice').waitFor({state:'detached'});
 await page.locator('.check-tab').first().click();
 await page.locator('.tab-panel textarea').fill('Send me your OTP now.');
 console.log('Consent check',await page.locator('.tab-panel textarea').inputValue(),await page.locator('.check-button').isDisabled());
 await page.locator('.check-button').click();await page.locator('.privacy-notice').waitFor();
 await page.locator('.privacy-notice .notice-decline').click();
 assert.equal(requests,0);
 await page.close();
 const report={records,declinedNoticePreventsSubmission:true,providerResponseMockedForRequestVerification:true};
 await fs.writeFile('artifacts/ai-default-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
