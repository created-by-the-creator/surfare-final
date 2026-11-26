import {chromium} from '@playwright/test';
import {NOTICE_VERSION} from '../frontend/src/privacy/acknowledgment.js';
const browser=await chromium.launch({channel:'chrome',headless:true});
const suffix=process.argv[2]||'after';
try{
 for(const width of [1440,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:1100},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(version=>{
   localStorage.setItem('surfare-welcome-seen','true');
   localStorage.setItem('surfare-privacy-acknowledgment',JSON.stringify({version,acceptedAt:new Date().toISOString()}));
  },NOTICE_VERSION);
  await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
  const section=page.locator('#risk-levels');await section.scrollIntoViewIfNeeded();
  await page.screenshot({path:`artifacts/risk-${suffix}-${width}.png`,fullPage:false});
  await section.screenshot({path:`artifacts/risk-section-${suffix}-${width}.png`});
  console.log(JSON.stringify({width,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),cards:await section.locator('.risk-card').count(),images:await section.locator('.risk-art img').evaluateAll(imgs=>imgs.map(i=>({src:i.currentSrc,loaded:i.complete&&i.naturalWidth>0}))),colors:await page.evaluate(()=>Object.fromEntries(['.how-section','.risks-section','.site-footer','.app-bg'].map(s=>{const n=document.querySelector(s);return[s,n?{background:getComputedStyle(n).background,colors:getComputedStyle(n).color}:null]})))}));
  await page.close();
 }
}finally{await browser.close();}
