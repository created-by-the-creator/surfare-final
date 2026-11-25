import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { NOTICE_VERSION } from '../frontend/src/privacy/acknowledgment.js';
import { formatSurfyReply } from '../frontend/src/surfy/reply-format.js';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [], paths = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST') paths.push(new URL(request.url()).pathname);
  });
  await page.addInitScript(version => {
    localStorage.setItem('surfare-welcome-seen', 'true');
    localStorage.setItem('surfare-language', 'en');
    localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
  }, NOTICE_VERSION);
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.locator('.check-ai-choice input').uncheck();
  await page.locator('textarea[id$="-message"]').fill('Never share your OTP or password. Open your usual wallet app for account safety advice.');
  await page.locator('.check-button').click();
  await page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').waitFor();
  await page.locator('.check-ai-choice input').check();
  await page.locator('.result-ask-button').click();
  await page.locator('#ask-input').fill('Why should I not share an OTP?');
  const pending = page.waitForResponse(response => response.url().endsWith('/api/surfy') && response.request().method() === 'POST', { timeout: 30000 });
  await page.locator('#ask-input').press('Enter');
  const response = await pending, data = await response.json();
  const report = { status: data.status, http: response.status(), provider: data.provider, hasAnswer: Boolean(data.answer?.trim()) };
  console.log(JSON.stringify(report));
  assert.equal(response.status(), 200);
  assert.equal(data.status, 'completed');
  assert.ok(['openrouter', 'gemini'].includes(data.provider));
  const { lead, points } = formatSurfyReply(data.answer, 'en');
  const text = (lead || points[0]).replace(/\*\*/g, '').trim();
  await page.waitForFunction(text => [...document.querySelectorAll('.chat-surfy:not(.chat-typing)')]
    .some(element => element.textContent.includes(text)), text);
  assert.deepEqual(errors, []);
  assert.deepEqual(paths, ['/api/surfy']);
  writeFileSync(new URL('openrouter-chat-chrome.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), ...report, renderedAnswer: true, paths, browserErrors: errors }, null, 2));
  await page.screenshot({ path: new URL('openrouter-chat-chrome.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  console.log('Chat answer rendered; no URL lookups or browser errors.');
} finally {
  await browser.close();
}
