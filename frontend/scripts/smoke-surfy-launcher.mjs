import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';
const browser=await chromium.launch({channel:'chrome'});
const out=new URL('../../artifacts/ask-surfy/',import.meta.url);await mkdir(out,{recursive:true});
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:width===320?640:900},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(version=>{localStorage.setItem('surfare-welcome-seen','true');localStorage.setItem('surfare-language','en');sessionStorage.setItem('surfare-ai-opt-in','false');localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));},NOTICE_VERSION);
  await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
  await page.screenshot({path:new URL(`launcher-${width}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
  const launcher=page.locator('.surfy-launcher');await launcher.waitFor();
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));assert(await launcher.isVisible());
  await launcher.click();
  const dialog=page.locator('#surfy-quick-dialog');assert.equal(await dialog.getAttribute('open'),'');
  assert.equal(await page.locator('#quick-ask-input').evaluate(el=>el===document.activeElement),true);
  await page.locator('#quick-ask-input').fill('Can I use Surfare offline?');
  await dialog.locator('button[type="submit"]').click();
  await dialog.locator('.chat-surfy').waitFor();
  assert.equal(await dialog.locator('.chat-user').count(),1);
  assert((await dialog.locator('.chat-surfy').innerText()).length>20);
  await page.evaluate(()=>document.activeElement?.blur());
  await page.screenshot({path:new URL(`chat-${width}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
  const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.keyboard.press('Escape');assert.equal(await dialog.getAttribute('open'),null);
  assert.equal(await launcher.evaluate(el=>el===document.activeElement),true);
  await context.setOffline(true);await launcher.click();
  assert.equal(await dialog.locator('input[type="checkbox"]').isDisabled(),true);
  assert.equal(await dialog.locator('.chat-user').count(),1,'conversation survives closing');
  await dialog.getByRole('button',{name:'Close Ask Surfy',exact:true}).click();
  await context.setOffline(false);
  await page.goto('http://localhost:5173/?demo=high',{waitUntil:'networkidle'});
  await launcher.click();await dialog.locator('.ask-brand').waitFor();
  assert.equal(await dialog.locator('.ask-messages').isVisible(),true,'chat is available with result');
  await dialog.getByRole('button',{name:'Close Ask Surfy',exact:true}).click();
  await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/qr-resolve',async route=>{
    await pending;
    await route.fulfill({json:{status:'unresolved',originalUrl:'https://is.gd/surfare-test',reason:'network',chain:[],redirectCount:0,riskLevel:'Insufficient evidence'}});
  });
  await page.getByRole('tab',{name:'Links',exact:true}).click();
  await page.locator('.tab-panel textarea').fill('https://is.gd/surfare-test');
  await page.locator('.check-button').click();
  await page.locator('.check-progress').waitFor();
  await launcher.click();assert.equal(await dialog.getAttribute('open'),'','available during a check');
  release();
  await dialog.getByRole('button',{name:'Close Ask Surfy',exact:true}).click();
  await page.locator('.check-columns[data-layout="split"]').waitFor();
  await page.getByRole('button',{name:'Hide Ask Surfy button',exact:true}).click();
  assert.equal(await launcher.count(),0);
  await page.reload({waitUntil:'networkidle'});
  const show=page.getByRole('button',{name:'Show Ask Surfy button',exact:true});
  assert(await show.isVisible(),'folded choice survives reload');
  await page.screenshot({path:new URL(`folded-${width}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
  await show.click();assert(await launcher.isVisible());
  await launcher.click();assert.equal(await dialog.getAttribute('open'),'');
  assert.deepEqual(errors,[]);console.log(`Passed ${width}px: before check, local reply, offline, after result, during a check, fold/unhide, Escape, focus, no overflow`);
  await context.close();
 }
}finally{await browser.close();}

