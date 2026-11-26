import assert from 'node:assert/strict';
import{chromium}from'@playwright/test';
import{createHash}from'node:crypto';
import{mkdir,writeFile}from'node:fs/promises';
import{NOTICE_VERSION}from'../src/privacy/acknowledgment.js';
const b=await chromium.launch({channel:'chrome'});const reports=[];
await mkdir('artifacts/mascot-frames/preview',{recursive:true});
try{for(const width of [1440,390]){
 const p=await b.newPage({viewport:{width,height:1000},reducedMotion:'no-preference'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(version=>{localStorage.setItem('surfare-welcome-seen','true');sessionStorage.setItem('surfare-ai-opt-in','false');localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));},NOTICE_VERSION);
 await p.goto('http://localhost:5173/',{waitUntil:'networkidle'});
 // Disable CSS motion: screenshot changes must come from character frames.
 await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
 const frames=async(selector,name)=>{
  const el=p.locator(selector);await el.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
  const src=await el.getAttribute(selector.includes('body-layer')?'href':'src');assert(src.endsWith('.gif'),src);
  if(!selector.includes('body-layer'))await el.evaluate(img=>img.decode());
  const hashes=new Set();for(let i=0;i<7;i++){
   const buffer=await el.screenshot({animations:'disabled',...(i===3?{path:`artifacts/mascot-frames/preview/${name}-${width}.png`}:{})});
   hashes.add(createHash('sha256').update(buffer).digest('hex'));await p.waitForTimeout(210);
  }
  assert(hashes.size>1,`${name}: GIF must change visibly with CSS animations disabled`);return{name,distinctFrames:hashes.size};
 };
 const result=[];
 result.push(await frames('.hero-mascot .surfy-body-layer','hero'));
 result.push(await frames('.guide-mascot','detector'));
 await p.locator('.tab-panel textarea').fill('Check this message');
 result.push(await frames('.guide-mascot','tablet'));
 result.push(await frames('.how-mascot','how-to'));
 await p.locator('.surfy-launcher').click();result.push(await frames('#surfy-quick-dialog .ask-avatar img','chat'));await p.keyboard.press('Escape');
 await p.locator('.nav-guide-link').click();result.push(await frames('.recovery-intro img','lifeguard'));
 await p.locator('.recovery-chat-jump').click();result.push(await frames('.recovery-chat .ask-avatar img','lifeguard-chat'));await p.keyboard.press('Escape');
 await p.locator('.practice-mission').first().click();result.push(await frames('.surf-launch .surfy-body-layer','game-intro'));
 await p.locator('.surf-start').click();await p.locator('.surf-pause').click();
 assert((await p.locator('.surf-player .surfy-body-layer').getAttribute('href')).endsWith('-still.png'));
 await p.locator('.surf-pause-overlay button').click();assert((await p.locator('.surf-player .surfy-body-layer').getAttribute('href')).endsWith('.gif'));
 await p.locator('.practice-close').click();
 await p.emulateMedia({reducedMotion:'reduce'});
 await p.waitForFunction(()=>[...document.querySelectorAll('[data-mascot-source],.surfy-body-layer')].every(e=>(e.getAttribute('src')||e.getAttribute('href')).endsWith('-still.png')));
 await p.emulateMedia({reducedMotion:'no-preference'});
 await p.waitForFunction(()=>document.querySelector('.guide-mascot').src.endsWith('.gif'));
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 reports.push({width,result,gamePauseStatic:true,reducedMotionStatic:true,browserErrors:errors});console.log('Passed',width,JSON.stringify(result));await p.close();
}
await writeFile('artifacts/mascot-frames/chrome-verification.json',JSON.stringify(reports,null,2));
}finally{await b.close();}
