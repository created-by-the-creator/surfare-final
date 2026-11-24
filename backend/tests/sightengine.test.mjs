import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAiGeneratedScore } from '../lib/sightengine-assessment.js';
import { imageDetect } from '../server/services/image-detect.js';
import worker from '../worker/index.js';
import vercel from '../../api/image-detect.js';

const env = { SIGHTENGINE_API_USER: 'test-sightengine-user', SIGHTENGINE_API_SECRET: 'test-sightengine-secret' };
const image = 'data:image/jpeg;base64,/9j/2Q==';
const request = (changes = {}, origin = 'https://surfare.test') => new Request('https://surfare.test/api/image-detect', {
  method: 'POST', headers: { 'Content-Type': 'application/json', origin },
  body: JSON.stringify({ image, mode: 'origin', consent: true, provider: 'sightengine', ...changes }),
});
const scoreResponse = (score) => Response.json({ status: 'success', type: { ai_generated: score },
  media: { uri: 'private filename', id: 'private media ID' }, secret: env.SIGHTENGINE_API_SECRET });

test('Sightengine requires both credentials and never exposes them in configuration', async () => {
  for (const settings of [{}, { SIGHTENGINE_API_USER: env.SIGHTENGINE_API_USER }, { SIGHTENGINE_API_SECRET: env.SIGHTENGINE_API_SECRET }]) {
    const data = await (await imageDetect(new Request('https://surfare.test/api/image-detect'), settings)).json();
    assert.equal(data.configured, false);
  }
  const response = await imageDetect(new Request('https://surfare.test/api/image-detect'), env);
  assert.deepEqual(await response.json(), { configured: true, provider: 'Sightengine', providerId: 'sightengine', model: 'genai' });
});

test('Sightengine uploads one generic JPEG using multipart fields and a fixed HTTPS endpoint', async () => {
  let calls = 0;
  const response = await imageDetect(request({ detection: { aiGeneratedScore: 0 } }), env, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.sightengine.com/1.0/check.json');
    assert.equal(options.method, 'POST');
    assert(options.body instanceof FormData);
    assert.equal(options.body.get('models'), 'genai');
    assert.equal(options.body.get('api_user'), env.SIGHTENGINE_API_USER);
    assert.equal(options.body.get('api_secret'), env.SIGHTENGINE_API_SECRET);
    const media = options.body.get('media');
    assert.equal(media.name, 'image.jpg');
    assert.equal(media.type, 'image/jpeg');
    assert.equal(new Uint8Array(await media.arrayBuffer())[0], 255);
    assert.equal(options.body.get('url'), null);
    return scoreResponse(0.96);
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.detection, { aiGeneratedScore: 0.96, band: 'high' });
  assert.equal(calls, 1);
  for (const secret of [...Object.values(env), 'private filename', 'private media ID']) assert(!JSON.stringify(data).includes(secret));
});

test('image consent, origins, mode, provider, data URLs and request size are validated before sending', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw Error(); };
  for (const [changes, origin, status] of [
    [{ consent: false }, 'https://surfare.test', 400],
    [{}, 'https://evil.test', 403],
    [{}, 'http://localhost:5173', 403],
    [{ provider: 'openrouter' }, 'https://surfare.test', 409],
    [{ mode: 'content' }, 'https://surfare.test', 400],
    [{ image: 'https://private.test/image.jpg' }, 'https://surfare.test', 400],
    [{ image: 'data:image/jpeg;base64,not-image' }, 'https://surfare.test', 400],
    [{ image: image + 'x'.repeat(1100000) }, 'https://surfare.test', 413],
  ]) assert.equal((await imageDetect(request(changes, origin), env, fetcher)).status, status);
  assert.equal(calls, 0);
});

test('local proxy and explicitly configured origins can use image detection', async () => {
  const local = new Request('http://127.0.0.1:8790/api/image-detect', {
    method: 'POST', headers: { origin: 'http://localhost:5173' }, body: await request().text(),
  });
  assert.equal((await imageDetect(local, env, async () => scoreResponse(0.1))).status, 200);
  assert.equal((await imageDetect(request({}, 'https://preview.surfare.test'), {
    ...env, IMAGE_ALLOWED_ORIGINS: 'https://preview.surfare.test',
  }, async () => scoreResponse(0.1))).status, 200);
});

test('uncertain and missing scores never become a low-signal completed check', async () => {
  for (const [score, band] of [[0, 'low'], [0.2, 'low'], [0.2001, 'uncertain'], [0.5, 'uncertain'], [0.7999, 'uncertain'], [0.8, 'high'], [1, 'high']]) {
    assert.equal(classifyAiGeneratedScore(score), band);
    const data = await (await imageDetect(request(), env, async () => scoreResponse(score))).json();
    assert.equal(data.detection.band, band);
  }
  for (const score of [null, undefined, '0.01', -0.1, 1.1]) {
    const response = await imageDetect(request(), env, async () => scoreResponse(score));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).status, 'unavailable');
  }
});

test('quota, credentials, media errors and timeouts preserve unavailable status without retries', async () => {
  for (const [http, type, reason] of [[429, 'usage_limit', 'quota'], [401, 'credentials_error', 'credentials'],
    [400, 'media_error', 'unsupported_image'], [500, 'internal_error', 'provider_error']]) {
    let calls = 0;
    const response = await imageDetect(request(), env, async () => {
      calls++;
      return Response.json({ status: 'failure', error: { type, message: 'private account details' } }, { status: http });
    });
    const data = await response.json();
    assert.deepEqual(data, { status: 'unavailable', reason });
    assert.equal(calls, 1);
  }
  const timedOut = await imageDetect(request(), env, async () => { throw new DOMException('Timeout', 'TimeoutError'); });
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).reason, 'timeout');
});

test('Cloudflare and the root Vercel adapter expose Sightengine configuration without secrets', async () => {
  assert.equal((await (await worker.fetch(new Request('https://surfare.test/api/image-detect'), env)).json()).providerId, 'sightengine');
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const response = { statusCode: 200, setHeader() {}, end(text) { this.body = JSON.parse(text); } };
  try {
    await vercel({ method: 'GET', url: '/api/image-detect', headers: { host: 'surfare.test' } }, response);
    assert.equal(response.body.configured, true);
    for (const secret of Object.values(env)) assert(!JSON.stringify(response.body).includes(secret));
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
