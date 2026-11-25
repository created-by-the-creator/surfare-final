import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'pitch-deck-mobile');
await mkdir(path.join(output, 'screens'), { recursive: true });
await mkdir(path.join(output, 'sections'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'en-PH' });
await context.addInitScript(() => {
  localStorage.setItem('surfare-welcome-seen', 'true');
  localStorage.setItem('surfare-language', 'en');
  localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version: '2026-11-22.1', acceptedAt: new Date().toISOString() }));
});
const page = await context.newPage();
const captures = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function ready() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); }));
  });
  await page.waitForTimeout(350);
}
async function load(demo = 'idle') {
  await context.setOffline(false);
  await page.goto(`http://localhost:5173/?demo=${demo}`, { waitUntil: 'networkidle' });
  await ready();
}
async function focus(selector, offset = 70) {
  await page.locator(selector).first().evaluate((element, offset) => {
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - offset, behavior: 'instant' });
  }, offset);
  await ready();
}
async function capture(name, title, note = '', selector = '') {
  const folder = selector ? 'sections' : 'screens';
  const file = `${folder}/${name}.png`;
  if (selector) await page.locator(selector).first().screenshot({ path: path.join(output, file), animations: 'disabled' });
  else await page.screenshot({ path: path.join(output, file), animations: 'disabled' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error(`Horizontal overflow: ${name}`);
  captures.push({ file, title, note });
  console.log(`Saved ${file}`);
}
try {
  await load();
  await capture('01-home', 'Home and product promise');
  await capture('01-hero', 'Complete mobile hero', '', '.hero');
  await focus('.check-card');
  await page.locator('.tab-panel textarea').fill('Your GCash account will be blocked today. Send your OTP now to keep access.');
  await capture('02-message-checker', 'Check suspicious messages', 'Fictional example message.');
  await page.getByRole('tab', { name: 'Image', exact: true }).click();
  await capture('03-image-checker', 'Image and screenshot checker');
  await page.getByRole('tab', { name: 'QR code', exact: true }).click();
  await capture('04-qr-checker', 'QR code checker');
  await load('links');
  await focus('.check-card');
  await capture('05-link-checker', 'Suspicious link checker', 'Built-in app demo state.');
  await load('high');
  await focus('.result-panel');
  await capture('06-high-risk-result', 'High-risk finding and next steps', 'Built-in app demo state.');
  await capture('02-risk-result', 'Complete risk result', 'Built-in app demo state.', '.check-result-column');
  await load('ask-chat');
  await focus('.ask-dialog');
  await capture('07-surfy-guidance', 'Surfy explanations and guidance', 'Built-in app demo conversation.');
  await capture('03-surfy', 'Complete Surfy conversation', 'Built-in app demo conversation.', '.ask-dialog');
  await load();
  await focus('.how-section');
  await capture('08-how-it-works', 'How the product works');
  await capture('04-how-it-works', 'Complete how-it-works section', '', '.how-section');
  await focus('.practice-intro');
  await capture('09-play-and-learn', 'Build your scam radar');
  await page.locator('.practice-intro .practice-primary').click();
  await ready();
  await capture('10-scam-challenge', 'Interactive scam-awareness challenge', 'Fictional practice scenario.');
  await capture('05-scam-challenge', 'Complete challenge dialog', 'Fictional practice scenario.', '.practice-dialog');
  await page.locator('.practice-close').click();
  await load();
  await focus('.offline-resources', 500);
  await context.setOffline(true);
  await ready();
  await capture('11-offline-support', 'Offline status and local resources', 'Browser network disabled for this capture. Download resources is not activated.');
  await load();
  await focus('#privacy');
  await capture('12-privacy', 'Privacy and user control');
  await capture('06-privacy', 'Complete privacy section', '', '#privacy');
  await page.locator('.language-control').click();
  await ready();
  await page.getByRole('menuitemradio', { name: /Filipino Tagalog/ }).click();
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await ready();
  await capture('13-filipino-language', 'Filipino language support');
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ viewport: '430 x 932 CSS pixels', scale: 3,
    screenResolution: '1290 x 2796 pixels', captures, errors }, null, 2));
  const cards = captures.map(c => `<a class="card" href="${c.file}"><img src="${c.file}" loading="lazy"><h2>${c.title}</h2><p>${c.file}${c.note ? '<br>' + c.note : ''}</p></a>`).join('');
  await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Surfare mobile pitch screenshots</title><style>body{font:16px system-ui;background:#eef3fa;color:#142854;margin:40px}h1{margin-bottom:8px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:24px;margin-top:30px}.card{background:white;padding:16px;border-radius:18px;color:inherit;text-decoration:none;box-shadow:0 8px 24px #15274c12}.card img{width:100%;height:400px;object-fit:contain;object-position:top;background:#e5ecf6;border-radius:10px}.card h2{font-size:18px}.card p{font-size:13px;line-height:1.6;color:#506281}</style><h1>Surfare — mobile pitch screenshots</h1><p>13 mobile screens at 1290 × 2796 pixels, plus 6 complete section crops. Click any preview to open its original PNG.</p><p>Captured from the local app at a 430 × 932 mobile viewport and 3× pixel density. Result and chat screens use the app's built-in demonstration states.</p><div class="grid">${cards}</div></html>`);
  await writeFile(path.join(output, 'README.txt'), `SURFARE MOBILE PITCH SCREENSHOTS\n\nOpen index.html for a visual gallery.\nUse PNG files in screens/ directly in PowerPoint, Canva, Keynote, or Google Slides.\nResolution: 1290 x 2796 pixels (430 x 932 mobile viewport at 3x).\nsections/ contains complete section crops at the same 3x density, with variable height.\n\nSuggested pitch sequence: 01 home, 02 message checker, 06 risk result, 07 Surfy, 09 play and learn, 10 challenge, 11 offline, 13 Filipino.\n\nExamples are fictional. Result and chat screenshots use built-in development demo states, not live AI responses or a live URL reputation assessment. Offline capture uses browser offline mode; OCR resource download was not activated.\n\nRegenerate from the repository root with the local app running:\nnode frontend/scripts/pitch-mobile.mjs\n`);
  console.log(JSON.stringify({ output, total: captures.length, errors }));
} finally {
  await browser.close();
}
