// Run against the production preview after npm run build. No external providers are contacted.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

const base = process.env.SURFARE_BASE_URL || 'http://127.0.0.1:4173';
const directory = new URL('../../artifacts/mentor-feedback/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [], errors = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(version => {
    localStorage.setItem('surfare-language', 'en');
    localStorage.setItem('surfare-welcome-seen', 'true');
    localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
  }, NOTICE_VERSION);
  // Fail the test if any submission tries to leave the browser; checks below are offline.
  await page.route('**/api/**', route => route.abort());
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  assert.match(await page.locator('#offline-resources').innerText(), /19\.3 MB/);
  assert.equal(requests.some(path => /\/(tesseract|tessdata)\//.test(path)), false, 'OCR must not download on first visit');
  assert.equal(requests.some(path => path.endsWith('.wasm')), false, 'Image WASM must not be precached');
  // Keep the opt-in enabled across the offline transition: the app must still use local replies.
  await page.locator('.check-ai-choice input').check();
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.onLine === false);
  const completed = () => page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').waitFor();
  const checkMessage = async text => {
    await page.locator('textarea[id$="-message"]').fill(text);
    await page.locator('.check-button').click();
    await completed();
    return page.locator('.result-panel').innerText();
  };
  assert.match(await checkMessage('The school meeting is tomorrow at nine. Please bring your notes.'), /Low risk/);
  await page.locator('.result-ask-button').click();
  await page.locator('#ask-input').fill('How can I verify the sender?');
  await page.locator('#ask-input').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.chat-surfy').length >= 2);
  assert.equal(requests.some(path => path === '/api/surfy'), false);
  await page.screenshot({ path: fileURLToPath(new URL('offline-low-risk.png', directory)) });
  assert.match(await checkMessage('Hi.'), /Needs more context|NOT ENOUGH INFO/);
  assert.match(await checkMessage('Your parcel cannot be delivered. Confirm your address at https://parcel-help.example/verify'), /Suspicious|High risk/);
  await page.locator('[role="tab"]').nth(2).click();
  await page.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL('../../backend/tests/fixtures/ocr/screenshot.png', import.meta.url)));
  await page.locator('.image-mode-confirm').click();
  await page.locator('.check-button').click();
  await completed();
  assert.equal(await page.locator('.image-metadata-report').count(), 1);
  assert.match(await page.locator('.result-panel').innerText(), /offline|file notes/i);
  assert.equal(requests.some(path => path === '/api/image-detect'), false);
  assert.deepEqual(errors, []);
  const report = { productionOfflineReload: true, automaticOcrDownloads: 0, initialWasmDownloads: 0, ordinaryMessage: 'low risk', shortMessage: 'not enough info', parcelUpdate: 'flagged', offlineSurfy: 'local reply without API', offlineImage: 'local metadata without upload', pageErrors: errors };
  await writeFile(new URL('smoke.json', directory), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
