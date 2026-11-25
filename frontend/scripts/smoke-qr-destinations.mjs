// Uses repository-authored fictional QR fixtures and a mocked resolver; visits no QR links.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';
import { resolveQrChain } from '../../backend/server/services/qr-resolve.js';

const original = 'https://is.gd/surfare-redirect-test';
const root = new URL('../../', import.meta.url);
const report = await resolveQrChain(original, async url => url === original
  ? { status: 302, location: 'https://example.com/step' }
  : url === 'https://example.com/step' ? { status: 307, location: 'https://0-0sc.com/login' } : { status: 200 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
await mkdir(new URL('artifacts/qr/', root), { recursive: true });
try {
  for (const [lang, width, scenario] of [['en', 1440, 'warning'], ['tl', 390, 'unresolved'], ['taglish', 390, 'benign'], ['en', 390, 'private'], ['en', 390, 'unsupported']]) {
    const copy = JSON.parse(await readFile(new URL(`frontend/src/i18n/${lang}.json`, root), 'utf8'));
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const posts = [], errors = [];
    page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ version, lang }) => {
      localStorage.setItem('surfare-welcome-seen', 'true'); localStorage.setItem('surfare-language', lang);
      localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
    }, { version: NOTICE_VERSION, lang });
    await page.route('http://localhost:5173/api/**', route => route.abort());
    let requests = 0;
    await page.route('**/api/qr-resolve', async route => {
      requests++;
      assert.deepEqual(route.request().postDataJSON(), { url: original, consent: true });
      const current = scenario === 'unresolved' ? { ...report, status: 'unresolved', reason: 'network', finalDestination: null,
        riskLevel: 'Insufficient evidence', score: 0, redirectCount: 0, chain: report.chain.slice(0, 1) }
        : scenario === 'benign' ? { ...report, finalDestination: 'https://surfare.vercel.app/', redirectCount: 1, riskLevel: 'Insufficient evidence', score: 0,
          chain: [report.chain[0], { url: 'https://surfare.vercel.app/', domain: 'surfare.vercel.app', visited: true, httpStatus: 200, level: 'Insufficient evidence', indicators: [] }] } : report;
      await route.fulfill({ json: current });
    });
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.locator('[role="tab"]').nth(3).click();
    const file = scenario === 'private' ? 'private.png' : scenario === 'unsupported' ? 'unsupported.png' : 'url.png';
    await page.locator('input[type="file"]').setInputFiles(new URL(`backend/tests/fixtures/qr/${file}`, root).pathname.replace(/^\/(\w:)/, '$1'));
    assert.equal(posts.length, 0, 'selecting an image must not contact its links');
    await page.locator('.check-button').click();
    await page.locator('.check-columns.has-check-result .result-panel:not(.check-progress)').waitFor();
    const panel = page.locator('.link-destination-report'); await panel.waitFor();
    assert.equal(posts.length, ['private', 'unsupported'].includes(scenario) ? 0 : 1, 'Check automatically resolves public short links only');
    if (scenario === 'private' || scenario === 'unsupported') {
      assert.equal(await panel.locator('button').count(), 0);
      assert((await panel.innerText()).includes(copy[`qr.payload.${scenario}`]));
    } else {
      const details = panel.locator('.qr-check-details');
      assert.equal(await details.getAttribute('open'), null, 'technical details start closed');
      assert.equal((await panel.innerText()).includes(original), false, 'full URLs are hidden in the simple view');
      assert((await panel.innerText()).includes(scenario === 'warning' ? '0-0sc.com' : scenario === 'benign' ? 'surfare.vercel.app' : 'is.gd'));
      assert((await details.textContent()).includes(original), 'the original address remains available');
      await panel.locator('.qr-resolution').waitFor({ state: 'attached' });
      assert.equal(requests, 1);
      assert.equal(await details.getAttribute('open'), null, 'results do not open technical details automatically');
      assert.equal(await panel.locator('.qr-hop-list').isVisible(), false);
      await panel.screenshot({ path: new URL(`artifacts/qr/${scenario}-${lang}-${width}.png`, root).pathname.replace(/^\/(\w:)/, '$1') });
      await details.locator(':scope > summary').click();
      await panel.locator('.qr-hop-list').waitFor();
      if (scenario === 'warning') {
        assert.equal(await panel.locator('.qr-hop-list > li').count(), 3);
        assert((await panel.innerText()).includes('https://0-0sc.com/login'));
        await page.locator('.result-high').waitFor();
      } else if (scenario === 'unresolved') {
        assert((await panel.innerText()).includes(copy['qr.unresolved']));
        assert.equal(await page.locator('.result-high').count(), 0);
      } else {
        assert((await panel.innerText()).includes('surfare.vercel.app'));
        assert.equal(await page.locator('.result-low').count(), 0, 'HTTP success must not certify safety');
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    await panel.screenshot({ path: new URL(`artifacts/qr/${scenario}-${lang}-${width}-details.png`, root).pathname.replace(/^\/(\w:)/, '$1') });
    results.push({ scenario, lang, width, requests, simpleView: true, browserErrors: errors });
    await page.close();
  }
  await writeFile(new URL('artifacts/qr/chrome-results.json', root), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
