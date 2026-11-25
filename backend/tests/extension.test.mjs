import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionApi } from '../server/services/extension.js';
import { EXTENSION_ID } from '../../extension/identity.js';
const origin = `chrome-extension://${EXTENSION_ID}`;
function request(path, body, options = {}) {
  return new Request('https://surfare.vercel.app/api/extension', {
    method: 'POST', headers: { origin, 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify({ path, method: options.method || 'POST', body }),
  });
}
test('extension gateway accepts its exact origin, preserving local findings and hiding credentials', async () => {
  const response = await extensionApi(request('/api/detect', { kind: 'message', text: 'Send your OTP now or your account will be blocked.', online: false }), { OPENROUTER_API_KEY: 'private-test-key' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const data = await response.json();
  assert.equal(data.level, 'High risk');
  assert(!JSON.stringify(data).includes('private-test-key'));
});
test('foreign and lookalike extension origins cannot use the gateway', async () => {
  for (const foreign of ['https://evil.test', `${origin}.evil`, 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']) {
    const response = await extensionApi(request('/api/detect', {}, { headers: { origin: foreign } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const preflight = await extensionApi(new Request('https://surfare.test/api/extension', { method: 'OPTIONS', headers: { origin: `chrome-extension://${id}` } }), { EXTENSION_ALLOWED_IDS: id });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), `chrome-extension://${id}`);
});
test('service dispatch cannot fetch arbitrary URLs or bypass service consent', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw Error(); };
  for (const path of ['https://private.test/', '/api/feedback', '__proto__']) assert.equal((await extensionApi(request(path, {}), {}, fetcher)).status, 404);
  assert.equal((await extensionApi(request('/api/detect', { text: 'Hello', ai: true, consent: false }), {}, fetcher)).status, 400);
  assert.equal((await extensionApi(request('/api/image-detect', { consent: false }), {}, fetcher)).status, 400);
  assert.equal((await extensionApi(request('/api/surfy', { consent: false }), {}, fetcher)).status, 400);
  assert.equal(calls, 0);
});
test('Sightengine configuration and scores use the existing validated image service', async () => {
  const env = { SIGHTENGINE_API_USER: 'test-user', SIGHTENGINE_API_SECRET: 'test-secret' };
  const config = await (await extensionApi(request('/api/image-detect', null, { method: 'GET' }), env)).json();
  assert.equal(config.providerId, 'sightengine');
  assert.equal(config.configured, true);
  const response = await extensionApi(request('/api/image-detect', { image: 'data:image/jpeg;base64,/9j/2Q==', mode: 'origin', consent: true, provider: 'sightengine' }), env,
    async () => Response.json({ status: 'success', type: { ai_generated: 0.94 }, secret: 'must-not-leave' }));
  const data = await response.json();
  assert.equal(data.detection.aiGeneratedScore, 0.94);
  assert(!JSON.stringify(data).includes('must-not-leave'));
});
test('invalid methods, oversized inputs and retired URL lookups fail without providers', async () => {
  assert.equal((await extensionApi(request('/api/detect', null, { method: 'GET' }))).status, 405);
  assert.equal((await extensionApi(request('/api/check-url', { url: 'file:///private' }))).status, 404);
  assert.equal((await extensionApi(request('/api/detect', { text: 'x'.repeat(1050001) }))).status, 413);
  assert.equal((await extensionApi(new Request('https://surfare.test/api/extension', { method: 'POST', body: '{' }))).status, 400);
});
