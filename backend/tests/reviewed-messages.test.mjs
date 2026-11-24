import test from 'node:test';
import assert from 'node:assert/strict';
import { assessContent } from '../lib/content-assessment.js';

const gambling =
  'Dito nagsisimula ang saya at panalo! 8P FREE + 8888P welcome package + bonus. USE 716120 at  BangoWin.com';
const scam = `okay lang ba makipag deal ako sayo? Cash in ka 100 ipapanalo kita 7k basta hati tayo 2k sakin 5k sayo,
Name :Allexa Brielle Lim
search:@officialalex09`;
const promo =
  'GCash,Sagot na ni GLoan ang 10.10 budols mo! Huwag papahuli sa best deals when you get affordable installments via GLoan! Tap Borrow > GLoan in the GCash app to avail.';
const security =
  'GCash Security Reminder: Never share your OTP with anyone. For more information about protecting your account, visit https://www.gcash.com';

const check = (text) => assessContent({ text, kind: 'message' });
const ids = (result) => new Set((result.indicators || []).map((indicator) => indicator.id));

test('reviewed gambling scam is flagged without a PAGCOR claim', () => {
  const result = check(gambling);
  assert.equal(result.level, 'High risk');
  assert(ids(result).has('gambling-signup-offer'));
  assert(ids(result).has('watchlisted-gambling-link'));
  assert(ids(result).has('dataset-text-match'));
});

test('reviewed profit-share scam is flagged', () => {
  const result = check(scam);
  assert.equal(result.level, 'High risk');
  assert(ids(result).has('profit-share-bait'));
  assert(ids(result).has('dataset-text-match'));
});

test('reviewed ordinary messages carry no warning indicators', () => {
  for (const text of [promo, security]) {
    const result = check(text);
    assert.equal((result.indicators || []).length, 0);
    assert.notEqual(result.level, 'High risk');
    assert.notEqual(result.level, 'Suspicious');
  }
});

test('near-miss scam text is analysed instead of dismissed', () => {
  const result = check(
    `okay lang ba makipag deal ako sayo? Cash in ka 200 ipapanalo kita 8k basta hati tayo 3k sakin 5k sayo,
Name :Juan Dela Cruz
search:@juan_dc_`,
  );
  assert(ids(result).has('profit-share-bait'));
  assert.notEqual(result.level, 'Insufficient evidence');
});

test('an ordinary shared expense is not treated as profit sharing', () => {
  assert(!ids(check('Cash in ka muna para sa dinner. Hati tayo sa bayad.')).has('profit-share-bait'));
});
test('money doubling without a profit split is not profit-share bait', () => {
  assert(!ids(check('Deposit 100 pesos now and I will double your money.')).has('profit-share-bait'));
});
