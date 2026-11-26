import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessContent } from '../lib/content-assessment.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/expected-local-checks.json', import.meta.url), 'utf8'));

for (const item of cases) {
  test(`matches the screenshot's Expected column locally: ${item.id}`, () => {
    const result = assessContent(item);
    assert.equal(result.level, item.expected);
    for (const indicator of result.indicators) for (const evidence of indicator.evidence || [])
      if (Number.isInteger(evidence.start)) assert.equal(item.text.slice(evidence.start, evidence.end), evidence.text);
  });
}

const variants = [
  ['marketplace buyer with a different short link', 'Available pa ba ang item? Send ko po bayad dito: tinyurl.com/another-payment'],
  ['English marketplace buyer', 'Is this item still available? I will send payment here: bit.ly/buyer-pay'],
  ['different parcel fee and domain', 'May COD fee na P75 ang package mo. Bayaran dito: https://parcel-fee.example/pay'],
  ['English parcel fee', 'Your parcel has a pending delivery fee. Pay here: https://shipping-charge.example/payment'],
  ['different family name and payment amount', 'Ma, si Bea ito, bagong numero ko. Pa-send naman 500 sa Maya para makauwi ako.'],
  ['English new-number family request', 'Mom, this is my new phone number. Send me 200 to my bank account, I will repay you tonight.'],
  ['different earnings and recruiter handle', 'Hiring! Earn 800-4500 daily, like and follow pages. Message us on Telegram @different_recruiter'],
  ['different tasks and contact channel', 'Recruiting: Earn 900 per day for rating products. Contact us on WhatsApp for details.'],
];
for (const [name, text] of variants) test(`generalises to ${name}`, () => {
  assert.equal(assessContent({ text }).level, 'High risk');
});

const counterexamples = [
  ['ordinary marketplace inquiry', 'Hi po, available pa po ba yung item? Send ko na lang po bayad sa GCash after checking it in person.'],
  ['ordinary shortened link', 'Here is the event information: bit.ly/class-events'],
  ['COD paid to the courier', 'May COD fee na P48 ang parcel mo. Bayaran ang courier kapag dumating ang package.'],
  ['parcel fee at a listed courier domain', 'Your parcel has a delivery fee. Pay in your account at https://jtexpress.ph/pay'],
  ['new number without a money request', 'Ma, si Paolo ito, bago kong number. Kita tayo sa bahay mamaya.'],
  ['family wallet request without a new identity claim', 'Ma, pa-send naman 2k sa GCash ko para sa grocery natin.'],
  ['ordinary remote job announcement', 'Hiring! Earn 1500 daily, work from home as a bookkeeper. Send your CV to careers@example.com.'],
  ['ordinary Telegram job group', 'Hiring! Earn 1500 daily as an accountant. Our Telegram group shares interview schedules.'],
  ['safety advice quoting the task lure', 'Scam example: "Hiring! Earn 500-3000 daily, like and follow lang. Message us on Telegram @example_tasks" Never pay a recruiter.'],
  ['another page on the Google test host', 'https://testsafebrowsing.appspot.com/'],
  ['lookalike test host', 'https://testsafebrowsing.appspot.com.other.example/s/phishing.html'],
];
for (const [name, text] of counterexamples) test(`does not assign the new high-risk pattern to ${name}`, () => {
  const result = assessContent({ text });
  assert.notEqual(result.level, 'High risk', result.indicators.map(i => i.id).join(', '));
});
