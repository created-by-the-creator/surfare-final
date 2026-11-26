// Exercise the calm, one-action recovery guide and its separate optional chat.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ACKNOWLEDGMENT_KEY, NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

const base = process.env.SURFARE_BASE_URL || 'http://localhost:5173';
const output = new URL('../../artifacts/recovery-simple/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const records = [];
try {
  for (const [lang, width, height] of [['en', 1440, 1000], ['en', 390, 844], ['en', 320, 568], ['tl', 390, 844], ['taglish', 390, 844], ['en', 844, 390]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce', acceptDownloads: true });
    const posts = [], errors = [], missing = [];
    page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Missing .*translation/.test(message.text())) missing.push(message.text()); });
    await page.addInitScript(({ lang, key, version }) => {
      if (window.top !== window) return;
      localStorage.setItem('surfare-welcome-seen', 'true'); localStorage.setItem('surfare-language', lang);
      localStorage.setItem(key, JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
    }, { lang, key: ACKNOWLEDGMENT_KEY, version: NOTICE_VERSION });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.nav-guide-link').click();
    const dialog = page.locator('.recovery-dialog');
    await dialog.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const noOverflow = async () => {
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    };
    await noOverflow();
    assert.equal(await dialog.locator('.recovery-start-choice:visible').count(), 3);
    assert.equal(await dialog.locator('input:visible,select:visible').count(), 0, 'No form blocks the first action');
    assert.equal(await dialog.locator('.recovery-chat').count(), 0);
    await dialog.locator('.recovery-intro img').evaluate(image => image.decode());
    await dialog.screenshot({ path: fileURLToPath(new URL(`${lang}-${width}-start.png`, output)) });
    await dialog.locator('.recovery-start-choice').first().click();
    const action = dialog.locator('.recovery-action-card');
    assert.equal(await action.count(), 1);
    assert.equal(await action.locator('h3').innerText(), (await import(`../src/i18n/${lang}.json`, { with: { type: 'json' } })).default['recovery.step.payment.title']);
    assert.equal(await action.locator('h3').evaluate(element => document.activeElement === element), true);
    assert.equal(await dialog.locator('.recovery-context-fields input:visible').count(), 0);
    await noOverflow();
    await dialog.screenshot({ path: fileURLToPath(new URL(`${lang}-${width}-first-action.png`, output)) });
    await action.locator('.recovery-provider-help summary').click();
    await action.getByRole('button', { name: 'GCash', exact: true }).click();
    assert.equal(await action.locator('.recovery-contact strong').innerText(), 'GCash');
    assert.match(await action.locator('a[href^="https:"]').getAttribute('href'), /^https:\/\/help\.gcash\.com\//);
    assert.equal(posts.length, 0, 'Choosing a provider does not send information');
    await action.locator('.recovery-primary').click(); // Payment completed.
    await action.locator('.recovery-later').click(); // Stop step skipped, not completed.
    const currentTitle = await action.locator('h3').innerText();
    await dialog.locator('.recovery-chat-jump').click();
    const chat = dialog.locator('.recovery-chat'); await chat.waitFor();
    const chatLayout = await chat.evaluate(element => {
      const dialog = element.closest('dialog'), messages = element.querySelector('.ask-messages');
      const form = element.querySelector('.ask-form');
      return { fullWidth: messages.getBoundingClientRect().width >= element.getBoundingClientRect().width * .95,
        composerVisible: form.getBoundingClientRect().bottom <= dialog.getBoundingClientRect().bottom - 5,
        outerScroll: dialog.scrollHeight > dialog.clientHeight + 1 };
    });
    assert.deepEqual(chatLayout, { fullWidth: true, composerVisible: true, outerScroll: false });
    assert.equal(await dialog.locator('.recovery-body').isVisible(), false);
    assert.equal(await chat.locator('.recovery-online input').isChecked(), false);
    await chat.locator('#lifeguard-input').fill('I sent money. What should I do first?');
    await chat.locator('.ask-form').evaluate(form => form.requestSubmit());
    assert.equal(await chat.locator('.chat-user').count(), 1);
    assert.equal(await chat.locator('.chat-surfy').count(), 1);
    const replyWidth = await chat.locator('.chat-surfy').evaluate(element => element.getBoundingClientRect().width / element.parentElement.getBoundingClientRect().width);
    assert(replyWidth > .65, 'Lifeguard replies should use the conversation width, not a narrow grid column');
    const leadVisible = await chat.locator('.chat-surfy').evaluate(element => {
      const bounds = element.getBoundingClientRect(), area = element.parentElement.getBoundingClientRect();
      return bounds.top >= area.top - 1 && bounds.top < area.bottom;
    });
    assert(leadVisible, 'The start of a long reply must remain visible');
    await dialog.screenshot({ path: fileURLToPath(new URL(`${lang}-${width}-chat.png`, output)) });
    assert.equal(posts.length, 0, 'Local help never uploads');
    await noOverflow();
    await dialog.locator('.recovery-chat-view > .recovery-back').click();
    assert.equal(await action.locator('h3').innerText(), currentTitle, 'Returning keeps the current step');
    assert.equal(await dialog.locator('.recovery-chat-jump').evaluate(element => element === document.activeElement), true);
    while (await action.count()) await action.locator('.recovery-primary').click();
    assert.match(await dialog.locator('.recovery-finish > p').first().innerText(), /3.*4/);
    const downloaded = page.waitForEvent('download');
    await dialog.locator('.recovery-finish > .recovery-primary').click();
    const file = await downloaded;
    const summary = await readFile(await file.path(), 'utf8');
    const dictionary = (await import(`../src/i18n/${lang}.json`, { with: { type: 'json' } })).default;
    assert(summary.includes('[x] ' + dictionary['recovery.step.payment.title']));
    assert(summary.includes('[ ] ' + dictionary['recovery.step.stop.title']), 'Skipped actions remain unfinished');
    assert(summary.includes('GCash'));
    await dialog.locator('.recovery-summary summary').click();
    await dialog.locator('.recovery-summary li').nth(1).getByRole('button').click();
    assert.equal(await action.locator('h3').innerText(), dictionary['recovery.step.stop.title']);
    await dialog.locator('.recovery-adjust summary').click();
    await dialog.locator('.recovery-extra-situations input').nth(1).check();
    assert.equal(await action.locator('h3').innerText(), dictionary['recovery.step.payment.title'], 'Payment stays first when an account exposure is added');

    await dialog.locator('.recovery-danger').click();
    assert.equal(await action.locator('h3').innerText(), dictionary['recovery.step.safety.title']);
    assert.equal(await action.locator('a[href="tel:911"]').isVisible(), true);
    await dialog.locator('.recovery-settings summary').click();
    await dialog.locator('.recovery-settings select').selectOption('other');
    await dialog.locator('.recovery-settings input').first().fill('Singapore');
    assert.equal(await action.locator('a[href^="tel:"]').count(), 0, 'PH numbers are hidden abroad');
    await noOverflow();
    await dialog.locator('.recovery-settings select').selectOption('PH');

    if (lang === 'en' && width === 1440) {
      let payload;
      await page.route('**/api/recovery-guide', route => {
        payload = route.request().postDataJSON();
        return route.fulfill({ json: { status: 'completed', answer: 'Open Help inside the app you normally use. Ask support what can be done about the payment.', provider: 'openrouter' } });
      });
      await dialog.locator('.recovery-chat-jump').click();
      assert.equal(await chat.locator('.chat-user').count(), 1, 'Conversation survives returning');
      await chat.locator('.recovery-online input').check();
      assert.equal(posts.length, 0, 'Enabling AI does not submit');
      await chat.locator('#lifeguard-input').fill('How do I contact support?');
      await chat.locator('.ask-form').evaluate(form => form.requestSubmit());
      await chat.getByText('Open Help inside the app you normally use.', { exact: false }).waitFor();
      assert.equal(payload.providerName, 'GCash'); assert.equal(payload.consent, true); assert.equal(posts.length, 1);
      await page.context().setOffline(true);
      await page.waitForFunction(() => !document.querySelector('.recovery-online input').checked);
      await chat.locator('#lifeguard-input').fill('I shared my password');
      await chat.locator('.ask-form').evaluate(form => form.requestSubmit());
      assert.equal(posts.length, 1);
      await page.context().setOffline(false);
      await page.locator('.connection-status.is-online').waitFor();
      await page.route('**/api/recovery-guide', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
      await chat.locator('.recovery-online input').check();
      await chat.locator('#lifeguard-input').fill('Where can I find support?');
      await chat.locator('.ask-form').evaluate(form => form.requestSubmit());
      await chat.getByText("Surfy's online help is unavailable.", { exact: false }).waitFor();
    }
    await dialog.locator('.recovery-header > button').click(); await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.nav-guide-link').evaluate(element => element === document.activeElement), true);
    await page.locator('.nav-guide-link').click();
    assert.equal(await dialog.locator('.recovery-start-choice').count(), 3);
    await dialog.locator('.recovery-start-choice').nth(2).click();
    assert.equal(await action.locator('h3').innerText(), dictionary['recovery.step.stop.title']);
    await dialog.locator('.recovery-adjust summary').click();
    await dialog.locator('.recovery-extra-situations input').nth(2).check();
    await action.locator('.recovery-provider-help summary').click();
    await action.locator('.recovery-provider-choices button').last().click();
    assert.equal(await action.locator('.recovery-contact').count(), 0, 'Other services get generic official-app guidance');
    assert.equal(await action.locator('a[href*="bsp.gov.ph"]').count(), 0);
    await dialog.locator('.recovery-chat-jump').click();
    assert.equal(await chat.locator('.chat-user').count(), 0);
    assert.equal(await chat.locator('.recovery-online input').isChecked(), false);
    const composerTop = (await chat.locator('.ask-form').boundingBox()).y;
    for (let turn = 0; turn < 4; turn++) {
      await chat.locator('#lifeguard-input').fill('I sent money and need help understanding my next step. ' + 'Please explain calmly. '.repeat(5));
      await chat.locator('.ask-form').evaluate(form => form.requestSubmit());
    }
    assert(Math.abs((await chat.locator('.ask-form').boundingBox()).y - composerTop) < 1, 'More messages must not push the composer out of view');
    assert.equal(await chat.locator('.ask-messages').evaluate(element => element.scrollHeight > element.clientHeight), true);
    assert.equal(await dialog.evaluate(element => element.scrollHeight > element.clientHeight + 1), false);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    records.push({ lang, width, result: 'passed', singleAction: true, skippedStepsUnfinished: true, localUploads: 0 });
    await page.close();
  }
  // Online guidance still needs acknowledgment and separate opt-in.
  const page = await browser.newPage();
  await page.addInitScript(() => { if (top === window) localStorage.setItem('surfare-welcome-seen', 'true'); });
  await page.goto(base);
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
  await page.close();
  await writeFile(new URL('verification.json', output), JSON.stringify({ records, privacyConsent: 'passed' }, null, 2));
  console.log(JSON.stringify({ records, privacyConsent: 'passed' }, null, 2));
} finally { await browser.close(); }
