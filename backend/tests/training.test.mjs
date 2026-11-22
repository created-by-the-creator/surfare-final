import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { messageLabel } from '../lib/message-labels.js';
import { smsFeatures } from '../lib/sms-features.js';
import { scoreFeatures } from '../lib/model-scoring.js';
import { groupedSplit, textTemplate, urlGroup, partitionAudit, trainTfidf, selectThreshold, evaluateModel } from '../scripts/lib/dataset-training.mjs';
import { analyze, extractUrls } from '../lib/detection.js';
import { assessDatasets } from '../lib/dataset-assessment.js';
import { parseCsv } from '../lib/csv-rows.js';

test('generic spam and ambiguous intent are never automatically labeled scam', () => {
  assert.equal(messageLabel('Commercial Spam'), 'spam');
  assert.equal(messageLabel('spam'), 'spam');
  assert.equal(messageLabel(1), 'spam');
  assert.equal(messageLabel('Other'), 'unreviewed');
  assert.equal(messageLabel('Not a scam'), 'unreviewed');
  assert.equal(messageLabel('HAM'), 'legitimate');
  assert.equal(messageLabel('Bank Scam'), 'scam');
  assert.equal(messageLabel('Government Spoofing'), 'scam');
});

test('different numbers and links in the same message template cannot cross splits', () => {
  const left = textTemplate('Claim 100 pesos at https://example.com/a.');
  const right = textTemplate('CLAIM 900 pesos at https://different.example/b!');
  assert.equal(left, right);
  assert.equal(groupedSplit(left), groupedSplit(right));
});

test('URL partitions keep a registrable domain together, including private suffixes', () => {
  assert.equal(urlGroup('https://login.example.com/a'), urlGroup('https://shop.example.com/b'));
  assert.notEqual(urlGroup('https://first.github.io/a'), urlGroup('https://second.github.io/b'));
  assert.throws(() => partitionAudit([{ group: 'same', split: 'train', label: 0 }, { group: 'same', split: 'test', label: 1 }]), /crosses/);
});

test('TF-IDF vocabulary and IDF use training documents only', () => {
  const rows = [
    { value: 'meeting notes', label: 0, split: 'train' },
    { value: 'meeting agenda', label: 0, split: 'train' },
    { value: 'claim prize', label: 1, split: 'train' },
    { value: 'claim money', label: 1, split: 'train' },
    { value: 'testonlyword', label: 1, split: 'test' },
  ];
  const model = trainTfidf(rows, (text) => smsFeatures(text).features, 20);
  assert.equal(Object.hasOwn(model.weights, 'w:testonlyword'), false);
  assert.equal(model.idf['w:meeting'], Math.log(5 / 3) + 1);
  assert.equal(model.trainDocuments, 4);
});

test('inference uses the same TF-IDF and length normalization as training', () => {
  const model = { featureTransform: 'binary-tfidf-l2', idf: { a: 3, b: 4 }, weights: { a: 2, b: -1 }, intercept: .5, minFeatures: 1, minCoverage: .5, threshold: .8 };
  const result = scoreFeatures(model, ['a', 'b', 'a']);
  assert.ok(Math.abs(result.score - .9) < 1e-10);
  assert.equal(result.flagged, true);
  assert.equal(result.abstained, false);
  assert.equal(scoreFeatures(model, ['unseen']).abstained, true);
  assert.equal(scoreFeatures(model, ['unseen']).flagged, false);
});

test('threshold tuning obeys the validation false-positive ceiling and ignores test labels', () => {
  const model = { weights: { low: 1, medium: 2, high: 3 }, intercept: 0, minFeatures: 1, minCoverage: 1 };
  const rows = [
    { value: 'low', label: 0, split: 'validation' },
    { value: 'medium', label: 0, split: 'validation' },
    { value: 'high', label: 1, split: 'validation' },
    { value: 'low', label: 1, split: 'test' },
  ];
  const selected = selectThreshold(model, rows, (text) => [text], { maxFalsePositiveRate: 0 });
  assert.equal(selected.threshold, 3);
  assert.equal(selected.fp, 0);
  assert.equal(selected.recall, 1);
  const changed = rows.map((row) => row.split === 'test' ? { ...row, label: 0 } : row);
  assert.deepEqual(selectThreshold(model, changed, (text) => [text], { maxFalsePositiveRate: 0 }), selected);
  assert.equal(evaluateModel({ ...model, threshold: selected.threshold }, rows, (text) => [text]).fn, 1);
});

test('a commercial advertisement cannot create a known-scam dataset match by itself', () => {
  const rows = parseCsv(fs.readFileSync(new URL('../datasets/A.S.E.A Taglish scam Dataset.csv', import.meta.url), 'utf8'));
  const text = rows.find((row) => row.intent === 'Commercial Spam' && row.text.length > 30).text;
  assert.notEqual(assessDatasets(text)?.risk, 'high');
  assert.equal(analyze(text).indicators.some((indicator) => indicator.id === 'dataset-text-match'), false);
});

test('reported scam warnings do not become advance-fee requests', () => {
  for (const text of [
    'Do not follow messages saying you won a prize and must pay a fee.',
    'May mga manlolokong nagsasabing may premyo ka. Huwag magbayad ng hinihingi nilang release fee.',
    'If someone asks for a release fee, huwag mong bayaran.',
  ]) assert.equal(analyze(text).indicators.some((indicator) => indicator.id === 'advance-fee'), false, text);
});

test('protective wording cannot hide a separate active payment or credential demand', () => {
  for (const text of [
    'Never share an OTP. But send me your password now to keep your account.',
    'Keep your password private and send it to me now.',
    'Do not follow messages saying you won a prize and pay me a release fee now.',
    'If someone asks for a release fee, huwag mong bayaran. Pero ibigay ang password mo sa akin ngayon.',
  ]) assert.ok(['High risk', 'Suspicious'].includes(analyze(text).level), text);
});

test('Filipino guaranteed-multiple-return offers remain reviewable', () => {
  const result = analyze('Siguradong apat na beses ang balik ng pera mo at walang panganib. Ipadala ang paunang deposito.');
  assert.ok(result.indicators.some((indicator) => indicator.id === 'investment'));
});

test('cash-in requests paired with promises to control winnings are high risk', () => {
  for (const text of [
    'okay lang ba makipag deal ako sayo? Cash in ka 100 ipapanalo kita 7k basta hati tayo 2k sakin 5k sayo',
    'Cash-in kayo 250. Ipapanalo ko kayo 9k, hati tayo sa kita.',
  ]) {
    const result = analyze(text);
    assert.equal(result.level, 'High risk');
    assert.ok(result.indicators.some((indicator) => indicator.id === 'winnings-deposit'));
  }
  assert.equal(analyze('Cash in ka 100 para may balance ka sa sarili mong wallet.').indicators.some((indicator) => indicator.id === 'winnings-deposit'), false);
  assert.equal(analyze('Huwag mag-cash-in sa taong nagsasabing ipapanalo kita.').indicators.some((indicator) => indicator.id === 'winnings-deposit'), false);
});

test('Markdown formatting does not become part of an official URL', () => {
  assert.deepEqual(extractUrls('Visit [**https://www.gcash.com**](https://www.gcash.com)'), ['https://www.gcash.com']);
});
