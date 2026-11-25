import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { isPublicQrAddress, validateQrTarget, createQrPublicTransport } from '../server/qr-public-transport.js';
import { qrResolve, resolveQrChain, MAX_QR_REDIRECTS } from '../server/services/qr-resolve.js';
import { describeQrPayload } from '../lib/qr-links.js';
import worker from '../worker/index.js';
import api from '../../api/qr-resolve.js';

test('private addresses, mapped IPs, unusual encodings and non-web targets are not fetchable', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.1.2', '127.0.0.1', '169.254.169.254', '172.16.0.1',
    '192.168.1.1', '192.0.2.1', '198.18.0.1', '203.0.113.1', '224.0.0.1', '::1', 'fe80::1', 'fc00::1',
    '::ffff:127.0.0.1', '64:ff9b::7f00:1', '2001:db8::1', '2002:7f00:1::', '3ffe::1', '3fff::1']) assert.equal(isPublicQrAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicQrAddress(address), true, address);
  for (const url of ['http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://[::ffff:127.0.0.1]/',
    'http://localhost/', 'https://router.local/', 'https://user:pass@public.com/', 'https://public.com:8080/',
    'https://public.com/?access_token=fictional', 'https://public.com/?code=fictional',
    'file:///private', 'https://example.com@127.0.0.1/'])
    assert.throws(() => validateQrTarget(url), /blocked_target/, url);
});

test('DNS results are all checked and the socket lookup is pinned to an approved IP', async () => {
  let dnsCalls = 0, connections = 0, pinned;
  const send = (_url, options, response) => {
    connections++;
    options.lookup('public.com', {}, (_error, address, family) => { pinned = { address, family }; });
    assert.equal(options.agent, false);
    assert.equal(options.autoSelectFamily, false);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.end = () => queueMicrotask(() => response({ statusCode: 200, headers: {}, destroy() {} }));
    return request;
  };
  const transport = createQrPublicTransport({ lookup: async () => { dnsCalls++; return [{ address: '8.8.8.8', family: 4 }]; }, requestHttps: send });
  assert.equal((await transport('https://public.com/', { signal: AbortSignal.timeout(1000) })).status, 200);
  assert.deepEqual(pinned, { address: '8.8.8.8', family: 4 });
  assert.equal(dnsCalls, 1);
  const unsafe = createQrPublicTransport({ lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], requestHttps: send });
  await assert.rejects(unsafe('https://public.com/', { signal: AbortSignal.timeout(1000) }), /blocked_target/);
  assert.equal(connections, 1);
});

test('every hop retains its URL, domain and local evidence, including a harmful final URL', async () => {
  const seen = [];
  const report = await resolveQrChain('https://bit.ly/authored-test', async url => {
    seen.push(url);
    return seen.length === 1 ? { status: 302, location: 'https://example.com/next' }
      : seen.length === 2 ? { status: 307, location: 'https://0-0sc.com/login' } : { status: 200 };
  });
  assert.equal(report.status, 'resolved');
  assert.equal(report.originalUrl, 'https://bit.ly/authored-test');
  assert.equal(report.finalDestination, 'https://0-0sc.com/login');
  assert.equal(report.redirectCount, 2);
  assert.deepEqual(report.chain.map(row => row.url), seen);
  assert.equal(report.chain[2].domain, '0-0sc.com');
  assert.equal(report.riskLevel, 'High risk');
  assert.ok(report.chain[2].indicators.some(item => item.id === 'dataset-url-match'));
});

test('a short link to Surfare is not suspicious just for using a shared shortening host', async () => {
  const short = 'https://bit.ly/surfare-example';
  const report = await resolveQrChain(short, async url => url === short
    ? { status: 302, location: 'https://surfare.vercel.app/' } : { status: 200 });
  assert.equal(report.status, 'resolved');
  assert.equal(report.finalDestination, 'https://surfare.vercel.app/');
  assert.equal(report.riskLevel, 'Insufficient evidence');
  assert.equal(report.score, 0);
  assert.ok(report.chain.every(row => !row.indicators.some(item => ['shortener', 'reported-gambling-link', 'dataset-url-match'].includes(item.id))));
});

test('a dangerous intermediate address still matters when the final address looks ordinary', async () => {
  const report = await resolveQrChain('https://bit.ly/intermediate-example', async url => url.includes('bit.ly')
    ? { status: 302, location: 'https://0-0sc.com/login' }
    : url.includes('0-0sc.com') ? { status: 302, location: 'https://surfare.vercel.app/' } : { status: 200 });
  assert.equal(report.status, 'resolved');
  assert.equal(report.riskLevel, 'High risk');
  assert.equal(report.chain[1].level, 'High risk');
});

test('an unexpanded shortener landing page does not count as revealing a final website', async () => {
  const report = await resolveQrChain('https://bit.ly/needs-browser', async () => ({ status: 200 }));
  assert.equal(report.status, 'unresolved');
  assert.equal(report.reason, 'hidden_destination');
  assert.equal(report.finalDestination, null);
  assert.equal(report.riskLevel, 'Insufficient evidence');
});

test('loops, excessive redirects, missing targets, HTTP errors and timeouts stay unresolved', async () => {
  const initial = 'https://example.com/start';
  for (const [transport, reason] of [
    [async () => ({ status: 301, location: initial }), 'redirect_loop'],
    [async url => ({ status: 302, location: url + '/more' }), 'redirect_limit'],
    [async () => ({ status: 302 }), 'missing_location'],
    [async () => ({ status: 302, location: 'javascript:alert(1)' }), 'blocked_target'],
    [async () => ({ status: 403 }), 'http_error'],
    [async () => { throw new DOMException('timeout', 'TimeoutError'); }, 'timeout'],
    [async () => { throw Error('network'); }, 'network'],
  ]) {
    const report = await resolveQrChain(initial, transport);
    assert.equal(report.status, 'unresolved'); assert.equal(report.reason, reason);
    assert.equal(report.finalDestination, null); assert.ok(report.chain.length <= MAX_QR_REDIRECTS + 2);
    assert.notEqual(report.riskLevel, 'Low risk');
  }
});

test('a public redirect to a private target is blocked before a second connection', async () => {
  let connections = 0;
  const transport = async url => {
    validateQrTarget(url); connections++;
    return { status: 302, location: 'http://169.254.169.254/latest/meta-data/' };
  };
  const report = await resolveQrChain('https://public.com/', transport);
  assert.equal(report.status, 'unresolved'); assert.equal(report.reason, 'blocked_target');
  assert.equal(connections, 1); assert.equal(report.chain[1].visited, false);
});

test('HEAD refusal gets a bounded GET; relative destinations retain the original address', async () => {
  const calls = [];
  const report = await resolveQrChain('https://example.com/start', async (url, options) => {
    calls.push([url, options.method]);
    if (calls.length === 1) return { status: 405 };
    if (calls.length === 2) return { status: 302, location: '/end' };
    return { status: 200 };
  });
  assert.equal(report.finalDestination, 'https://example.com/end');
  assert.deepEqual(calls.map(call => call[1]), ['HEAD', 'GET', 'HEAD']);
});

test('QR payload typing keeps private records and access tokens local', () => {
  assert.equal(describeQrPayload('Meeting tomorrow').type, 'text');
  assert.equal(describeQrPayload('Note: meeting tomorrow').type, 'text');
  assert.equal(describeQrPayload('WIFI:T:WPA;S:demo;P:secret;;').type, 'private');
  assert.equal(describeQrPayload('mailto:demo@example.com').type, 'private');
  assert.equal(describeQrPayload('https://bit.ly/demo').urlType, 'shortened');
  assert.equal(describeQrPayload('https://public.com/?access_token=secret').blocked, true);
});

test('the API requires consent, bounded input and a same-origin request before resolving', async () => {
  let calls = 0;
  const transport = async () => { calls++; return { status: 200 }; };
  const request = (body, origin = 'https://surfare.test') => new Request('https://surfare.test/api/qr-resolve', {
    method: 'POST', headers: { origin }, body: JSON.stringify(body),
  });
  assert.equal((await qrResolve(request({ url: 'https://public.com/' }), {}, transport)).status, 400);
  assert.equal((await qrResolve(request({ url: 'https://public.com/', consent: true }, 'https://other.test'), {}, transport)).status, 403);
  for (const url of ['WIFI:T:WPA;S:demo;', 'http://127.0.0.1/', 'https://public.com/?token=secret'])
    assert.equal((await qrResolve(request({ url, consent: true }), {}, transport)).status, 400);
  assert.equal(calls, 0);
  const response = await qrResolve(request({ url: 'https://public.com/', consent: true }), {}, transport);
  assert.equal((await response.json()).status, 'resolved'); assert.equal(calls, 1);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await worker.fetch(request({ url: 'https://public.com/', consent: true }), {})).status, 503);
});

test('the Vercel adapter validates consent before opening any connection', async () => {
  const result = { statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await api({ method: 'POST', url: '/api/qr-resolve', headers: { host: 'surfare.test' }, body: { url: 'https://public.com/' } }, result);
  assert.equal(result.statusCode, 400);
});


test('destination request throttling stops excess requests before contacting the target', async () => {
  let calls = 0;
  const request = () => new Request('https://surfare.test/api/qr-resolve', { method: 'POST',
    headers: { 'x-real-ip': 'rate-limit-fixture' }, body: JSON.stringify({ url: 'https://public.com/', consent: true }) });
  for (let count = 0; count < 15; count++) {
    const response = await qrResolve(request(), {}, async () => { calls++; return { status: 200 }; });
    assert.equal(response.status, 200);
  }
  const rejected = await qrResolve(request(), {}, async () => { calls++; return { status: 200 }; });
  assert.equal(rejected.status, 429);
  assert.equal((await rejected.json()).reason, 'rate_limit');
  assert.equal(calls, 15);
});
