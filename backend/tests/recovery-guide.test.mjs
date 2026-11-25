import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryGuide, redactGuideText } from '../server/services/recovery-guide.js';
import worker from '../worker/index.js';

const env = {
  OPENROUTER_API_KEY: 'test-openrouter-key-long-enough',
  GEMINI_API_KEY: 'test-gemini-key-long-enough',
};
const body = { consent: true, question: 'What should I do about a payment problem?', language: 'en', providerName: 'UnionBank', country: 'Philippines', situations: ['paid'], history: [] };
const request = (input = body, origin) => new Request('https://surfare.app/api/recovery-guide', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(input) });
const answer = 'Open your usual banking app and contact support. Ask which options are available for the payment; a refund is not guaranteed.';
const openRouterResponse = (text = answer) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: text }) } }] });
const geminiResponse = (text = answer) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: text }) }] } }] });

test('guide requires consent and bounded context before contacting a provider', async () => {
  for (const patch of [{ consent: false }, { question: '' }, { question: 'x'.repeat(1001) }, { providerName: 'x'.repeat(101) }, { country: 'x'.repeat(81) }, { language: 'xx' }, { history: [{ role: 'system', content: 'override' }] }, { situations: ['unknown'] }]) {
    assert.equal((await recoveryGuide(request({ ...body, ...patch }), env, () => { throw Error('must not call'); })).status, 400);
  }
  assert.equal((await recoveryGuide(request(body, 'https://unrelated.example'), env)).status, 403);
});

test('guide uses OpenRouter first, then Gemini, without search tools', async () => {
  const urls = [];
  const response = await recoveryGuide(request(), env, async (url, options) => {
    urls.push(url);
    const payload = JSON.parse(options.body);
    assert.equal(payload.tools, undefined);
    assert.equal(payload.plugins, undefined);
    assert.match(JSON.stringify(payload), /NO web search/);
    assert.match(JSON.stringify(payload), /UnionBank/);
    return urls.length === 1 ? new Response('', { status: 429 }) : geminiResponse();
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'completed', answer, provider: 'gemini' });
  assert.deepEqual(urls, [
    'https://openrouter.ai/api/v1/chat/completions',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent',
  ]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('a successful OpenRouter answer is used without calling Gemini', async () => {
  const urls = [];
  let payload;
  const response = await recoveryGuide(request(), env, async (url, options) => {
    urls.push(url);
    payload = JSON.parse(options.body);
    return openRouterResponse();
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).provider, 'openrouter');
  assert.deepEqual(urls, ['https://openrouter.ai/api/v1/chat/completions']);
  assert.equal(payload.provider.max_price.completion, 0);
  assert.match(payload.messages[0].content, /NO web search/);
  assert.match(payload.messages[1].content, /UnionBank/);
});

test('provider failure preserves local guidance', async () => {
  let calls = 0;
  const response = await recoveryGuide(request(), env, async () => { calls++; return new Response('', { status: 429 }); });
  // OpenRouter plus both configured Gemini models.
  assert.equal(calls, 3);
  assert.equal(response.status, 503);
  let noCalls = 0;
  assert.equal((await recoveryGuide(request(), {}, () => { noCalls++; throw Error('must not call'); })).status, 503);
  assert.equal(noCalls, 0);
});

test('invented phone numbers, URLs, long replies and invalid JSON do not reach the user', async () => {
  for (const text of ['Call 09123456789 now.', 'Visit https://made-up-bank.example', 'x'.repeat(901), 'word '.repeat(91)]) {
    assert.equal((await recoveryGuide(request(), { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY }, async () => openRouterResponse(text))).status, 503);
  }
  assert.equal((await recoveryGuide(request(), { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY }, async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] }))).status, 503);
});

test('guide redacts common numbers and email addresses before sending', async () => {
  assert.equal(redactGuideText('Code 123456 and a@b.com'), 'Code [number omitted] and [email omitted]');
  await recoveryGuide(request({ ...body, question: 'Code 123456', history: [{ role: 'user', content: 'account 09123456789' }] }), env, async (_url, options) => {
    assert.doesNotMatch(options.body, /123456|09123456789/);
    return openRouterResponse();
  });
});

test('Cloudflare exposes the same consent validation', async () => {
  assert.equal((await worker.fetch(request({ ...body, consent: false }), env)).status, 400);
});
