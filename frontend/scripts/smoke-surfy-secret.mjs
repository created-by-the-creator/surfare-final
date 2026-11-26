import assert from 'node:assert/strict';import{chromium}from'@playwright/test';import{mkdir}from'node:fs/promises';import{NOTICE_VERSION}from'../src/privacy/acknowledgment.js';
const b=await chromium.launch({channel:'chrome'});await mkdir('artifacts/surfy-secret',{recursive:true});
try{for(const width of [1440,390,320]){
 const p=await b.newPage({viewport:{width,height:1000},reducedMotion:'no-preference'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(version=>{localStorage.setItem('surfare-welcome-seen','true');localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));},NOTICE_VERSION);
 await p.goto('http://localhost:5173/',{waitUntil:'networkidle'});
 const trigger=p.locator('.site-header .nav-secret-link');if(width<1024)await p.locator('.nav-mobile-menu').click();await trigger.click();const dialog=p.locator('#surfy-secret-dialog');await p.locator('#surfy-secret-dialog[open]').waitFor();assert.equal(await dialog.getAttribute('open'),'');
 assert.equal(await dialog.locator('.secret-chapter').count(),4);
 assert((await dialog.innerText()).includes('Bald head.'));assert((await dialog.innerText()).includes('mabuhay ang kalbo'));
 await dialog.locator('img').evaluate(img=>img.decode());assert((await dialog.locator('img').evaluate(img=>img.currentSrc)).endsWith('.gif'));
 await p.screenshot({path:`artifacts/surfy-secret/open-${width}.png`});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await dialog.locator('.secret-chapter').last().scrollIntoViewIfNeeded();assert(await dialog.getByText('His biggest soft spot',{exact:true}).isVisible());
 await p.keyboard.press('Escape');assert.equal(await dialog.getAttribute('open'),null);assert(await trigger.evaluate(e=>e===document.activeElement));
 await trigger.click();await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>document.querySelector('#surfy-secret-dialog img').currentSrc.endsWith('-still.png'));
 await dialog.getByRole('button',{name:'Close Surfy’s little secret',exact:true}).click();assert.equal(await dialog.getAttribute('open'),null);
 assert.equal(await p.locator('footer .nav-secret-link').count(),0);assert.deepEqual(errors,[]);console.log('Passed',width,'header entry, exact sections, GIF, scrolling, Escape/close/focus, reduced motion, no overflow');await p.close();
}}finally{await b.close();}
