// Load the actual MV3 package; API responses and the authored image are mocked.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EXTENSION_ID } from '../identity.js';
import { NOTICE_VERSION } from '../../frontend/src/privacy/acknowledgment.js';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'extension/dist');
const output = path.join(root, 'artifacts/extension');
await mkdir(output, { recursive: true });
const image = await readFile(path.join(root, 'backend/tests/fixtures/ocr/screenshot.png'));
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 390, height: 900 },
  args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
});
const records = [], errors = [], calls = [];
try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  assert.equal(new URL(worker.url()).hostname, EXTENSION_ID);
  let holdImage, imageStarted;
  await context.route('https://surfare.vercel.app/extension-authored-test.png', route => route.fulfill({ contentType: 'image/png', body: image }));
  await context.route('https://surfare.vercel.app/api/extension', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (body.path === '/api/image-detect') {
      if (body.method === 'GET') return route.fulfill({ json: { configured: true, providerId: 'sightengine' } });
      if (holdImage) { imageStarted(); await holdImage; }
      return route.fulfill({ json: { status: 'completed', providerId: 'sightengine', detection: { aiGeneratedScore: 0.94 } } }).catch(() => {});
    }
    if (body.path === '/api/surfy') return route.fulfill({ json: { status: 'completed', answer: 'This image check found signs of AI use. Ask for the original image before sharing it.' } });
    throw Error(`Unexpected service ${body.path}`);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text().slice(0, 300)); });
  await page.addInitScript(version => {
    localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
  }, NOTICE_VERSION);
  await page.goto(`chrome-extension://${EXTENSION_ID}/sidepanel.html`);
  await page.locator('#selected-text').waitFor();
  const windowId = await page.evaluate(async () => (await chrome.windows.getCurrent()).id);
  async function select(menuItemId, value) {
    await page.evaluate(async ({ menuItemId, value, windowId }) => {
      const { handleContextMenu } = await import(chrome.runtime.getURL('background.js'));
      handleContextMenu({ menuItemId, selectionText: value, linkUrl: value, srcUrl: value, pageUrl: value }, { windowId });
    }, { menuItemId, value, windowId });
  }
  async function completed() {
    await page.locator('.extension-reset').waitFor();
    await expect(page.locator('.extension-check')).toBeEnabled();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await select('surfare-text', 'Send your OTP now or your account will be blocked today.');
  await completed();
  await expect(page.locator('.result-panel')).toHaveClass(/result-high/);
  assert.equal(calls.length, 0);
  await page.locator('.result-ask-button').click();
  await page.locator('.ask-dialog').waitFor();
  await page.screenshot({ path: path.join(output, 'text-and-surfy.png'), fullPage: true });
  records.push({ check: 'selected text', localHighRisk: true, automaticApiCalls: 0 });

  await select('surfare-link', 'javascript:alert(1)');
  await expect(page.locator('#selected-text')).toHaveValue('javascript:alert(1)');
  await completed();
  await expect(page.locator('.result-panel')).toHaveClass(/result-high/);
  assert.equal(await page.locator('.ask-dialog').count(), 0);
  records.push({ check: 'unsafe link', opened: false, localWarning: true });

  await select('surfare-image', 'https://surfare.vercel.app/extension-authored-test.png');
  await page.locator('.extension-preview').waitFor();
  await completed();
  assert.equal(calls.length, 0);
  await page.locator('.extension-online input').check();
  await page.locator('.extension-check').click();
  await completed();
  await expect(page.locator('.result-state-title')).toHaveText('Likely made with AI');
  const upload = calls.find(body => body.path === '/api/image-detect' && body.method === 'POST');
  assert.equal(upload.body.consent, true);
  assert.equal(upload.body.provider, 'sightengine');
  assert.match(upload.body.image, /^data:image\/jpeg;base64,\/9j\//);
  await page.screenshot({ path: path.join(output, 'image-result.png'), fullPage: true });
  await page.locator('.result-ask-button').click();
  await page.locator('#ask-input').fill('Why did this image get that result?');
  await page.locator('#ask-input').press('Enter');
  await expect(page.locator('.chat-surfy').last()).toContainText('Ask for the original image before sharing it.');
  const chat = calls.find(body => body.path === '/api/surfy');
  assert(chat.body.result.explanation.includes('0.940'));
  assert(!JSON.stringify(chat.body).includes('data:image/'));
  records.push({ check: 'image and Ask Surfy', consentRequired: true, scoreInChatContext: true });

  let release;
  holdImage = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { imageStarted = resolve; });
  await page.locator('.extension-check').click();
  await started;
  await select('surfare-text', 'Our meeting is tomorrow at four. Please bring your notes.');
  await expect(page.locator('#selected-text')).toHaveValue('Our meeting is tomorrow at four. Please bring your notes.');
  await completed();
  release(); holdImage = null;
  await expect(page.locator('.result-state-title')).toHaveText('No local warning signs');
  assert.equal(await page.locator('.ask-dialog').count(), 0);
  records.push({ check: 'new selection during old online check', oldResultCannotOverwrite: true });

  for (const [language, width] of [['tl', 320], ['taglish', 390]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.extension-header select').selectOption(language);
    await select('surfare-text', 'Send your password now or your account will be blocked.');
    await completed();
    await expect(page.locator('.result-panel')).toHaveClass(/result-high/);
    await page.screenshot({ path: path.join(output, `${language}-${width}.png`), fullPage: true });
  }
  await page.locator('.extension-header select').selectOption('en');
  await page.locator('.extension-tabs button').nth(2).click();
  await page.locator('#extension-image').setInputFiles(path.join(root, 'backend/tests/fixtures/content/tagalog-threat-qr.png'));
  await page.locator('#image-mode').selectOption('qr');
  await page.locator('.extension-check').click();
  await completed();
  await expect(page.locator('.result-panel')).toHaveClass(/result-high/);
  records.push({ check: 'packaged QR worker', worksOffline: true });
  await page.locator('#extension-image').setInputFiles(path.join(root, 'backend/tests/fixtures/content/tagalog-threat.png'));
  await page.locator('#image-mode').selectOption('ocr');
  await page.locator('.extension-check').click();
  await completed();
  await expect(page.locator('.result-panel')).toHaveClass(/result-high/);
  records.push({ check: 'packaged OCR runtime', extractedText: true });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'smoke.json'), JSON.stringify({ checkedAt: new Date().toISOString(), records }, null, 2));
  console.log(JSON.stringify(records, null, 2));
} finally { await context.close(); }
