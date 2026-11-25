import test from 'node:test';
import assert from 'node:assert/strict';
import { domainToUnicode } from 'node:url';
import { unicodeHost, hostSkeleton, decodeUrlComponent } from '../lib/url-identity.js';
import { urlCandidates, normalizeUrl, redirectDestinations } from '../lib/url-input.js';
import { analyzePatterns, analyzeUrl } from '../lib/pattern-detection.js';

test('browser-safe punycode decoder agrees with Node on multilingual host labels', () => {
  for (const label of ['раураl', 'gсash', 'fасеbооk', 'mаyа', 'gооgle', 'bücher', '例子', 'mañana', 'κόσμος', '日本語', '한국', 'العربية', 'हिन्दी', 'עברית', 'école', 'café', 'münchen', 'россия', 'παράδειγμα']) {
    const host = new URL(`https://${label}.example`).hostname;
    assert.equal(unicodeHost(host), domainToUnicode(host), host);
  }
  assert.equal(hostSkeleton(new URL('https://раураl.example').hostname), 'paypal.example');
  for (const malformed of ['xn--%', 'xn--!!!', 'xn--99999999999999999999999999999999999999999999999999999999'])
    assert.doesNotThrow(() => unicodeHost(malformed));
});

test('URL decoding is bounded and malformed escapes do not crash detection', () => {
  assert.equal(decodeUrlComponent('%256cogin'), 'login');
  assert.equal(decodeUrlComponent('%25256cogin'), '%6cogin');
  assert.equal(decodeUrlComponent('%E0%A4'), '%E0%A4');
  assert.equal(normalizeUrl('https://www.gcash.com./login').hostname, 'www.gcash.com');
});

test('encoded destinations inherit the outer URL evidence and obey expansion limits', () => {
  const text = 'Open https://www.google.com/url?next=https%253A%252F%252Fpaypal.com.attacker.example%252Flogin';
  const candidates = urlCandidates(text);
  assert(candidates.some(c => new URL(c.url).hostname === 'paypal.com.attacker.example'));
  for (const candidate of candidates) for (const evidence of candidate.evidence)
    assert.equal(text.slice(evidence.start, evidence.end), evidence.text);
  let nested = 'https://gcash.com.attacker.example/login';
  for (let depth = 0; depth < 12; depth++) nested = `https://layer-${depth}.example/?url=${encodeURIComponent(nested)}`;
  assert(urlCandidates(nested).length <= 10);
  assert.equal(urlCandidates(nested).length, 4, 'only three nested hops are inspected');
  assert.deepEqual(redirectDestinations(new URL('https://www.google.com/?next=%2Faccount')), []);
});

test('Unicode input and its ASCII punycode spelling produce the same warning', () => {
  for (const host of ['раураl.example', 'gсash.example', 'gооgle.example']) {
    const raw = `https://${host}/%6cogin`;
    const ascii = new URL(raw).href;
    const ids = value => analyzeUrl(value).indicators.map(i => i.id);
    assert.deepEqual(ids(raw), ids(ascii));
    assert(ids(raw).some(id => id.startsWith('lookalike-')));
  }
});

test('general intent combinations survive changed names, case, domains and amounts', () => {
  for (let index = 1; index <= 12; index++) {
    for (const text of [
      `Hello customer ${index}. Your parcel must verify the recipient identity at https://delivery-${index}.example/confirm`,
      `You have been selected for a part-time job with a daily salary of ${index * 137} pesos. Contact https://work-${index}.example`,
      `Your loan is approved. Pay a release fee of ${index * 43} pesos before the funds are sent.`,
      `Hi Mum, I lost my mobile. This is my replacement number. Please transfer ${index * 500} pesos now.`,
    ]) {
      const result = analyzePatterns(index % 2 ? text.toUpperCase() : text);
      assert(['High risk', 'Suspicious'].includes(result.level), text);
      for (const indicator of result.indicators) {
        if (['dataset-text-model', 'dataset-url-model'].includes(indicator.id)) continue;
        for (const evidence of indicator.evidence) {
          assert(Number.isInteger(evidence.start));
          assert.equal(result.sourceText.slice(evidence.start, evidence.end), evidence.text);
        }
      }
    }
  }
});

test('fee waivers cannot hide a separate active payment demand', () => {
  for (const text of [
    'No release fee is needed. But send your password to me now.',
    'Your loan has no processing fee. Pay an activation fee before we release it.',
    'No payment is needed for the school event. Pay a registration fee to unlock your task commission.',
  ]) assert(['High risk', 'Suspicious'].includes(analyzePatterns(text).level), text);
  for (const text of [
    'Your loan payment was received. No release fee or additional payment is required.',
    'There is no payment to claim the school raffle prize. Come to the assembly.',
    'Walang bayad sa pagkuha ng dokumento. Dalhin ang school ID bukas.',
  ]) assert.equal(analyzePatterns(text).level, 'Low risk', text);
});
