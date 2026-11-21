import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseCsvRows } from '../lib/csv-rows.js';
import { smsFeatures } from '../lib/sms-features.js';
import { urlLexicalFeatures } from '../lib/url-lexical-features.js';

const args = process.argv.slice(2);
function option(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const backendRoot = path.resolve(option('--backend', path.resolve(import.meta.dirname, '..')));
const outRoot = path.resolve(option('--out', backendRoot));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function normalizeMessage(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeUrlValue(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
function splitFor(key) {
  const unit = Number.parseInt(sha256(key).slice(0, 8), 16) / 0xffffffff;
  return unit < 0.8 ? 'train' : unit < 0.9 ? 'validation' : 'test';
}
function headerIndex(headers, name) {
  return headers.findIndex((header) => header.trim().toLowerCase() === name.toLowerCase());
}
function countRows(file) {
  if (file.endsWith('.json')) {
    const data = readJson(file);
    return Array.isArray(data) ? data.length : data.rows?.length || 0;
  }
  let count = 0;
  for (const _row of parseCsvRows(fs.readFileSync(file, 'utf8'))) count += 1;
  return Math.max(0, count - 1);
}

function textLabel(value) {
  const label = String(value ?? '').trim().toLowerCase();
  if (['spam', 'scam', '1'].includes(label)) return 1;
  if (['ham', 'legit', '0'].includes(label)) return 0;
  return null;
}

function collectTextRows() {
  const byText = new Map();
  const add = (text, label, source) => {
    if (label === null) return;
    const key = normalizeMessage(text);
    if (!key) return;
    const found = byText.get(key);
    if (!found) byText.set(key, { value: key, key, labels: new Set([label]), sources: new Set([source]) });
    else {
      found.labels.add(label);
      found.sources.add(source);
    }
  };

  const aseaFile = path.join(backendRoot, 'datasets', 'A.S.E.A Taglish scam Dataset.csv');
  const aseaRows = [...parseCsvRows(fs.readFileSync(aseaFile, 'utf8'))];
  const aseaHeader = aseaRows.shift() || [];
  const textIndex = headerIndex(aseaHeader, 'text');
  const intentIndex = headerIndex(aseaHeader, 'intent');
  for (const values of aseaRows) {
    const intent = String(values[intentIndex] ?? '').trim();
    add(values[textIndex], intent === 'HAM' ? 0 : intent ? 1 : null, 'asea');
  }

  for (const [id, file] of [
    ['filipino-spam-sms', 'filipino-spam-sms-dataset.csv'],
    ['filipino-spam-merged', 'filipino-spam-sms-merged.csv'],
    ['sms-spam-collection-dedup', 'sms-spam-collection-dedup.csv'],
  ]) {
    const rows = [...parseCsvRows(fs.readFileSync(path.join(backendRoot, 'datasets', 'external', file), 'utf8'))];
    const header = rows.shift() || [];
    const labelIndex = headerIndex(header, 'label');
    const messageIndex = headerIndex(header, 'message');
    const textIndex2 = headerIndex(header, 'text');
    for (const values of rows)
      add(values[messageIndex] ?? values[textIndex2], textLabel(values[labelIndex]), id);
  }

  const hinglish = readJson(path.join(backendRoot, 'datasets', 'external', 'hinglish-scam-text.json'));
  for (const row of hinglish.rows || []) add(row.text, textLabel(row.label), 'hinglish');

  const imcFile = path.join(backendRoot, 'datasets', 'external', 'imc25-smishing.csv');
  const imcRows = [...parseCsvRows(fs.readFileSync(imcFile, 'utf8'))];
  const imcHeader = imcRows.shift() || [];
  const textIndex3 = headerIndex(imcHeader, 'text');
  const translationIndex = headerIndex(imcHeader, 'translation');
  for (const values of imcRows) add(values[translationIndex] || values[textIndex3], 1, 'imc25');

  const rows = [];
  for (const [key, value] of byText) {
    if (value.labels.size !== 1) continue;
    rows.push({
      key,
      value: value.value,
      label: [...value.labels][0],
      sources: [...value.sources].sort(),
      split: splitFor(key),
    });
  }
  return rows;
}

function collectUrlRows() {
  const file = path.join(backendRoot, 'datasets', 'PhiUSIIL_Phishing_URL_Dataset.csv');
  const rows = [...parseCsvRows(fs.readFileSync(file, 'utf8'))];
  const header = (rows.shift() || []).map((value) => value.trim());
  const urlIndex = headerIndex(header, 'URL');
  const labelIndex = header.length - 1;
  const byUrl = new Map();
  for (const values of rows) {
    const normalized = normalizeUrlValue(values[urlIndex] ?? values[1] ?? '');
    const labelText = String(values[labelIndex] ?? '').trim();
    if (!normalized || !['0', '1'].includes(labelText)) continue;
    const label = labelText === '0' ? 1 : 0;
    const found = byUrl.get(normalized);
    if (!found) byUrl.set(normalized, { value: values[urlIndex] ?? values[1], labels: new Set([label]) });
    else found.labels.add(label);
  }
  const result = [];
  for (const [normalized, value] of byUrl) {
    if (value.labels.size !== 1) continue;
    result.push({
      key: normalized,
      value: value.value.trim().replace(/^"|"$/g, ''),
      label: [...value.labels][0],
      source: 'phiusiil',
      split: splitFor(normalized),
    });
  }
  return result;
}

function trainNaiveBayes(rows, featureFn, vocabLimit) {
  const counts = [new Map(), new Map()];
  const documents = [0, 0];
  const documentFrequency = new Map();
  for (const row of rows) {
    if (row.split !== 'train') continue;
    const features = featureFn(row.value) || [];
    documents[row.label] += 1;
    const seen = new Set();
    for (const feature of features) {
      counts[row.label].set(feature, (counts[row.label].get(feature) || 0) + 1);
      if (!seen.has(feature)) {
        documentFrequency.set(feature, (documentFrequency.get(feature) || 0) + 1);
        seen.add(feature);
      }
    }
  }
  const vocab = [...documentFrequency.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, vocabLimit)
    .map(([feature]) => feature);
  const weights = {};
  for (const feature of vocab) {
    const positive = counts[1].get(feature) || 0;
    const negative = counts[0].get(feature) || 0;
    weights[feature] = Math.log((positive + 1) / (documents[1] + 2))
      - Math.log((negative + 1) / (documents[0] + 2));
  }
  return {
    intercept: Math.log((documents[1] + 1) / (documents[0] + 1)),
    weights,
    vocabularySize: vocab.length,
    trainDocuments: documents[1] + documents[0],
    trainPositive: documents[1],
    trainNegative: documents[0],
  };
}

function scoreModel(model, features, minFeatures, minCoverage, threshold) {
  const list = features || [];
  const known = list.filter((feature) => Object.hasOwn(model.weights, feature)).length;
  const score = model.intercept + list.reduce((sum, feature) => sum + (model.weights[feature] || 0), 0);
  const coverage = list.length ? known / list.length : 0;
  return {
    score,
    coverage,
    flagged: list.length >= minFeatures && coverage >= minCoverage && score >= threshold,
  };
}

function chooseThreshold(model, rows, featureFn, minFeatures, minCoverage) {
  let best = { threshold: 0.5, quality: -Infinity };
  for (let threshold = -4; threshold <= 6; threshold += 0.25) {
    let tp = 0, fp = 0, fn = 0;
    for (const row of rows) {
      if (row.split !== 'validation') continue;
      const predicted = scoreModel(model, featureFn(row.value), minFeatures, minCoverage, threshold).flagged ? 1 : 0;
      if (predicted && row.label === 1) tp += 1;
      else if (predicted && row.label === 0) fp += 1;
      else if (!predicted && row.label === 1) fn += 1;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    const quality = f1 - fp / 10000;
    if (quality > best.quality)
      best = {
        threshold: Number(threshold.toFixed(2)),
        quality,
        precision,
        recall,
        f1,
        tp,
        fp,
        fn,
      };
  }
  return best;
}

function evaluate(model, rows, featureFn, minFeatures, minCoverage) {
  let tp = 0, fp = 0, tn = 0, fn = 0, abstained = 0;
  for (const row of rows) {
    if (row.split !== 'test') continue;
    const result = scoreModel(model, featureFn(row.value), minFeatures, minCoverage, model.threshold);
    if (result.coverage < minCoverage) abstained += 1;
    const predicted = result.flagged ? 1 : 0;
    if (predicted && row.label === 1) tp += 1;
    else if (predicted && row.label === 0) fp += 1;
    else if (!predicted && row.label === 1) fn += 1;
    else tn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    tp, fp, tn, fn, abstained,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number((precision + recall ? (2 * precision * recall) / (precision + recall) : 0).toFixed(4)),
  };
}

function buildTextModel(rows) {
  const featureFn = (text) => smsFeatures(text).features;
  const minFeatures = 3;
  const minCoverage = 0.35;
  const model = trainNaiveBayes(rows, featureFn, 6000);
  const selected = chooseThreshold(model, rows, featureFn, minFeatures, minCoverage);
  model.threshold = selected.threshold;
  model.minFeatures = minFeatures;
  model.minCoverage = minCoverage;
  const counts = { train: 0, validation: 0, test: 0 };
  for (const row of rows) counts[row.split] += 1;
  return {
    model: {
      version: 1,
      type: 'taglish-intent',
      classes: { 0: 'ordinary', 1: 'suspicious' },
      use: 'review signal only; not a calibrated probability or fraud verdict',
      minFeatures,
      minCoverage,
      threshold: model.threshold,
      intercept: model.intercept,
      weights: model.weights,
      counts: {
        total: rows.length,
        ...counts,
        vocabularySize: model.vocabularySize,
        trainPositive: model.trainPositive,
        trainNegative: model.trainNegative,
      },
      evaluation: {
        split: 'deterministic SHA-256 split from normalized text',
        thresholdSelection: 'validation F1 with a small false-positive penalty',
        test: evaluate(model, rows, featureFn, minFeatures, minCoverage),
      },
    },
    stats: counts,
  };
}

function buildUrlModel(rows) {
  const featureFn = (url) => urlLexicalFeatures(url)?.features || [];
  const minFeatures = 6;
  const minCoverage = 0.45;
  const model = trainNaiveBayes(rows, featureFn, 4000);
  const selected = chooseThreshold(model, rows, featureFn, minFeatures, minCoverage);
  model.threshold = selected.threshold;
  model.minFeatures = minFeatures;
  model.minCoverage = minCoverage;
  const counts = { train: 0, validation: 0, test: 0 };
  for (const row of rows) counts[row.split] += 1;
  return {
    model: {
      version: 1,
      type: 'url-risk-lexical',
      classes: { 0: 'legitimate', 1: 'phishing-like' },
      use: 'review signal only; derived from URL text, with no page or network inspection',
      minFeatures,
      minCoverage,
      threshold: model.threshold,
      intercept: model.intercept,
      weights: model.weights,
      counts: {
        total: rows.length,
        ...counts,
        vocabularySize: model.vocabularySize,
        trainPositive: model.trainPositive,
        trainNegative: model.trainNegative,
      },
      evaluation: {
        split: 'deterministic SHA-256 split from normalized URL',
        thresholdSelection: 'validation F1 with a small false-positive penalty',
        test: evaluate(model, rows, featureFn, minFeatures, minCoverage),
      },
    },
    stats: counts,
  };
}

function buildManifest(textModel, urlModel, textRows, urlRows) {
  const definitions = [
    ['asea', 'datasets/A.S.E.A Taglish scam Dataset.csv', 'active-exact-and-text-model', 'unverified', 'Repository-local Taglish intent corpus. Preserve attribution and review before redistribution.'],
    ['phiusiil', 'datasets/PhiUSIIL_Phishing_URL_Dataset.csv', 'active-exact-and-url-model', 'conflicting', 'Exact URL index plus lexical URL training. Kaggle says CC BY-NC-SA 4.0; UCI/Mendeley say CC BY 4.0. Resolve before redistribution.'],
    ['dataset-phishing', 'datasets/dataset_phishing.csv', 'reference-only', 'CC BY 4.0 (Kaggle listing)', 'Engineered page features with no raw URL string; unavailable at runtime. Not used for training or inference.'],
    ['filipino-spam-sms', 'datasets/external/filipino-spam-sms-dataset.csv', 'active-text-model', 'BSD-3-Clause', 'Alexander/Yissuh 2023.'],
    ['filipino-spam-merged', 'datasets/external/filipino-spam-sms-merged.csv', 'active-text-model', 'BSD-3-Clause', 'Alexander/Yissuh 2023.'],
    ['imc25-smishing', 'datasets/external/imc25-smishing.csv', 'active-text-model-positive-only', 'CC BY 4.0', 'IMC 2025 public smishing reports. Positive-only source; translations used where available.'],
    ['hinglish-scam-text', 'datasets/external/hinglish-scam-text.json', 'active-text-model', 'CC BY 4.0', 'Anuj Bolewar 2026. English portion overlaps SMS Spam Collection.'],
    ['sms-spam-collection-dedup', 'datasets/external/sms-spam-collection-dedup.csv', 'active-text-model', 'SMS Spam Collection v1 terms', 'Custom attribution/no-warranty terms; overlaps the existing SMS model corpus.'],
    ['vrbanic-phishing', 'datasets/external/phishing-websites-vrbaniccic.csv', 'excluded-unlicensed', 'none found', 'No license found in repository or GitHub metadata. Downloaded for review only; do not use or redistribute.'],
  ];
  const datasets = definitions.map(([id, relativePath, status, license, note]) => {
    const file = path.join(backendRoot, relativePath);
    if (!fs.existsSync(file)) return { id, path: relativePath, status, license, note };
    const bytes = fs.statSync(file).size;
    return {
      id,
      path: relativePath,
      status,
      license,
      bytes,
      sha256: sha256(fs.readFileSync(file)),
      rows: countRows(file),
      note,
    };
  });
  return {
    generatedBy: 'scripts/train-dataset-models.mjs',
    policy: 'Feedback is never read by this script. Training requires explicit future opt-in.',
    datasets,
    models: {
      'taglish-intent-model.json': {
        sha256: sha256(fs.readFileSync(path.join(outRoot, 'lib', 'models', 'taglish-intent-model.json'))),
        rowsUsed: textRows.length,
      },
      'url-risk-model.json': {
        sha256: sha256(fs.readFileSync(path.join(outRoot, 'lib', 'models', 'url-risk-model.json'))),
        rowsUsed: urlRows.length,
      },
    },
    limits: [
      'Held-out scores are internal regression evidence, not population accuracy.',
      'Several text corpora overlap the existing SMS model sources; do not use them as independent validation of that model.',
      'Exact URL lookup remains authoritative over the lexical URL model.',
      'Feedback records are excluded until a separate explicit opt-in path is designed and approved.',
    ],
  };
}

const textRows = collectTextRows();
const urlRows = collectUrlRows();
const text = buildTextModel(textRows);
const url = buildUrlModel(urlRows);
writeJson(path.join(outRoot, 'lib', 'models', 'taglish-intent-model.json'), text.model);
writeJson(path.join(outRoot, 'lib', 'models', 'url-risk-model.json'), url.model);
writeJson(path.join(outRoot, 'datasets', 'manifest.json'), buildManifest(text.model, url.model, textRows, urlRows));
console.log(JSON.stringify({
  text: { ...text.stats, threshold: text.model.threshold, evaluation: text.model.evaluation.test },
  url: { ...url.stats, threshold: url.model.threshold, evaluation: url.model.evaluation.test },
}, null, 2));
