import { createHash } from 'node:crypto';
import { parse } from 'tldts';
import { smsFeatures } from '../../lib/sms-features.js';
import { scoreFeatures } from '../../lib/model-scoring.js';

export const digest = (value) => createHash('sha256').update(value).digest('hex');

export function textTemplate(text) {
  // Identical templates with different URLs, numbers or punctuation stay together.
  return smsFeatures(String(text)).words.join(' ');
}

export function urlGroup(raw) {
  const url = new URL(raw);
  return parse(url.hostname, { allowPrivateDomains: true }).domain || url.hostname;
}

export function groupedSplit(key) {
  const unit = Number.parseInt(digest(key).slice(0, 8), 16) / 0x100000000;
  return unit < .8 ? 'train' : unit < .9 ? 'validation' : 'test';
}

export function partitionAudit(rows) {
  const groups = new Map();
  const splits = Object.fromEntries(['train', 'validation', 'test'].map((split) => [split, { rows: 0, positive: 0, negative: 0, groups: 0 }]));
  for (const row of rows) {
    const group = row.group || row.key;
    if (groups.has(group) && groups.get(group) !== row.split) throw Error('A group crosses dataset partitions.');
    if (!groups.has(group)) splits[row.split].groups++;
    groups.set(group, row.split);
    splits[row.split].rows++;
    splits[row.split][row.label ? 'positive' : 'negative']++;
  }
  return { groups: groups.size, crossingGroups: 0, splits };
}

export function trainTfidf(rows, featureFn, vocabLimit) {
  const train = rows.filter((row) => row.split === 'train');
  const frequency = new Map();
  const featureRows = train.map((row) => ({ ...row, features: [...new Set(featureFn(row.value))] }));
  for (const row of featureRows)
    for (const feature of row.features) frequency.set(feature, (frequency.get(feature) || 0) + 1);
  const vocab = [...frequency].filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, vocabLimit).map(([feature]) => feature);
  const idf = Object.fromEntries(vocab.map((feature) => [feature, Math.log((1 + train.length) / (1 + frequency.get(feature))) + 1]));
  const counts = [Object.fromEntries(vocab.map((feature) => [feature, 1])), Object.fromEntries(vocab.map((feature) => [feature, 1]))];
  const totals = [vocab.length, vocab.length];
  const documents = [0, 0];
  for (const row of featureRows) {
    documents[row.label]++;
    const known = row.features.filter((feature) => Object.hasOwn(idf, feature));
    const norm = Math.sqrt(known.reduce((sum, feature) => sum + idf[feature] ** 2, 0));
    if (!norm) continue;
    for (const feature of known) {
      const value = idf[feature] / norm;
      counts[row.label][feature] += value;
      totals[row.label] += value;
    }
  }
  if (!documents[0] || !documents[1]) throw Error('Training requires both legitimate and positive samples.');
  return {
    featureTransform: 'binary-tfidf-l2',
    idf,
    weights: Object.fromEntries(vocab.map((feature) => [feature, Math.log(counts[1][feature] / totals[1]) - Math.log(counts[0][feature] / totals[0])])),
    intercept: Math.log(documents[1] / documents[0]),
    vocabularySize: vocab.length,
    trainDocuments: train.length,
    trainPositive: documents[1],
    trainNegative: documents[0],
  };
}

function metrics(tp, fp, positive, negative, abstained = 0) {
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = positive ? tp / positive : null;
  return {
    tp, fp, tn: negative - fp, fn: positive - tp, abstained,
    precision, recall,
    falsePositiveRate: negative ? fp / negative : null,
    f1: precision && recall ? 2 * precision * recall / (precision + recall) : 0,
  };
}

export function selectThreshold(model, rows, featureFn, { maxFalsePositiveRate = .02 } = {}) {
  const validation = rows.filter((row) => row.split === 'validation');
  const positive = validation.filter((row) => row.label === 1).length;
  const negative = validation.length - positive;
  if (!positive || !negative) throw Error('Validation requires both classes.');
  const scored = validation.map((row) => ({ label: row.label, ...scoreFeatures(model, featureFn(row.value)) }));
  const abstained = scored.filter((row) => row.abstained).length;
  const eligible = scored.filter((row) => !row.abstained).sort((a, b) => b.score - a.score);
  let tp = 0, fp = 0;
  let best = { threshold: (eligible[0]?.score ?? 0) + 1, ...metrics(0, 0, positive, negative, abstained) };
  for (let i = 0; i < eligible.length;) {
    const threshold = eligible[i].score;
    do { if (eligible[i].label) tp++; else fp++; i++; } while (i < eligible.length && eligible[i].score === threshold);
    const current = metrics(tp, fp, positive, negative, abstained);
    if (current.falsePositiveRate > maxFalsePositiveRate) continue;
    if (current.recall > best.recall || (current.recall === best.recall && (current.precision ?? 0) > (best.precision ?? 0)))
      best = { threshold, ...current };
  }
  return { ...best, targetFalsePositiveRate: maxFalsePositiveRate, negativeValidationSamples: negative };
}

export function evaluateModel(model, rows, featureFn, split = 'test') {
  const selected = rows.filter((row) => row.split === split);
  let tp = 0, fp = 0, positive = 0, negative = 0, abstained = 0;
  for (const row of selected) {
    const prediction = scoreFeatures(model, featureFn(row.value));
    if (row.label) positive++; else negative++;
    if (prediction.abstained) abstained++;
    if (prediction.flagged) { if (row.label) tp++; else fp++; }
  }
  return { count: selected.length, positive, negative, ...metrics(tp, fp, positive, negative, abstained) };
}
