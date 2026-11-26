// Exercise completed checks across all four detectors without live API calls.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICE_VERSION } from '../frontend/src/privacy/acknowledgment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const records = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(version => {
      localStorage.setItem('surfare-welcome-seen', 'true');
      localStorage.setItem('surfare-language', 'en');
      localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    }, NOTICE_VERSION);
    await page.goto('http://127.0.0.1:5175');
    const tabs = page.getByRole('tab');
    async function finish() {
      await page.locator('.check-button').click();
      await page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').waitFor();
      for (let i = 0; i < 4; i++) assert.equal(await tabs.nth(i).isEnabled(), true);
    }
    async function switched(index) {
      assert.equal(await tabs.nth(index).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').count(), 0);
      assert.equal(await page.locator('#ask-surfy').count(), 0);
      assert.equal(await page.locator('dialog[open]').count(), 0);
      assert.equal(await page.locator('.check-button').isDisabled(), true);
    }
    await page.locator('.tab-panel textarea').fill('Send your OTP now or your account will be blocked today.');
    await finish();
    await page.locator('.result-ask-button').click();
    await page.locator('#ask-surfy').waitFor();
    await tabs.nth(1).click();
    await switched(1);
    await page.locator('.tab-panel textarea').fill('https://gcash.login-example.xyz/verify');
    await finish();
    await tabs.nth(1).focus();
    await tabs.nth(1).press('ArrowRight');
    await switched(2);
    await page.locator('input[type="file"]').setInputFiles(path.join(root, 'backend/tests/fixtures/ocr/screenshot.png'));
    await page.locator('.image-mode-confirm').click();
    await finish();
    await page.locator('.result-ask-button').click();
    await page.locator('#ask-surfy').waitFor();
    await page.locator('.selected-file-preview button').click();
    await switched(2);
    assert.equal(await page.locator('.selected-file-preview').count(), 0);
    await page.locator('input[type="file"]').setInputFiles(path.join(root, 'backend/tests/fixtures/ocr/screenshot.png'));
    await page.locator('.image-mode-confirm').click();
    await finish();
    // Replacing a completed image directly also starts a fresh check in this tab.
    await page.locator('input[type="file"]').setInputFiles(path.join(root, 'backend/tests/fixtures/ocr/screenshot.png'));
    await page.locator('.image-mode-confirm').click();
    assert.equal(await tabs.nth(2).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.check-columns.has-check-result').count(), 0);
    await finish();
    await tabs.nth(3).click();
    await switched(3);
    await page.locator('input[type="file"]').setInputFiles(path.join(root, 'backend/tests/fixtures/content/tagalog-threat-qr.png'));
    await finish();
    await page.locator('.selected-file-preview button').click();
    await switched(3);
    assert.equal(await page.locator('.qr-decoded').count(), 0);
    await tabs.nth(3).focus();
    await tabs.nth(3).press('Home');
    await switched(0);
    assert.equal(await page.locator('.tab-panel textarea').inputValue(), '');
    // A fresh check can run after switching, including the original detector.
    await page.locator('.tab-panel textarea').fill('Please send your password now.');
    await finish();
    assert.deepEqual(errors, []);
    records.push({ width, completedChecks: 7, imageRemovalAndReplacement: 'passed', qrRemoval: 'passed', mouseAndKeyboardSwitching: 'passed', staleResultAndChat: 'cleared' });
    await page.close();
  }
  // Keep the current detector stable while a provider call is still running.
  const page = await browser.newPage();
  await page.addInitScript(version => {
    localStorage.setItem('surfare-welcome-seen', 'true');
    localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
  }, NOTICE_VERSION);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/image-detect', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { configured: true, providerId: 'sightengine' } });
    await gate;
    await route.fulfill({ json: { status: 'completed', providerId: 'sightengine', detection: { aiGeneratedScore: 0.1 } } });
  });
  await page.goto('http://127.0.0.1:5175');
  await page.locator('.tab-panel textarea').waitFor();
  await page.getByRole('tab').nth(2).focus();
  await page.getByRole('tab').nth(2).press('Enter');
  await page.locator('input[type="file"]').setInputFiles(path.join(root, 'backend/tests/fixtures/ocr/screenshot.png'));
  await page.locator('.image-mode-confirm').click();
  await page.locator('.check-button').click();
  await page.locator('.image-local-progress').waitFor();
  assert.equal(await page.locator('.selected-file-preview button').isDisabled(), true);
  assert.equal(await page.locator('input[type="file"]').isDisabled(), true);
  for (let i = 0; i < 4; i++) assert.equal(await page.getByRole('tab').nth(i).isDisabled(), true);
  release();
  await page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').waitFor();
  await page.getByRole('tab').nth(0).click();
  assert.equal(await page.getByRole('tab').nth(0).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').count(), 0);
  records.push({ pendingCheck: 'tabs stay disabled until completion' });
  console.log(JSON.stringify(records, null, 2));
} finally { await browser.close(); }
