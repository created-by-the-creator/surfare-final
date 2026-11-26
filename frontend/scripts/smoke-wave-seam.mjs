import assert from 'node:assert/strict';import{chromium}from'@playwright/test';import{NOTICE_VERSION}from'../src/privacy/acknowledgment.js';
const b=await chromium.launch({channel:'chrome'});
try{for(const width of[390,1440,2172,2560,3840]){
 const p=await b.newPage({viewport:{width,height:1200},reducedMotion:'reduce'});await p.addInitScript(v=>{localStorage.setItem('surfare-welcome-seen','true');localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version:v,acceptedAt:new Date().toISOString()}));},NOTICE_VERSION);await p.goto('http://localhost:5173/',{waitUntil:'networkidle'});
 const layout=await p.locator('.wave-stage').evaluate(e=>({stage:e.clientWidth,image:e.querySelector('img').clientWidth,height:e.clientHeight,panel:getComputedStyle(e,'::before').content,src:e.querySelector('img').getAttribute('src')}));
 assert.equal(layout.src,'/assets/Headbanner.png');assert(['none','normal'].includes(layout.panel));if(width>2172){assert.equal(layout.stage,layout.image);assert.equal(layout.height,414);}
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 if(width===2560){const h=await p.locator('.hero').boundingBox();await p.screenshot({path:'artifacts/wave-seam/after.png',clip:{x:0,y:h.y+h.height-300,width:600,height:300}});}
 await p.emulateMedia({reducedMotion:'no-preference'});const coverage=await p.locator('.wave-stage').evaluate(e=>{const a=e.getAnimations()[0];a?.pause();return [0,1650,3300,4950].map(time=>{if(a)a.currentTime=time;const r=e.getBoundingClientRect();return r.left<=0&&r.right>=innerWidth;});});assert(coverage.every(Boolean),'wave covers screen throughout animation');
 console.log('Passed',width,layout);await p.close();
}}finally{await b.close();}
