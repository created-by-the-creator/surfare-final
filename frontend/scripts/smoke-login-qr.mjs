// Fabricated pairing data only; no real login secrets or external requests.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

const root = new URL('../../', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
await mkdir(new URL('artifacts/login-qr/', root), { recursive: true });
try {
  for (const lang of ['en', 'tl', 'taglish']) {
    const copy = JSON.parse(await readFile(new URL(`frontend/src/i18n/${lang}.json`, root), 'utf8'));
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    const posts = [], errors = [];
    page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ version }) => {
      localStorage.setItem('surfare-welcome-seen', 'true');
      localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
    }, { version: NOTICE_VERSION });
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    const outcome = await page.evaluate(async copy => {
      const { analyzeInput } = await import('/src/engine/analyze.js');
      const { default: ResultPanel } = await import('/src/components/ResultPanel.jsx');
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const qrValue = `2@${'a'.repeat(80)},${'A'.repeat(43)}=,${'B'.repeat(43)}=,${'C'.repeat(43)}=,1`;
      const result = await analyzeInput('qr', { qrValue }, { ai: true });
      const host = document.createElement('div'); host.id = 'login-qr-preview';
      document.body.replaceChildren(host);
      ReactDOM.createRoot(host).render(React.createElement(ResultPanel, {
        status: 'result', result, t: key => copy[key] || key, onReset() {},
      }));
      return { level: result.level, loginQr: result.loginQr, warnings: result.signals.length };
    }, copy);
    await page.getByRole('heading', { name: copy['result.loginQr.title'], exact: true }).waitFor();
    assert.deepEqual(outcome, { level: 'unknown', loginQr: true, warnings: 0 });
    assert((await page.locator('#login-qr-preview').innerText()).includes(copy['result.loginQr.summary']));
    assert.deepEqual(posts, []);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: new URL(`artifacts/login-qr/${lang}.png`, root).pathname.replace(/^\/(\w:)/, '$1') });
    results.push({ lang, ...outcome, posts: posts.length });
    await page.close();
  }
  await writeFile(new URL('artifacts/login-qr/chrome-results.json', root), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
