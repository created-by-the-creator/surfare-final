import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'pitch-deck-opening');
await mkdir(out, { recursive: true });
const data = async (file, mime) => `data:${mime};base64,${(await readFile(path.join(root, file))).toString('base64')}`;
const image = async name => data(`frontend/public/assets/${name}`, 'image/png');
const [icon, surfer, cheer, serif, sans] = await Promise.all([
  image('4.png'), image('surfy-surfing-left.png'), image('6.png'),
  data('node_modules/@fontsource-variable/fraunces/files/fraunces-latin-standard-normal.woff2', 'font/woff2'),
  data('node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2', 'font/woff2'),
]);
const style = `
@font-face{font-family:Fraunces;src:url('${serif}');font-weight:100 900}
@font-face{font-family:Outfit;src:url('${sans}');font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:Outfit,sans-serif}
.screen{width:430px;height:932px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 85% 65%,#1469c2 0,transparent 60%),linear-gradient(165deg,#07142f 4%,#102e68 55%,#1276ce);color:#fff}
.grain{position:absolute;inset:0;opacity:.13;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' opacity='.3' filter='url(%23n)'/%3E%3C/svg%3E");mix-blend-mode:soft-light;pointer-events:none}
.orbit{position:absolute;width:530px;height:530px;left:-50px;top:456px;border:1px solid #9cd8ff24;border-radius:50%}.orbit:before{content:'';position:absolute;inset:40px;border:1px solid #9cd8ff1a;border-radius:50%}
.brand{position:absolute;top:108px;left:0;width:100%;display:flex;align-items:center;justify-content:center;gap:12px}.brand img{width:49px;height:49px;border-radius:13px}.wordmark{font-family:Fraunces,serif;font-size:43px;font-weight:850;letter-spacing:-2px;color:#ff716d}
.eyebrow{font-size:10px;letter-spacing:2.8px;text-transform:uppercase;font-weight:500;color:#a8cff4;margin:0 0 21px}
.copy{position:absolute;top:220px;left:25px;right:25px;text-align:center}h1{font-family:Fraunces,serif;font-size:61px;line-height:1.055;letter-spacing:-2.9px;margin:0;font-weight:750}h1 em{font-style:normal;color:#ff8d82}.sub{font-size:17px;line-height:1.5;letter-spacing:.1px;color:#d7e7ff;margin:21px 0 0}
.rule{width:36px;height:3px;background:#ff8d82;border-radius:9px;margin:25px auto 0}
.surfer{position:absolute;top:484px;left:32px;width:365px;height:365px;object-fit:contain;filter:drop-shadow(0 14px 18px #00173535);z-index:3}
.sun{position:absolute;top:528px;left:45px;width:207px;height:207px;border-radius:50%;background:linear-gradient(145deg,#ffe7ad,#ffb580);box-shadow:0 0 80px #ffcb8220}
.waves{position:absolute;left:0;bottom:0;width:430px;height:235px;z-index:2}
.bottom{position:absolute;bottom:61px;left:0;right:0;z-index:4;text-align:center}.bottom .caps{font-size:10px;letter-spacing:2.5px;font-weight:500;color:#e8f6ff}.bottom .line{display:block;width:126px;height:4px;background:#eff8ff99;border-radius:10px;margin:30px auto -35px}
.intro{background:radial-gradient(ellipse at 50% 58%,#c3e0ff 0,transparent 52%),linear-gradient(160deg,#f5f8ff,#e4efff 65%,#d3e8ff);color:#173365}
.intro .brand{top:213px;gap:14px}.intro .brand img{width:65px;height:65px;border-radius:17px}.intro .wordmark{font-size:65px;color:#d23f3c;letter-spacing:-3px}
.intro .copy{top:326px;left:32px;right:32px}.intro h1{font-size:43px;letter-spacing:-1.5px;line-height:1.12}.intro h1 em{color:#d23f3c}.intro .sub{color:#536e94;font-size:16px;margin-top:19px}.intro .eyebrow{position:absolute;top:157px;left:0;right:0;text-align:center;color:#607b9f;font-size:9px;letter-spacing:2.2px}
.cheer{position:absolute;top:488px;left:90px;width:250px;height:250px;object-fit:contain;z-index:3;filter:drop-shadow(0 15px 9px #194c8c14)}
.intro .waves{opacity:.55;height:160px}.intro .bottom{bottom:104px}.intro .bottom .caps{color:#426892;font-size:11px;letter-spacing:2px}.intro .bottom .line{background:#31558466;margin-top:54px}
.opening::after{content:'';position:absolute;top:466px;right:0;bottom:0;left:0;background:#0d67b3}
.opening .copy{top:65px}.opening .eyebrow{font-size:9px;letter-spacing:2px;margin-bottom:10px}
.opening h1{font-size:44px;letter-spacing:-1.8px;line-height:1.05}.opening .sub{font-size:14px;line-height:1.45;margin-top:12px}.opening .rule{display:none}
.opening .surfer{top:237px;left:110px;width:210px;height:210px}
.opening .waves{top:350px;bottom:auto;height:116px}
.opening .bottom{top:446px;bottom:auto}.opening .bottom .caps{font-size:9px;letter-spacing:1.9px}.opening .bottom .line{display:none}
`;
const waves = `<svg class="waves" viewBox="0 0 430 235" preserveAspectRatio="none"><path fill="#7dd9ff" opacity=".24" d="M0 67C85 112 146 15 232 57S365 125 430 64V235H0Z"/><path fill="#b6edff" opacity=".6" d="M0 105C81 45 150 150 252 111S370 80 430 115V235H0Z"/><path fill="#068fdb" d="M0 119C92 67 168 170 269 129S365 113 430 144V235H0Z"/><path fill="#0d67b3" d="M0 180C104 138 175 200 261 176S363 168 430 191V235H0Z"/></svg>`;
const opening = `<main class="screen opening"><div class="grain"></div><div class="copy"><p class="eyebrow">Your digital safety assistant</p><h1>A safer way<br>to <em>surf.</em></h1><p class="sub">Pause before you click.<br>Let Surfy take a second look.</p><div class="rule"></div></div>${waves}<img class="surfer" src="${surfer}"><div class="bottom"><span class="caps">Explore. Verify. Protect.</span></div></main>`;
const intro = `<main class="screen intro"><div class="grain"></div><p class="eyebrow">A little clarity before you click.</p><div class="brand"><img src="${icon}"><span class="wordmark">Surfare</span></div><div class="copy"><h1>Safer surfing starts<br>with a <em>second look.</em></h1><p class="sub">Meet Surfy.<br>Your guide to a safer digital world.</p></div>${waves}<img class="cheer" src="${cheer}"><div class="bottom"><span class="caps">Explore. Verify. Protect.</span><span class="line"></span></div></main>`;
const doc = (body, extra = '') => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Surfare pitch opening</title><style>${style}${extra}</style>${body}</html>`;
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:4});
  for(const [name, content] of [['01-opening-phone',opening],['02-intro-phone',intro]]){
    const html = path.join(out,`${name}.html`);
    await writeFile(html,doc(content));
    await page.goto(pathToFileURL(html).href);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    await page.screenshot({path:path.join(out,`${name}.png`)});
    console.log(`Exported ${name}.png at 1720 x 3728`);
  }
  const previewCss = `body{background:radial-gradient(ellipse at 65% 46%,#101e43,#050811 80%);color:white}.slide{width:1600px;height:900px;position:relative;overflow:hidden}.slide-brand{position:absolute;left:140px;top:335px;display:flex;gap:25px;align-items:center}.slide-brand img{width:140px;height:140px;border-radius:31px}.slide-name{font:850 94px Fraunces;color:#e54b49;letter-spacing:-5px}.slide-tagline{font-size:25px;color:#d9cfe0;margin:2px 0 0 3px;letter-spacing:.2px}.phone{position:absolute;top:104px;left:1030px;width:360px;height:752px;border-radius:58px;background:#050609;padding:10px;border:2px solid #5c5e63;box-shadow:0 30px 75px #0008}.display{width:336px;height:728px;border-radius:46px;overflow:hidden;position:relative}.display .screen{transform:scale(.781395);transform-origin:top left}.island{position:absolute;top:10px;left:116px;width:106px;height:29px;border-radius:25px;background:#020407;z-index:9}.status{position:absolute;left:29px;right:24px;top:17px;display:flex;justify-content:space-between;font:600 12px Outfit;z-index:8;color:#fff}.button{position:absolute;right:-5px;top:240px;width:3px;height:80px;border-radius:2px;background:#67696c}`;
  const statusIcons = '<svg width="60" height="13" viewBox="0 0 60 13" fill="white"><rect y="9" width="3" height="3"/><rect x="5" y="6" width="3" height="6"/><rect x="10" y="3" width="3" height="9"/><path d="M20 4 Q27 -1 34 4 M23 7 Q27 4 31 7" fill="none" stroke="white" stroke-width="2"/><circle cx="27" cy="10" r="1.5"/><rect x="41" y="2" width="16" height="9" rx="2" fill="none" stroke="white"/><rect x="43" y="4" width="12" height="5" rx="1"/><rect x="58" y="5" width="2" height="3"/></svg>';
  const slide=`<div class="slide"><div class="slide-brand"><img src="${icon}"><div><div class="slide-name">Surfare</div><p class="slide-tagline">Your digital safety assistant</p></div></div><div class="phone"><div class="button"></div><div class="display"><div class="island"></div><div class="status"><span>9:41</span><span>${statusIcons}</span></div>${opening}</div></div></div>`;
  await writeFile(path.join(out,'03-opening-slide-preview.html'),doc(slide,previewCss));
  await page.setViewportSize({width:1600,height:900});
  await page.goto(pathToFileURL(path.join(out,'03-opening-slide-preview.html')).href);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  await page.screenshot({path:path.join(out,'03-opening-slide-preview.png')});
  await page.close();
  const actual=await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:4,reducedMotion:'no-preference'});
  await actual.clock.install({time:new Date('2026-11-23T12:00:00Z')});
  await actual.clock.pauseAt(new Date('2026-11-23T12:00:01Z'));
  await actual.goto('http://localhost:5173/',{waitUntil:'load'});
  await actual.locator('.surfare-intro[open]').waitFor({state:'visible'});
  await actual.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.surfare-intro img')].map(i=>i.decode()));});
  await actual.clock.runFor(1600);
  await actual.screenshot({path:path.join(out,'04-original-app-intro.png')});
  console.log('Exported original app intro');
  await writeFile(path.join(out,'README.txt'),`SURFARE PITCH DECK OPENING\n\n01-opening-phone.png â€” Recommended opening image for the phone in your deck.\n02-intro-phone.png â€” Light intro alternative.\n03-opening-slide-preview.png â€” Complete 16:9 slide preview with the recommended screen in a phone.\n04-original-app-intro.png â€” Actual app intro exported as a still.\n\nPhone images: 1720 x 3728 pixels, 4x rendering, approximately 9:19.5 aspect ratio.\nThe clean phone images contain no phone frame or status bar. Place one inside your existing phone frame, set it to fill, and center it. The background bleeds to all edges. Keep the upper safe area beneath the camera cutout.\nThe slide preview is 6400 x 3600 pixels.\n\n01 and 02 are custom pitch artwork using existing Surfare branding and mascot assets. They do not change the application. Original app intro is 04.\nHTML files are editable standalone sources with embedded fonts and assets.\nRegenerate: node frontend/scripts/pitch-opening.mjs (frontend dev server must be running for 04).\n`);
}finally{await browser.close();}

