import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';
const folder = new URL('../../artifacts/lifeguard-mobile/',import.meta.url);
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(version=>{
 localStorage.setItem('surfare-welcome-seen','true');localStorage.setItem('surfare-language','en');sessionStorage.setItem('surfare-ai-opt-in','false');
 localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
},NOTICE_VERSION);
const shots=[];
async function capture(file,label){
 await page.evaluate(async()=>{
  await document.fonts.ready;
  await Promise.all([...document.querySelectorAll('.recovery-dialog img')].map(img=>img.decode().catch(()=>{})));
 });
 await page.screenshot({path:new URL(file,folder).pathname.replace(/^\/(\w:)/,'$1'),animations:'disabled'});
 shots.push({file,label});
}
try{
 await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
 await page.locator('.nav-guide-link').click();
 await page.locator('.recovery-dialog[open]').waitFor();
 await capture('01-choose-your-situation.png','Choose what happened');
 await page.getByRole('button',{name:'I sent money',exact:true}).click();
 await page.getByRole('heading',{name:'Report the payment to your provider now',exact:true}).waitFor();
 await capture('02-first-action.png','First action: contact your payment provider');
 await page.getByRole('button',{name:"I've done this",exact:true}).click();
 await page.getByRole('heading',{name:'Stop interacting with the suspicious page or sender',exact:true}).waitFor();
 await page.getByRole('button',{name:"I've done this",exact:true}).click();
 await page.getByRole('heading',{name:'Keep a private record',exact:true}).waitFor();
 await capture('03-save-evidence.png','Keep messages and receipts privately');
 await page.locator('.recovery-chat-jump').click();
 await page.locator('.recovery-chat textarea').fill('What should I do first?');
 await page.locator('.recovery-chat button[type="submit"]').click();
 await page.locator('.recovery-chat .chat-bubble').last().waitFor();
 await page.evaluate(()=>document.activeElement?.blur());
 await capture('04-surfy-conversation.png','Ask Surfy Lifeguard a question (local help)');
 await page.getByRole('button',{name:'Back to my guide',exact:true}).click();
 await page.getByRole('button',{name:"I've done this",exact:true}).click();
 await page.getByRole('button',{name:"I've done this",exact:true}).click();
 await page.getByRole('heading',{name:'Keep your next steps close.',exact:true}).waitFor();
 await page.locator('.recovery-summary > summary').click();
 await page.locator('.recovery-dialog').evaluate(el=>el.scrollTop=0);
 await capture('05-completed-checklist.png','Completed guide with checklist and download');
 assert.deepEqual(errors,[]);
 await writeFile(new URL('screenshots.json',folder),JSON.stringify({viewport:{width:430,height:932},deviceScaleFactor:2,scenario:'Fictional walkthrough: I sent money; local Surfy help',shots,browserErrors:errors},null,2));
 console.log(JSON.stringify(shots,null,2));
}finally{await browser.close();}
