import assert from 'node:assert/strict';import{chromium}from'@playwright/test';import{NOTICE_VERSION}from'../src/privacy/acknowledgment.js';
const b=await chromium.launch({channel:'chrome'});
try{for(const [width,reduced]of[[1440,'no-preference'],[390,'reduce']]){
 const context=await b.newContext({viewport:{width,height:900},reducedMotion:reduced});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(version=>localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()})),NOTICE_VERSION);
 await p.goto('http://localhost:5173');await p.locator('.surfare-intro[open]').waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('surfare-welcome-seen')),null);
 await p.locator('.intro-skip').click();await p.locator('.tour-invite[open]').waitFor();await p.locator('.invite-accept').click();await p.locator('.surfare-tour-dock').waitFor();
 const titles=[];for(let i=0;i<10;i++){
  await p.waitForFunction(i=>document.querySelector('.tour-step-count')?.textContent.includes(`${i+1} / 10`),i);
  const title=await p.locator('.tour-message h2').innerText();titles.push(title);
  await p.locator('.tour-next').click();
 }
 await p.locator('.surfare-tour-dock').waitFor({state:'detached'});assert(titles.some(t=>t.includes('Lifeguard')));assert(titles.some(t=>t.includes('Ask Surfy')));
 await p.reload();assert.equal(await p.locator('.surfare-intro').count(),0);
 await p.locator('.hero-tour-start').click();await p.waitForFunction(()=>document.querySelector('.tour-step-count')?.textContent.includes('1 / 10'));
 await p.locator('.tour-skip').click();await p.locator('.surfare-tour-dock').waitFor({state:'detached'});assert.deepEqual(errors,[]);console.log('Passed',width,reduced,titles);await context.close();
}
}finally{await b.close();}
