import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePatterns } from '../lib/pattern-detection.js';
import { assessContent } from '../lib/content-assessment.js';

test('ordinary complete messages are low risk with a reminder to verify', () => {
  for (const text of ['Your school meeting is tomorrow at nine.', 'Never share your OTP or password with anyone.']) {
    const result = assessContent({ text });
    assert.equal(result.level, 'Low risk');
    assert.match(result.recommendation, /trusted channel/);
    assert.match(result.summary, /does not guarantee safety/);
  }
  for (const input of [{ text: 'Hi.' }, { text: 'School is tomorrow at nine.', uncertain: true }, { text: 'WIFI:T:WPA;S:Example;P:private;;', kind: 'qr' }])
    assert.equal(assessContent(input).level, 'Insufficient evidence');
});

test('delivery and account link combinations are reviewable without a sender blacklist', () => {
  const cases = [
    ['Your parcel could not arrive. Please confirm your address at https://parcel-update.example/verify', 'parcel-update-link'],
    ['PH Postal: Your domestic mail was returned. Arrange re-delivery at https://postal-update.example', 'parcel-update-link'],
    ['G Cash Advisory: your account was suspended. Visit https://account-help.example to resolve this.', 'account-alert-link'],
  ];
  for (const [text, id] of cases) {
    const result = analyzePatterns(text);
    assert(['High risk', 'Suspicious'].includes(result.level));
    const finding = result.indicators.find(i => i.id === id);
    assert(finding);
    for (const evidence of finding.evidence) assert.equal(text.slice(evidence.start, evidence.end), evidence.text);
  }
});

test('ordinary notifications, official updates and protective wording avoid the new combination rules', () => {
  for (const text of [
    'Your parcel will arrive today. Prepare the exact COD amount shown in your app.',
    'Your parcel needs a delivery update. Confirm your address at https://www.fedex.com/tracking',
    'Your parcel needs a delivery update. Confirm your address at https://www.shopee.ph/orders',
    'GCash security reminder: never open suspicious links. Read advice at https://www.gcash.com',
    'Your account was suspended. Open https://www.bdo.com.ph for assistance.',
    'We received your payment. The school meeting is tomorrow.',
  ]) {
    const result = analyzePatterns(text);
    assert(!result.indicators.some(i => ['parcel-update-link', 'account-alert-link'].includes(i.id)), text);
  }
});

test('family payment requests and COD release fees are reviewable while ordinary controls remain low risk', () => {
  for (const text of [
    'Ma, bagong number ko ito. Send money now sa GCash para sa emergency ko.',
    'Pa, nasira ang phone ko. Magpadala ka ng pera ngayon sa wallet ng kaibigan ko.',
    'Naka-hold ang parcel mo. Magbayad ng handling fee sa personal wallet bago ma-deliver.',
  ]) assert(['High risk', 'Suspicious'].includes(analyzePatterns(text).level), text);
  for (const text of [
    'My new number is saved in the family group. Call my old number to confirm who I am.',
    'Your parcel is out for delivery today. Prepare the exact COD amount in the usual app.',
  ]) assert.equal(analyzePatterns(text).level, 'Low risk', text);
});
