import assert from 'node:assert/strict';import{chromium}from'@playwright/test';import{NOTICE_VERSION}from'../src/privacy/acknowledgment.js';
const b=await chromium.launch({channel:'chrome'});
try{for(const width of[320,390,768,1024,1440]){
 const p=await b.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
 await p.addInitScript(version=>{localStorage.setItem('surfare-welcome-seen','true');localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));},NOTICE_VERSION);
 await p.goto('http://localhost:5173');const header=p.locator('.site-header');
 if(width<1024){assert((await header.boundingBox()).height<=65);await p.locator('.nav-mobile-menu').click();await p.locator('.nav-quick-links').waitFor();await p.locator('.nav-guide-link:not(.nav-secret-link)').click();await p.locator('.recovery-dialog[open]').waitFor();await p.keyboard.press('Escape');await p.locator('.recovery-dialog').waitFor({state:'detached'});await p.keyboard.press('Escape');await p.locator('.nav-quick-links').waitFor({state:'hidden'});await p.locator('.language-control').click();await p.getByRole('menu').waitFor();await p.keyboard.press('Escape');await p.locator('.connection-status').click();await p.locator('.connection-popover').waitFor();await p.keyboard.press('Escape');}
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 const styles=await header.evaluate(e=>({blur:getComputedStyle(e).backdropFilter,height:e.getBoundingClientRect().height}));assert(styles.blur.includes('blur'));
 await p.screenshot({path:`artifacts/surfy-secret/header-${width}.png`});console.log('Passed header',width,styles);await p.close();
}}finally{await b.close();}
