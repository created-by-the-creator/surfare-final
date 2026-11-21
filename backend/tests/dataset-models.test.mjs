import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows } from '../lib/csv-rows.js';
import { classifyTaglishIntent, classifyUrlRisk } from '../lib/dataset-models.js';

test('CSV parser handles quoted commas and short malformed rows', () => {
  const rows = [...parseCsvRows('a,b\r\n"x, y",z\r\nshort\r\n')];
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'z'], ['short']]);
});

test('text model flags scam-like wording and abstains on short ordinary text', () => {
  const suspicious = classifyTaglishIntent(
    'Congratulations! Claim your prize now by sending your OTP.',
  );
  assert.equal(suspicious.flagged, true);
  assert(suspicious.evidence.some((item) => item.text === 'prize'));
  assert.equal(classifyTaglishIntent('hello').flagged, false);
});

test('URL model flags lexical phishing patterns without page access', () => {
  const result = classifyUrlRisk('https://secure-verify-bank-login.example.ph/update');
  assert.equal(result.flagged, true);
  assert(result.evidence.some((item) => item.text === 'verify'));
  assert.equal(classifyUrlRisk('not a url').flagged, false);
});
