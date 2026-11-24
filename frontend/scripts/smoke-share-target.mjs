// Run against a production preview (the dev server does not install the PWA worker).
// Exercises the real service worker, multipart transport, IndexedDB and app receipt.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.SURFARE_SHARE_BASE_URL || 'http://127.0.0.1:4173';
const output = path.join(root, 'artifacts/share-target');
await mkdir(output, { recursive: true });
const fixture = await readFile(path.join(root, 'backend/tests/fixtures/ocr/screenshot.png'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const records = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [], calls = [], workerResponses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(request.url()); });
  page.on('response', response => { if (new URL(response.url()).pathname === '/share-target/') workerResponses.push(response.fromServiceWorker()); });
  await page.addInitScript(version => {
    localStorage.setItem('surfare-welcome-seen', 'true');
    localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
    localStorage.setItem('surfare:offline-pack-autocache', JSON.stringify({ completed: true }));
    sessionStorage.setItem('surfare-ai-opt-in', 'false');
    const originalCreate = URL.createObjectURL.bind(URL);
    window.__previewFiles = [];
    URL.createObjectURL = blob => { window.__previewFiles.push(blob); return originalCreate(blob); };
  }, NOTICE_VERSION);
  await page.goto(base);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const manifest = await (await page.request.get(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.share_target.method, 'POST');
  assert.equal(manifest.share_target.enctype, 'multipart/form-data');
  assert(manifest.share_target.params.files[0].accept.includes('image/png'));

  async function submit(fields = {}, files = []) {
    const receipt = page.waitForRequest(request => {
      const url = new URL(request.url());
      return request.isNavigationRequest() && request.method() === 'GET' && (url.searchParams.has('shared') || url.searchParams.has('shareError'));
    });
    const [, request] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }), receipt,
      page.evaluate(({ fields, files }) => {
        const form = document.createElement('form');
        form.method = 'POST'; form.action = '/share-target/'; form.enctype = 'multipart/form-data';
        for (const [key, value] of Object.entries(fields)) {
          const input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = value; form.append(input);
        }
        if (files.length) {
          const transfer = new DataTransfer();
          for (const file of files) {
            const bytes = file.size ? new Uint8Array(file.size) : Uint8Array.from(atob(file.base64), char => char.charCodeAt(0));
            transfer.items.add(new File([bytes], file.name, { type: file.type }));
          }
          const input = document.createElement('input'); input.type = 'file'; input.name = 'images'; input.multiple = true; input.files = transfer.files; form.append(input);
        }
        document.body.append(form); form.submit();
      }, { fields, files }),
    ]);
    return request.url();
  }
  async function queue(fields = {}) {
    return page.evaluate(async ({ fields, files }) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.set(key, value);
      for (const file of files) {
        const bytes = file.size ? new Uint8Array(file.size) : Uint8Array.from(atob(file.base64), char => char.charCodeAt(0));
        form.append('images', new File([bytes], file.name, { type: file.type }));
      }
      const response = await fetch('/share-target/', { method: 'POST', body: form });
      if (!response.ok) throw Error(`Share response ${response.status}`);
      // A cached Response may expose its original cache URL to fetch(). Read
      // the test-owned queued receipt rather than treating that as navigation.
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('surfare-shares-v1', 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('incoming', 'readonly');
          const query = transaction.objectStore('incoming').getAll();
          query.onsuccess = () => {
            const record = query.result.find(item => item.text === fields.text);
            database.close();
            if (record) resolve(new URL(`/?shared=${record.id}`, location.origin).href);
            else reject(Error('Missing queued receipt'));
          };
        };
      });
    }, { fields, files: [] });
  }
  async function ready(notice) {
    await page.waitForFunction(() => document.querySelector('.share-received') && [...document.querySelectorAll('[role="tab"]')].some(button => !button.disabled));
    const actual = await page.locator('.share-received').innerText();
    assert(actual.includes(notice), `Expected "${notice}", received "${actual}"`);
    assert.equal(new URL(page.url()).search, '');
    assert.equal(await page.locator('.result-actions').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  async function arrive(url, notice) { await page.goto(url); await ready(notice); }
  // A real form navigation models the POST the Android share picker sends.
  const message = 'GCash: Ipadala ang OTP ngayon para hindi ma-block ang account.';
  await submit({ text: message });
  await page.locator('.share-received').filter({ hasText: 'Message added' }).waitFor();
  assert.equal(await page.locator('.tab-panel textarea').inputValue(), message);
  assert.equal(new URL(page.url()).search, '');
  assert.equal(calls.length, 0);
  records.push({ share: 'multipart navigation: message', prefilled: true, automaticApiCalls: calls.length });

  const link = 'https://gcash.login-example.xyz/verify';
  const url = await submit({ text: link, title: 'A page shared from another app' });
  assert(!url.includes('gcash'));
  await ready('Link added');
  assert.equal(await page.getByRole('tab').nth(1).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.tab-panel textarea').inputValue(), link);
  await arrive(url, 'no longer available');
  records.push({ share: 'Android text-field URL', correctDetector: 'links', singleUse: true });

  await submit({ text: 'Claim your prize now.', url: link });
  await ready('Message added');
  assert.equal(await page.getByRole('tab').nth(0).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.tab-panel textarea').inputValue(), `Claim your prize now.\n${link}`);

  await context.setOffline(true);
  const image = { name: 'shared-screenshot.png', type: 'image/png', base64: fixture.toString('base64') };
  await submit({}, [image]);
  await page.locator('.image-mode-dialog[open]').waitFor();
  await page.locator('.image-mode-confirm').click();
  await page.locator('.share-received').filter({ hasText: 'Image added' }).waitFor();
  assert.equal(await page.getByRole('tab').nth(2).getAttribute('aria-selected'), 'true');
  const hash = await page.evaluate(async () => {
    const bytes = await window.__previewFiles.at(-1).arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  });
  assert.equal(hash, createHash('sha256').update(fixture).digest('hex'));
  assert.equal(calls.length, 0);
  await page.locator('.share-received').screenshot({ path: path.join(output, 'image-offline.png') });
  records.push({ share: 'offline image', originalBytesPreserved: true, automaticApiCalls: calls.length });

  for (const [fields, files, text] of [
    [{}, [], 'Nothing came through'],
    [{ text: 'x'.repeat(12001) }, [], 'too long'],
    [{}, [image, image], 'one image at a time'],
    [{}, [{ name: 'file.txt', type: 'text/plain', base64: 'dGV4dA==' }], 'JPG, PNG or WebP'],
    [{}, [{ name: 'big.png', type: 'image/png', size: 9 * 1024 * 1024 }], 'too large'],
  ]) { await submit(fields, files); await ready(text); }
  records.push({ share: 'invalid, empty, multiple and oversized items', result: 'clear error; no check started' });

  for (const [lang, notice] of [['tl', 'Nagdagdag na ng mensahe'], ['taglish', 'Added na ang message']]) {
    await page.evaluate(language => localStorage.setItem('surfare-language', language), lang);
    await submit({ text: 'Isang mensahe na ibinahagi.' });
    await ready(notice);
  }
  await page.evaluate(() => localStorage.setItem('surfare-language', 'en'));

  const staleUrl = await queue({ text: 'An expired shared message' });
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('surfare-shares-v1', 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('incoming', 'readwrite');
        const store = transaction.objectStore('incoming');
        const cursor = store.openCursor();
        cursor.onsuccess = () => { const entry = cursor.result; if (entry) { entry.update({ ...entry.value, createdAt: 0 }); entry.continue(); } };
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = reject;
      };
    });
  });
  await arrive(staleUrl, 'no longer available');
  const waiting = [];
  for (let index = 0; index < 4; index++) waiting.push(await queue({ text: `Pending share ${index}` }));
  await arrive(waiting[0], 'no longer available');
  await arrive(waiting[3], 'Message added');
  records.push({ share: 'expired and queued receipts', expiredRejected: true, queueBounded: true });

  assert(workerResponses.length > 0 && workerResponses.every(Boolean));
  assert.equal(calls.length, 0);
  assert.deepEqual(errors, []);
  await context.setOffline(false);
  await writeFile(path.join(output, 'smoke.json'), JSON.stringify({ checkedAt: new Date().toISOString(), records }, null, 2));
  console.log(JSON.stringify(records, null, 2));
} finally { await browser.close(); }
