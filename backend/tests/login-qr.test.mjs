import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoginQrPayload, isPrivateQrPayload } from '../lib/qr-payload.js';
import { assessContent } from '../lib/content-assessment.js';
import { detect } from '../server/services/detect.js';
import { semanticCheck } from '../server/services/semantic.js';
import { checkContent } from '../client/check-content.js';

// Fabricated keys, never a functioning account login.
const login = `2@${'a'.repeat(80)},${'A'.repeat(43)}=,${'B'.repeat(43)}=,${'C'.repeat(43)}=`;

test('recognizes pairing data without treating brand mentions as authentication', () => {
  for (const value of [login, `${login},1`, `${login},1,0`]) {
    assert.equal(isLoginQrPayload(value), true);
    assert.equal(isPrivateQrPayload(value), true);
    const result = assessContent({ kind: 'qr', text: value });
    assert.equal(result.level, 'Insufficient evidence');
    assert.equal(result.indicators.length, 0);
  }
  for (const text of ['WhatsApp login', 'https://whatsapp-login.example.com/', 'ref,key,key,key'])
    assert.equal(isLoginQrPayload(text), false);
});

test('pairing record does not hide warnings in accompanying text', () => {
  const result = assessContent({ kind: 'image', text: `${login}\nSend your OTP now. Your account will be blocked today.` });
  assert.equal(result.level, 'High risk');
  assert(result.indicators.length > 0);
});

test('detector never sends pairing secrets to an AI provider', async () => {
  const response = await detect(new Request('https://surfare.example/api/detect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'qr', text: login, ai: true, consent: true }),
  }), { OPENROUTER_API_KEY: 'test-key' }, () => { throw Error('Private login code was sent'); });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.level, 'Insufficient evidence');
  assert.equal(result.aiReview.status, 'not_checked');
  assert.equal(result.indicators.length, 0);
});

test('legacy semantic routes and client also keep mixed pairing data local', async () => {
  const text = `${login}\nScan to log in to WhatsApp.`;
  const fetcher = () => { throw Error('Private login code was sent'); };
  const response = await semanticCheck(new Request('https://surfare.example/api/assess', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'qr', text, consent: true }),
  }), { OPENROUTER_API_KEY: 'test-key' }, fetcher);
  assert.equal((await response.json()).status, 'not_checked');
  const result = await checkContent({ kind: 'qr', text }, { ai: true, provider: 'openrouter', fetcher });
  assert.equal(result.semantic.status, 'not_checked');
});
