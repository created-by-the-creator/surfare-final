import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { checkContent, assessContent } from '../index.js';
import { createDetectorServer } from '../server/local.js';
import { verifyUrls, checkUrl } from '../server/services/reputation.js';
import worker from '../worker/index.js';
import { assessDatasets } from '../lib/dataset-assessment.js';

const threat = 'tanginamo pare yang kapatid mo na yan di pako binabayaran, pag ako nainis tanggal ang ulo nya';
const normal = 'Our meeting is tomorrow afternoon.';
const noFetch = () => { throw Error('Unexpected network request'); };

test('dataset assessment matches labeled text and URL records', () => {
  const textMatch = assessDatasets(
    'papalduhin kita ng 12k ngayon basta ikaw na bahala sakin ah reply sa fb YES ako bahala sa winning games mo',
  );
  assert.equal(textMatch?.risk, 'high');
  assert.equal(textMatch.intent, 'Gambling Scam');

  const urlMatch = assessDatasets('Check this address.', [
    'http://www.teramill.com',
  ]);
  assert.equal(urlMatch?.risk, 'high');
  assert.equal(urlMatch.kind, 'url');

  const checked = assessContent({
    text: 'Check this address: http://www.teramill.com',
    urls: ['http://www.teramill.com'],
  });
  const match = checked.indicators.find((indicator) => indicator.id === 'dataset-url-match');
  assert.equal(match?.evidence[0]?.text, 'http://www.teramill.com');
});

test('a changed greeting does not hide a known scam template', () => {
  const match = assessDatasets(
    'Hi Kai, Dito nagsisimula ang saya at panalo! 8P FREE + 8888P welcome package + bonus. USE 716120 at  BangoWin.com',
  );
  assert.equal(match?.risk, 'high');
});

test('address reference lists produce grounded warnings with exact evidence', () => {
  const cases = [
    {
      text: 'Open https://0-0sc.com/login now',
      id: 'dataset-url-match',
      needle: 'https://0-0sc.com/login',
    },
    {
      text: 'Play at https://apintoto.com now',
      id: 'reported-gambling-link',
      needle: 'https://apintoto.com',
    },
    {
      text: 'Verify at https://validator.pagcor-licence.ph now',
      id: 'fake-regulator-link',
      needle: 'https://validator.pagcor-licence.ph',
    },
    {
      text: 'The CashAB app says to install it.',
      id: 'stopped-lender',
      needle: 'CashAB',
    },
  ];

  for (const { text, id, needle } of cases) {
    const checked = assessContent({ text });
    const indicator = checked.indicators.find((item) => item.id === id);
    assert.ok(indicator, `${id} should be present for ${text}`);
    assert.equal(indicator.weight, 5);
    assert.equal(checked.level, 'High risk');
    const start = text.indexOf(needle);
    const evidence = indicator.evidence[0];
    assert.equal(evidence.start, start);
    assert.equal(evidence.end, start + needle.length);
    assert.equal(evidence.text, needle);
    assert.equal(text.slice(evidence.start, evidence.end), needle);
  }

  const notLender = assessContent({ text: 'CashABC is a game.' });
  assert.equal(notLender.indicators.some((indicator) => indicator.id === 'stopped-lender'), false);
});

test('default and offline checks require no network or provider keys', async () => {
  const result = await checkContent({ text: threat }, { fetcher: noFetch });
  assert.equal(result.assessment.level, assessContent({ text: threat }).level);
  const offline = await checkContent({ text: normal }, {
    ai: true, reputation: true, provider: 'openrouter', online: false, fetcher: noFetch,
  });
  assert.equal(offline.assessment.level, 'Low risk');
  assert.equal(offline.semantic.status, 'not_checked');
});

test('strong local threats skip AI even when online review is selected', async () => {
  const result = await checkContent({ text: threat }, { ai: true, provider: 'openrouter', fetcher: noFetch });
  assert.equal(result.assessment.level, 'High risk');
  assert.equal(result.semantic.status, 'not_checked');
});

test('explicit AI selection forwards the disclosed provider and validates merged meaning', async () => {
  let calls = 0;
  const result = await checkContent({ text: normal }, {
    ai: true, provider: 'openrouter',
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, '/api/assess');
      assert.deepEqual(JSON.parse(options.body), { text: normal, kind: 'message', consent: true, provider: 'openrouter' });
      return Response.json({ status: 'completed', analysis: {
        level: 'Low risk', summary: 'An ordinary meeting reminder.', recommendation: 'Confirm through a known contact if unsure.', findings: [],
      } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.assessment.level, 'Low risk');
});

test('invalid provider output and network failure preserve the local no-warning verdict', async () => {
  for (const fetcher of [async () => { throw Error('Offline'); }, async () => Response.json({ status: 'completed', analysis: {} })]) {
    const result = await checkContent({ text: normal }, { ai: true, provider: 'openrouter', fetcher });
    assert.equal(result.assessment.level, 'Low risk');
    assert.equal(result.assessment.semanticStatus, 'unavailable');
  }
});

test('legacy reputation option makes no request and preserves local findings', async () => {
  const result = await checkContent({ text: 'https://example.com/', kind: 'link' }, {
    reputation: true, fetcher: async () => { throw Error('must not request'); },
  });
  assert.equal(result.verification, null);
  assert.equal(result.assessment.level, 'Insufficient evidence');
});

test('retired URL lookup helpers never invoke a fetcher', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw Error(); };
  const env = { GOOGLE_SAFE_BROWSING_API_KEY: 'test-key' };
  const report = await verifyUrls(['https://example.com/'], env, fetcher);
  assert.equal(report.status, 410);
  const response = await checkUrl(new Request('http://localhost/api/check-url', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/' }) }), env, fetcher);
  assert.equal(response.status, 410);
  assert.equal(calls, 0);
});

test('image upload helper requires explicit consent before accessing canvas or network', async () => {
  const { imageRequest } = await import('../browser.js');
  await assert.rejects(imageRequest(null, 'openrouter', 'origin'), /Opt in/);
});

test('API-only Worker routes local detection and returns 404 without static assets', async () => {
  const request = new Request('https://surfare.example/api/detect', {
    method: 'POST', body: JSON.stringify({ text: threat }),
  });
  assert.equal((await (await worker.fetch(request, {})).json()).level, 'High risk');
  assert.equal((await worker.fetch(new Request('https://surfare.example/'), {})).status, 404);
});

test('standalone HTTP server validates local input and keeps provider services separate', async () => {
  // No provider keys are used by this integration test.
  const server = createDetectorServer(() => ({}));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok' });
    const post = (body, headers = {}) => fetch(base + '/api/detect', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const response = await post({ text: threat }, { origin: base });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).level, 'High risk');
    const forged = await post({ text: normal, verification: { status: 'completed', results: [{ threats: ['MALWARE'] }] } });
    assert.equal((await forged.json()).level, 'Low risk');
    const unverified = await (await post({ text: 'Open https://paypa1.com/login now', online: true }, { origin: base })).json();
    assert.equal(unverified.onlineVerification, undefined);
    assert.ok(unverified.indicators.some((indicator) => /^lookalike[-_]/.test(indicator.id)));
    assert.equal((await post({ text: threat }, { origin: 'https://other.example' })).status, 403);
    assert.equal((await post({ text: '' })).status, 400);
    assert.equal((await post({ text: 'x'.repeat(12001) })).status, 400);
    assert.equal((await post({ text: threat, uncertain: 'false' })).status, 400);
    assert.equal((await post({ text: threat, urls: ['x'.repeat(61000)] })).status, 413);
    assert.equal((await fetch(base + '/api/verify')).status, 410);
    assert.equal((await (await fetch(base + '/api/verify')).json()).configured, false);
    const urlCheck = await fetch(base + '/api/check-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/' }),
    });
    assert.equal(urlCheck.status, 410);
    assert.equal((await urlCheck.json()).unavailable, true);
    const ai = await fetch(base + '/api/assess', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normal, kind: 'message', consent: true, provider: 'openrouter' }),
    });
    assert.equal(ai.status, 503);
    assert.equal((await fetch(base + '/missing')).status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
