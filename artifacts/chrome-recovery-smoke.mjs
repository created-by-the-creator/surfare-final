import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ACKNOWLEDGMENT_KEY, NOTICE_VERSION } from '../frontend/src/privacy/acknowledgment.js';

const output = new URL('../artifacts/recovery/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [lang, width, height] of [['en', 1440, 1000], ['en', 390, 844], ['en', 320, 568], ['tl', 390, 844], ['taglish', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const posts = [], errors = [];
    page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ lang, key, version }) => {
      if (window.top !== window) return;
      localStorage.setItem('surfare-welcome-seen', 'true'); localStorage.setItem('surfare-language', lang);
      localStorage.setItem(key, JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
    }, { lang, key: ACKNOWLEDGMENT_KEY, version: NOTICE_VERSION });
    await page.goto('http://127.0.0.1:5175', { waitUntil: 'domcontentloaded' });
    await page.locator('.nav-guide-link').click();
    const dialog = page.locator('.recovery-dialog'); await dialog.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.nav-guide-link').innerText(), 'Surfy Lifeguard');
    assert.equal(await dialog.locator('.recovery-chat').count(), 0, 'chat starts closed');
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await dialog.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(16, 44, 87)');
    const mascot = dialog.locator('.recovery-intro img');
    await mascot.evaluate(image => image.decode());
    assert.match(await mascot.getAttribute('src'), /surfy-lifeguard.webp/);
    assert.equal(await mascot.evaluate(image => image.clientHeight >= 200), true);
    await dialog.screenshot({ path: fileURLToPath(new URL(`${lang}-${width}-lifeguard.png`, output)) });

    await dialog.locator('.recovery-context-fields input').last().fill('UnionBank');
    await dialog.locator('input[value="paid"]').check();
    await dialog.locator('.recovery-primary').click();
    assert.equal(await dialog.locator('.recovery-steps').isVisible(), true);
    assert.equal(await dialog.locator('.recovery-contacts').getAttribute('open'), null);
    const firstStep = dialog.locator('.recovery-steps input').first(); await firstStep.check();
    assert.match(await dialog.locator('.recovery-steps-heading span').innerText(), /^1 \/ /);
    await dialog.locator('.recovery-contacts summary').click();
    assert.equal(await dialog.locator('.recovery-contact').first().isVisible(), true);
    await dialog.locator('.recovery-chat-jump').click();
    const chat = dialog.locator('.recovery-chat'); await chat.waitFor();
    assert.equal(await dialog.locator('.recovery-body').isVisible(), false);
    assert.equal(await chat.locator('.ask-dialog .ask-mascot-stage img').count(), 1);
    assert.equal(await chat.locator('.ask-dialog').evaluate(element => element.scrollHeight <= element.clientHeight + 1), true, 'conversation is never clipped by the main-page panel sizing');
    assert.equal(await chat.locator('.recovery-online input').isChecked(), false);
    await chat.locator('#lifeguard-input').fill('I sent money. What should I do first?');
    await chat.locator('.ask-form').evaluate(form => form.requestSubmit());
    assert.equal(await chat.locator('.chat-user').count(), 1);
    assert.equal(await chat.locator('.chat-surfy').count(), 1);
    assert.equal(posts.length, 0, 'local chat never uploads');
    assert.doesNotMatch(await dialog.innerText(), /\w\?s\b|\d \? |AM\?7/);
    await dialog.evaluate(element => element.scrollTo({ top: 0 }));
    await dialog.screenshot({ path: fileURLToPath(new URL(`${lang}-${width}-lifeguard-chat.png`, output)) });
    await dialog.locator('.recovery-chat-view > .recovery-back').click();
    assert.equal(await dialog.locator('.recovery-chat').count(), 0);
    assert.equal(await firstStep.isChecked(), true, 'checklist survives switching views');
    await page.waitForFunction(() => document.querySelector('.recovery-chat-jump') === document.activeElement);
    await dialog.locator('.recovery-chat-jump').click();
    assert.equal(await chat.locator('.chat-user').count(), 1, 'chat survives returning to the guide');

    if (lang === 'en' && width === 1440) {
      let payload;
      await page.route('**/api/recovery-guide', route => { payload = route.request().postDataJSON(); return route.fulfill({ json: { status: 'completed', answer: 'Use the help section inside your usual banking app. Ask support about the options for the payment.', provider: 'openrouter' } }); });
      await chat.locator('.recovery-online input').check(); assert.equal(posts.length, 0);
      await chat.locator('#lifeguard-input').fill('Where is UnionBank support?');
      await chat.locator('.ask-form').evaluate(form => form.requestSubmit());
      await chat.getByText('Use the help section inside your usual banking app.', { exact: false }).waitFor();
      assert.equal(payload.providerName, 'UnionBank'); assert.equal(payload.consent, true); assert.equal(posts.length, 1);
      assert.equal(await chat.locator('iframe,.recovery-chat-sources').count(), 0);
      await page.context().setOffline(true);
      await page.waitForFunction(() => !document.querySelector('.recovery-online input').checked);
      await chat.locator('#lifeguard-input').fill('I shared my password');
      await chat.locator('.ask-form').evaluate(form => form.requestSubmit()); assert.equal(posts.length, 1);
      await page.context().setOffline(false);
      await page.route('**/api/recovery-guide', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
      await chat.locator('.recovery-online input').check();
      await chat.locator('#lifeguard-input').fill('Where can I find support?');
      await chat.locator('.ask-form').evaluate(form => form.requestSubmit());
      await chat.getByText("Surfy's online help is unavailable.", { exact: false }).waitFor();
    }
    await dialog.locator('.recovery-header > button').click(); await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.nav-guide-link').evaluate(element => element === document.activeElement), true);
    await page.locator('.nav-guide-link').click(); assert.equal(await dialog.locator('.recovery-chat').count(), 0);
    await dialog.locator('.recovery-chat-jump').click(); assert.equal(await chat.locator('.chat-user').count(), 0);
    assert.equal(await chat.locator('.recovery-online input').isChecked(), false);
    assert.deepEqual(errors, []); console.log(`${lang} ${width}: passed`); await page.close();
  }

  const page = await browser.newPage();
  await page.addInitScript(() => { if (top === window) localStorage.setItem('surfare-welcome-seen', 'true'); });
  await page.goto('http://127.0.0.1:5175');
  const notice = page.locator('.privacy-notice'); await notice.waitFor();
  await notice.locator('.notice-close').click(); await notice.waitFor({ state: 'detached' });
  await page.locator('.nav-guide-link').click(); await page.locator('.recovery-chat-jump').click();
  await page.locator('.recovery-online input').click(); await notice.waitFor();
  await notice.locator('.notice-close').click(); await notice.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.recovery-online input').isChecked(), false);
  await page.locator('.recovery-online input').click(); await notice.waitFor();
  await notice.locator('.notice-scroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await notice.locator('input[type="checkbox"]').check(); await notice.locator('.notice-accept').click();
  await notice.waitFor({ state: 'detached' }); assert.equal(await page.locator('.recovery-online input').isChecked(), true);
  await page.close(); console.log('Guide acknowledgment: decline and accept passed');
} finally { await browser.close(); }
