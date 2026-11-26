import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWithBackup } from '../server/services/ai-generation.js';
import { validateSemanticResult } from '../lib/semantic-assessment.js';
import { semanticSchema } from '../server/services/semantic.js';
import { detect } from '../server/services/detect.js';
import { DETECTOR_AI_TIMEOUT_MS, DETECTOR_AI_CLIENT_TIMEOUT_MS } from '../lib/ai-timing.js';

const env = { OPENROUTER_API_KEY: 'test-openrouter-key-only', GEMINI_API_KEY: 'test-gemini-key-only' };
const text = 'Send your OTP now';
const value = { level: 'High risk', summary: 'Warning', recommendation: 'Keep codes private.', findings: [
  { kind: 'personal', level: 'High risk', quote: 'Send your OTP', explanation: 'Requests a private code.' },
] };
const generated = content => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });
const options = { env, instruction: 'Check the message.', input: text, schema: semanticSchema, timeoutMs: 40000,
  validate: result => validateSemanticResult(result, text) };

for (const provider of ['openrouter', 'gemini']) {
  for (const failure of ['network', 500]) {
    test(`${provider} recovers from a temporary ${failure} failure within the same deadline`, async () => {
      const signals = [];
      const result = await generateWithBackup({ ...options,
        env: provider === 'gemini' ? { GEMINI_API_KEY: env.GEMINI_API_KEY } : env,
        fetcher: async (_url, request) => {
          signals.push(request.signal);
          if (signals.length === 1) {
            if (failure === 'network') throw new TypeError('fetch failed');
            return Response.json({}, { status: failure });
          }
          return provider === 'openrouter' ? generated(value) : Response.json({ candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } },
          ] });
        },
      });
      assert.equal(result.status, 'completed');
      assert.equal(result.provider, provider);
      assert.equal(signals.length, 2);
      assert.equal(signals[0], signals[1]);
    });
  }
}

test('invalid evidence gets one fresh attempt and must still pass validation', async () => {
  let calls = 0;
  const result = await generateWithBackup({ ...options, fetcher: async () => {
    calls++;
    return generated(calls === 1 ? { ...value, findings: [{ ...value.findings[0], quote: 'invented words' }] } : value);
  } });
  assert.equal(result.status, 'completed');
  assert.equal(calls, 2);
});

test('the primary gets 20 seconds and leaves time for both backups', async t => {
  let now = 0;
  const timeouts = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(AbortSignal, 'timeout', ms => {
    timeouts.push(ms);
    return new AbortController().signal;
  });
  let calls = 0;
  const result = await generateWithBackup({ ...options, fetcher: async () => {
    calls++;
    if (calls === 1) {
      now += 20000;
      throw new DOMException('Timed out', 'TimeoutError');
    }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
  } });
  assert.equal(result.status, 'completed');
  assert.equal(result.provider, 'gemini');
  assert.deepEqual(timeouts, [20000, 10000]);
});

test('malformed JSON is retried once, then falls back to a validated backup', async () => {
  const urls = [];
  const result = await generateWithBackup({ ...options, fetcher: async url => {
    urls.push(url);
    return urls.length <= 2 ? Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{' } }] })
      : Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
  } });
  assert.equal(result.status, 'completed');
  assert.equal(result.provider, 'gemini');
  assert.equal(urls.length, 3);
});

test('persistent failures are bounded and never reported as completed', async () => {
  let calls = 0;
  const result = await generateWithBackup({ ...options, fetcher: async () => {
    calls++;
    return generated({ ...value, findings: [{ ...value.findings[0], quote: 'invented words' }] });
  } });
  assert.equal(result.status, 'unavailable');
  // Two invalid OpenRouter responses, then one incompatible response per Gemini model.
  assert.equal(calls, 4);
});

const geminiGenerated = content => Response.json({ candidates: [
  { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(content) }] } },
] });
const waitForCancellation = signal => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

test('a quick primary completes without sending text to a backup', async () => {
  const urls = [];
  const result = await generateWithBackup({ ...options, hedgeAfterMs: 100, fetcher: async url => {
    urls.push(url);
    return generated(value);
  } });
  assert.equal(result.provider, 'openrouter');
  assert.equal(urls.length, 1);
});

test('a fast validated backup finishes while the primary is still pending and cancels it', async () => {
  const urls = [];
  let primarySignal;
  const result = await generateWithBackup({ ...options, hedgeAfterMs: 5, fetcher: async (url, request) => {
    urls.push(url);
    if (url.includes('openrouter.ai')) {
      primarySignal = request.signal;
      return waitForCancellation(primarySignal);
    }
    return geminiGenerated(value);
  } });
  assert.equal(result.status, 'completed');
  assert.equal(result.provider, 'gemini');
  assert.equal(urls.length, 2);
  assert.match(urls[0], /openrouter.ai/);
  assert.match(urls[1], /gemini-3.5-flash-lite/);
  assert.equal(primarySignal.aborted, true);
});

test('the primary can still win after a slower backup starts and cancels the backup', async () => {
  let finishPrimary, backupSignal;
  const result = await generateWithBackup({ ...options, hedgeAfterMs: 5, fetcher: async (url, request) => {
    if (url.includes('openrouter.ai')) return new Promise(resolve => { finishPrimary = resolve; });
    backupSignal = request.signal;
    finishPrimary(generated(value));
    return waitForCancellation(backupSignal);
  } });
  assert.equal(result.provider, 'openrouter');
  assert.equal(backupSignal.aborted, true);
});

test('a fast backup still has to pass evidence validation', async () => {
  let primarySignal, backups = 0;
  const result = await generateWithBackup({ ...options, hedgeAfterMs: 5, fetcher: async (url, request) => {
    if (url.includes('openrouter.ai')) {
      primarySignal = request.signal;
      return waitForCancellation(primarySignal);
    }
    backups++;
    return geminiGenerated(backups === 1 ? { ...value, findings: [{ ...value.findings[0], quote: 'invented words' }] } : value);
  } });
  assert.equal(result.provider, 'gemini');
  assert.equal(backups, 2);
  assert.equal(primarySignal.aborted, true);
  assert.equal(result.value.findings[0].quote, 'Send your OTP');
});

test('a failed primary starts its backup immediately', async () => {
  const urls = [];
  const result = await generateWithBackup({ ...options, hedgeAfterMs: 60000, fetcher: async url => {
    urls.push(url);
    return url.includes('openrouter.ai') ? Response.json({}, { status: 429 }) : geminiGenerated(value);
  } });
  assert.equal(result.provider, 'gemini');
  assert.equal(urls.length, 2);
});

test('racing providers still reports unavailable when all providers fail', async () => {
  let calls = 0;
  const result = await generateWithBackup({ ...options, hedgeAfterMs: 5, fetcher: async () => {
    calls++;
    return Response.json({}, { status: 429 });
  } });
  assert.equal(result.status, 'unavailable');
  assert.equal(calls, 3);
});

test('failed backups leave a working primary running until its valid result arrives', async () => {
  let finishPrimary, primarySignal, backups = 0, finished = false;
  let notifyBackups;
  const backupsDone = new Promise(resolve => { notifyBackups = resolve; });
  const pending = generateWithBackup({ ...options, hedgeAfterMs: 5, fetcher: async (url, request) => {
    if (url.includes('openrouter.ai')) {
      primarySignal = request.signal;
      return new Promise(resolve => { finishPrimary = resolve; });
    }
    assert.equal(primarySignal.aborted, false);
    if (++backups === 2) notifyBackups();
    return Response.json({}, { status: 429 });
  } }).then(result => { finished = true; return result; });
  await backupsDone;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  assert.equal(primarySignal.aborted, false);
  finishPrimary(generated(value));
  assert.equal((await pending).provider, 'openrouter');
});

test('a detector can finish after the old 45-second cutoff without losing its working primary', async t => {
  let now = 0, finishPrimary, primarySignal;
  const timeouts = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(AbortSignal, 'timeout', ms => {
    timeouts.push(ms);
    return new AbortController().signal;
  });
  const request = new Request('https://surfare.test/api/detect', {
    method: 'POST', body: JSON.stringify({ text, kind: 'message', ai: true, consent: true }),
  });
  const response = await detect(request, env, async (url, options) => {
    if (url.includes('openrouter.ai')) {
      primarySignal = options.signal;
      return new Promise(resolve => { finishPrimary = resolve; });
    }
    // Simulate a slow provider without making the test wait 46 seconds.
    now = 46000;
    assert.equal(primarySignal.aborted, false);
    finishPrimary(generated(value));
    return Response.json({}, { status: 429 });
  });
  const result = await response.json();
  assert.equal(result.aiReview.status, 'completed');
  assert.equal(result.aiReview.provider, 'openrouter');
  assert.equal(timeouts[0], DETECTOR_AI_TIMEOUT_MS);
  // The first backup gets the full remaining deadline rather than a
  // shortened fraction of the budget to reserve another backup.
  assert.equal(timeouts[1], DETECTOR_AI_TIMEOUT_MS);
  assert.ok(DETECTOR_AI_CLIENT_TIMEOUT_MS > DETECTOR_AI_TIMEOUT_MS);
});
