// Browser integration checks; --live submits one repository-authored fixture.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = path.join(root, 'backend/tests/fixtures/ocr/screenshot.png');
const output = path.join(root, 'artifacts/sightengine');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const records = [];
const errors = [];
async function newPage(lang = 'en', width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ version, lang }) => {
    localStorage.setItem('surfare-welcome-seen', 'true');
    localStorage.setItem('surfare-language', lang);
    localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
  }, { version: NOTICE_VERSION, lang });
  return page;
}
async function selectImage(page) {
  await page.locator('[role="tab"]').nth(2).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.locator('.image-mode-confirm').click();
}
async function start(page) { await page.locator('.check-button').click(); }
async function completed(page) {
  await page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').waitFor({ timeout: 45000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}
try {
  for (const [lang, width, score] of [['en', 1440, 0.94], ['tl', 390, 0.51], ['taglish', 390, 0]]) {
    const copy = JSON.parse(await readFile(path.join(root, `frontend/src/i18n/${lang}.json`), 'utf8'));
    const page = await newPage(lang, width);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let uploads = 0;
    await page.route('**/api/image-detect', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { configured: true, providerId: 'sightengine' } });
      uploads++;
      const body = route.request().postDataJSON();
      assert.equal(body.consent, true);
      assert.equal(body.provider, 'sightengine');
      assert.match(body.image, /^data:image\/jpeg;base64,\/9j\//);
      assert.equal(body.metadata, undefined);
      await gate;
      await route.fulfill({ json: { status: 'completed', providerId: 'sightengine', detection: { aiGeneratedScore: score } } });
    });
    await page.goto('http://localhost:5173');
    await selectImage(page);
    await start(page);
    await page.locator('.image-local-progress').waitFor();
    assert((await page.locator('.image-local-progress').innerText()).length > 30);
    release();
    await completed(page);
    assert.equal(await page.locator('.sightengine-score meter').getAttribute('value'), String(score));
    assert.equal(await page.locator('.sightengine-score meter').isVisible(), false);
    assert.equal(await page.locator('.image-check-details').getAttribute('open'), null);
    assert.equal(await page.locator('.risk-meter-wrap').count(), 0);
    assert.equal(uploads, 1);
    await page.locator('.result-panel').screenshot({ path: path.join(output, `${lang}-${width}.png`), style: '.site-header { visibility: hidden; }' });
    await page.locator('.image-check-details > summary').click();
    assert.equal(await page.locator('.sightengine-score meter').isVisible(), true);
    await page.locator('.image-check-details > summary').click();
    await page.locator('.result-ask-button').click();
    await page.locator('#ask-surfy').waitFor();
    assert.equal(await page.locator('.result-ask-button').getAttribute('aria-expanded'), 'true');
    await page.getByRole('button', { name: copy['ask.imageMeaning'], exact: true }).click();
    await page.waitForFunction(text => [...document.querySelectorAll('.chat-surfy')].at(-1)?.textContent.includes(text), copy[`result.sightengine.summary.${score >= 0.8 ? 'high' : score <= 0.2 ? 'low' : 'uncertain'}`]);
    await page.getByRole('button', { name: copy['ask.imageScore'], exact: true }).click();
    await page.waitForFunction(text => [...document.querySelectorAll('.chat-surfy')].at(-1)?.textContent.includes(text), score.toFixed(3));
    if (lang === 'en') {
      let chatBody;
      await page.route('**/api/surfy', route => {
        chatBody = route.request().postDataJSON();
        return route.fulfill({ json: { status: 'completed', answer: 'Your image check found signs of AI use. Check the original source before sharing it.' } });
      });
      await page.locator('.check-ai-choice input').check();
      await page.locator('#ask-input').fill('Why did my image get this result?');
      await page.locator('#ask-input').press('Enter');
      await page.waitForFunction(() => [...document.querySelectorAll('.chat-surfy')].at(-1)?.textContent.includes('Your image check found signs'));
      assert.match(chatBody.result.explanation, /0\.940/);
      assert(chatBody.result.explanation.includes(copy['result.sightengine.high']));
      assert(!JSON.stringify(chatBody).includes('data:image/'));
    }
    records.push({ scenario: 'simple result; expandable details; Surfy follows current result', lang, width, score, uploads });
    await page.close();
  }

  const page = await newPage();
  let uploads = 0;
  await page.route('**/api/image-detect', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { configured: true, providerId: 'sightengine' } });
    uploads++;
    return uploads === 1
      ? route.fulfill({ status: 429, json: { status: 'unavailable', reason: 'quota' } })
      : route.fulfill({ json: { status: 'completed', providerId: 'sightengine', detection: { aiGeneratedScore: 0.1 } } });
  });
  await page.goto('http://localhost:5173');
  await selectImage(page);
  await start(page);
  await completed(page);
  assert.match(await page.locator('.result-panel').innerText(), /reached its limit/);
  assert.equal(await page.locator('.image-metadata-report').count(), 1);
  assert.equal(uploads, 1);
  await start(page);
  await completed(page);
  assert.equal(await page.locator('.sightengine-score meter').getAttribute('value'), '0.1');
  assert.equal(uploads, 2);
  records.push({ scenario: 'quota preserves local findings; explicit retry succeeds', uploads });
  await page.close();

  const offline = await newPage();
  let offlineUploads = 0;
  await offline.route('**/api/image-detect', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { configured: true, providerId: 'sightengine' } });
    offlineUploads++;
    return route.fulfill({ json: { status: 'completed', providerId: 'sightengine', detection: { aiGeneratedScore: 0.1 } } });
  });
  await offline.goto('http://localhost:5173');
  await offline.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')); });
  await selectImage(offline);
  await start(offline);
  await completed(offline);
  assert.equal(offlineUploads, 0);
  assert.equal(await offline.locator('.image-metadata-report').count(), 1);
  await offline.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')); });
  await start(offline);
  await offline.locator('.image-mode-confirm').waitFor();
  assert.equal(offlineUploads, 0);
  await offline.locator('.image-mode-confirm').click();
  await start(offline);
  await completed(offline);
  assert.equal(offlineUploads, 1);
  records.push({ scenario: 'offline metadata; reconnect requires sharing choice', uploads: offlineUploads });
  await offline.close();

  if (process.argv.includes('--live')) {
    const live = await newPage();
    await live.goto('http://localhost:5173');
    await selectImage(live);
    const responsePromise = live.waitForResponse(response => response.url().endsWith('/api/image-detect') && response.request().method() === 'POST', { timeout: 45000 });
    await start(live);
    const response = await responsePromise;
    const data = await response.json();
    assert.equal(response.status(), 200);
    assert.equal(data.providerId, 'sightengine');
    await completed(live);
    assert.equal(await live.locator('.sightengine-score meter').getAttribute('value'), String(data.detection.aiGeneratedScore));
    await live.locator('.result-panel').screenshot({ path: path.join(output, 'live.png') });
    records.push({ scenario: 'live authored fixture', status: data.status, provider: data.providerId, score: data.detection.aiGeneratedScore });
    await live.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'smoke.json'), JSON.stringify({ checkedAt: new Date().toISOString(), records }, null, 2));
  console.log(JSON.stringify(records, null, 2));
} finally { await browser.close(); }
