// All link destinations are mocked. No submitted link is visited by this test.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';
import { resolveQrChain } from '../../backend/server/services/qr-resolve.js';

const root = new URL('../../', import.meta.url);
const short = 'https://bit.ly/surfare-example';
const second = 'https://tinyurl.com/surfare-example';
const benign = await resolveQrChain(short, async url => url === short
  ? { status: 302, location: 'https://surfare.vercel.app/' } : { status: 200 });
const harmful = await resolveQrChain(short, async url => url === short
  ? { status: 302, location: 'https://0-0sc.com/login' } : { status: 200 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
await mkdir(new URL('artifacts/links/', root), { recursive: true });
try {
  for (const [lang, width, tab, scenario] of [
    ['en', 1440, 'links', 'benign'], ['en', 390, 'text', 'benign'],
    ['tl', 390, 'text', 'harmful'], ['taglish', 390, 'text', 'message-warning'],
    ['en', 390, 'links', 'unresolved'], ['en', 390, 'text', 'multiple'],
  ]) {
    const copy = JSON.parse(await readFile(new URL(`frontend/src/i18n/${lang}.json`, root), 'utf8'));
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const posts = [], errors = [];
    page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ version, lang }) => {
      sessionStorage.setItem('surfare-ai-opt-in', 'false'); localStorage.setItem('surfare-welcome-seen', 'true'); localStorage.setItem('surfare-language', lang);
      localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
    }, { version: NOTICE_VERSION, lang });
    await page.route('http://localhost:5173/api/**', route => route.abort());
    await page.route('**/api/qr-resolve', async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.consent, true);
      assert.deepEqual(Object.keys(body).sort(), ['consent', 'url']);
      assert.ok([short, second].includes(body.url));
      let report = scenario === 'harmful' || body.url === second ? harmful : benign;
      if (scenario === 'unresolved') report = { ...benign, status: 'unresolved', reason: 'timeout', finalDestination: null, chain: benign.chain.slice(0, 1) };
      if (body.url === second) report = { ...report, originalUrl: second, chain: [{ ...report.chain[0], url: second, domain: 'tinyurl.com' }, ...report.chain.slice(1)] };
      await route.fulfill({ json: report });
    });
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.locator('[role="tab"]').nth(tab === 'text' ? 0 : 1).click();
    const message = scenario === 'message-warning' ? `Send your OTP now or your account will be blocked. ${short}`
      : scenario === 'multiple' ? `Our project website is at ${short} and ${second}` : `Our project website is at ${short}`;
    await page.locator(tab === 'text' ? 'textarea[id$="-message"]' : 'textarea[id$="-url"]').fill(tab === 'text' ? message : short);
    await page.locator('.automatic-link-notice').waitFor();
    assert.equal(posts.length, 0, 'pasting a link does not contact it');
    await page.locator('.check-button').click();
    await page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').waitFor();
    const panel = page.locator('.link-destination-report'); await panel.waitFor();
    assert.deepEqual(posts, Array(scenario === 'multiple' ? 2 : 1).fill('/api/qr-resolve'));
    assert.equal(await panel.locator('.qr-check-details[open]').count(), 0, 'details stay closed');
    if (scenario === 'benign') {
      assert((await panel.innerText()).includes('surfare.vercel.app'));
      assert((await page.locator('.result-heading').innerText()).includes(copy['destination.noWarnings']));
      assert.equal(await page.locator('.result-high, .result-suspicious, .result-low').count(), 0);
    } else if (scenario === 'unresolved') {
      assert((await panel.innerText()).includes(copy['qr.unresolved']));
      assert.equal(await page.locator('.result-low').count(), 0);
    } else {
      await page.locator('.result-high').waitFor();
      if (scenario !== 'message-warning') assert((await panel.innerText()).includes('0-0sc.com'));
      else assert((await panel.innerText()).includes('surfare.vercel.app'), 'a harmless link cannot clear the message threat');
    }
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await panel.screenshot({ path: new URL(`artifacts/links/${tab}-${scenario}-${lang}-${width}.png`, root).pathname.replace(/^\/(\w:)/, '$1') });
    results.push({ tab, scenario, lang, width, requests: posts.length, browserErrors: errors });
    await page.close();
  }
  await writeFile(new URL('artifacts/links/chrome-results.json', root), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
