import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseCsvRows } from '../lib/csv-rows.js';
import { smsFeatures } from '../lib/sms-features.js';
import { urlLexicalFeatures } from '../lib/url-lexical-features.js';
import { messageLabel } from '../lib/message-labels.js';
import { groupedSplit, textTemplate, urlGroup, partitionAudit, trainTfidf, selectThreshold, evaluateModel } from './lib/dataset-training.mjs';

const args = process.argv.slice(2);
function option(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const backendRoot = path.resolve(option('--backend', path.resolve(import.meta.dirname, '..')));
const outRoot = path.resolve(option('--out', backendRoot));
const maxFalsePositiveRate = Number(option('--max-fpr', '0.02'));
if (!Number.isFinite(maxFalsePositiveRate) || maxFalsePositiveRate < 0 || maxFalsePositiveRate > 1) throw Error('--max-fpr must be between 0 and 1.');
const textAudit = { sources: {}, duplicateRows: 0, conflictingMessages: 0, excludedCategories: {} };
const urlAudit = { inputRows: 0, invalidRows: 0, duplicateRows: 0, conflictingUrls: 0 };

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
function headerIndex(headers, name) {
  return headers.findIndex((header) => header.trim().toLowerCase() === name.toLowerCase());
}
function requireColumns(headers, names, file) {
  for (const name of names) if (headerIndex(headers, name) < 0) throw Error(`Missing ${name} column in ${path.basename(file)}.`);
}
function countRows(file) {
  if (file.endsWith('.json')) {
    const data = readJson(file);
    return Array.isArray(data) ? data.length : data.rows?.length || data.cases?.length || 0;
  }
  let count = 0;
  for (const _row of parseCsvRows(fs.readFileSync(file, 'utf8'))) count += 1;
  return Math.max(0, count - 1);
}

function collectTextRows() {
  const byText = new Map();
  const add = (text, category, source) => {
    const summary = textAudit.sources[source] ||= {};
    summary[category] = (summary[category] || 0) + 1;
    const key = normalizeMessage(text);
    if (!key || !textTemplate(text)) return;
    const found = byText.get(key);
    if (!found) byText.set(key, { value: String(text).normalize('NFKC').trim(), key, labels: new Set([category]), sources: new Set([source]) });
    else {
      textAudit.duplicateRows++;
      found.labels.add(category);
      found.sources.add(source);
    }
  };

  const aseaFile = path.join(backendRoot, 'datasets', 'A.S.E.A Taglish scam Dataset.csv');
  const aseaRows = [...parseCsvRows(fs.readFileSync(aseaFile, 'utf8'))];
  const aseaHeader = aseaRows.shift() || [];
  requireColumns(aseaHeader, ['text', 'intent'], aseaFile);
  const textIndex = headerIndex(aseaHeader, 'text');
  const intentIndex = headerIndex(aseaHeader, 'intent');
  for (const values of aseaRows) {
    const intent = String(values[intentIndex] ?? '').trim();
    add(values[textIndex], messageLabel(intent), 'asea');
  }

  for (const [id, file] of [
    ['filipino-spam-sms', 'filipino-spam-sms-dataset.csv'],
    ['filipino-spam-merged', 'filipino-spam-sms-merged.csv'],
    ['sms-spam-collection-dedup', 'sms-spam-collection-dedup.csv'],
  ]) {
    const rows = [...parseCsvRows(fs.readFileSync(path.join(backendRoot, 'datasets', 'external', file), 'utf8'))];
    const header = rows.shift() || [];
    requireColumns(header, ['label'], file);
    const labelIndex = headerIndex(header, 'label');
    const messageIndex = headerIndex(header, 'message');
    const textIndex2 = headerIndex(header, 'text');
    if (messageIndex < 0 && textIndex2 < 0) throw Error(`Missing message/text column in ${file}.`);
    for (const values of rows)
      add(values[messageIndex] ?? values[textIndex2], messageLabel(values[labelIndex]), id);
  }

  const hinglish = readJson(path.join(backendRoot, 'datasets', 'external', 'hinglish-scam-text.json'));
  for (const row of hinglish.rows || []) add(row.text, messageLabel(row.label), 'hinglish');

  const imcFile = path.join(backendRoot, 'datasets', 'external', 'imc25-smishing.csv');
  const imcRows = [...parseCsvRows(fs.readFileSync(imcFile, 'utf8'))];
  const imcHeader = imcRows.shift() || [];
  requireColumns(imcHeader, ['text'], imcFile);
  const textIndex3 = headerIndex(imcHeader, 'text');
  const translationIndex = headerIndex(imcHeader, 'translation');
  for (const values of imcRows) add(values[translationIndex] || values[textIndex3], 'scam', 'imc25');

  const curatedFile = path.join(backendRoot, 'datasets', 'curated', 'message-training.json');
  if (fs.existsSync(curatedFile)) {
    for (const row of readJson(curatedFile).cases) add(row.text, messageLabel(row.label), 'curated-synthetic');
  }

  const rows = [];
  for (const [key, value] of byText) {
    if (value.labels.size !== 1) { textAudit.conflictingMessages++; continue; }
    const category = [...value.labels][0];
    if (!['scam', 'legitimate'].includes(category)) {
      textAudit.excludedCategories[category] = (textAudit.excludedCategories[category] || 0) + 1;
      continue;
    }
    const group = textTemplate(value.value);
    rows.push({ key, group, value: value.value, label: category === 'scam' ? 1 : 0,
      sources: [...value.sources].sort(), split: groupedSplit(group) });
  }
  return rows;
}

function collectUrlRows() {
  const file = path.join(backendRoot, 'datasets', 'PhiUSIIL_Phishing_URL_Dataset.csv');
  const rows = [...parseCsvRows(fs.readFileSync(file, 'utf8'))];
  const header = (rows.shift() || []).map((value) => value.trim());
  requireColumns(header, ['URL', 'label'], file);
  const urlIndex = headerIndex(header, 'URL');
  const labelIndex = headerIndex(header, 'label');
  const byUrl = new Map();
  for (const values of rows) {
    urlAudit.inputRows++;
    const normalized = normalizeUrlValue(values[urlIndex] ?? values[1] ?? '');
    const labelText = String(values[labelIndex] ?? '').trim();
    if (!normalized || !['0', '1'].includes(labelText)) { urlAudit.invalidRows++; continue; }
    const label = labelText === '0' ? 1 : 0;
    const found = byUrl.get(normalized);
    if (!found) byUrl.set(normalized, { value: values[urlIndex] ?? values[1], labels: new Set([label]) });
    else { urlAudit.duplicateRows++; found.labels.add(label); }
  }
  const result = [];
  for (const [normalized, value] of byUrl) {
    if (value.labels.size !== 1) { urlAudit.conflictingUrls++; continue; }
    result.push({
      key: normalized,
      value: value.value.trim().replace(/^"|"$/g, ''),
      label: [...value.labels][0],
      source: 'phiusiil',
      group: urlGroup(normalized),
      split: groupedSplit(urlGroup(normalized)),
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

function buildModel(rows, type, featureFn, vocabLimit, minFeatures, minCoverage) {
  const candidates = [
    { name: 'legacy-feature-ratio', model: trainNaiveBayes(rows, featureFn, vocabLimit) },
    ...(type === 'taglish-intent' ? [{ name: 'tfidf-multinomial-nb', model: trainTfidf(rows, featureFn, vocabLimit) }] : []),
  ];
  for (const candidate of candidates) {
    Object.assign(candidate.model, { minFeatures, minCoverage });
    candidate.validation = selectThreshold(candidate.model, rows, featureFn, { maxFalsePositiveRate });
    candidate.model.threshold = candidate.validation.threshold;
  }
  // Select using validation only. The test set is read afterwards for reporting.
  candidates.sort((a, b) => b.validation.recall - a.validation.recall
    || (b.validation.precision || 0) - (a.validation.precision || 0));
  const selected = candidates[0];
  const counts = { train: 0, validation: 0, test: 0 };
  for (const row of rows) counts[row.split]++;
  const model = {
    version: 2, type,
    method: selected.name,
    classes: type === 'taglish-intent' ? { 0: 'legitimate', 1: 'source-labeled scam' } : { 0: 'legitimate', 1: 'phishing-like' },
    use: 'Advisory review signal; an unflagged sample is not verified safe. Scores are not calibrated probabilities.',
    ...selected.model,
    counts: { total: rows.length, ...counts, vocabularySize: selected.model.vocabularySize,
      trainPositive: selected.model.trainPositive, trainNegative: selected.model.trainNegative },
    evaluation: {
      split: type === 'taglish-intent' ? 'SHA-256 groups of normalized text templates (URLs and numbers masked)' : 'SHA-256 groups of registrable domains (private suffixes included)',
      thresholdSelection: 'Maximum validation recall subject to the configured false-positive-rate ceiling; validation precision breaks ties.',
      targetFalsePositiveRate: maxFalsePositiveRate,
      validation: selected.validation,
      test: evaluateModel(selected.model, rows, featureFn),
      candidates: candidates.map((candidate) => ({ name: candidate.name, selected: candidate === selected,
        validation: candidate.validation, test: evaluateModel(candidate.model, rows, featureFn) })),
      limits: ['Internal source-label evaluation, not measured real-world accuracy.',
        'Templates and domains are grouped, but unseen paraphrases and future campaigns need independent testing.',
        'Unflagged low-coverage cases count as misses for recall, not as evidence of safety.'],
    },
  };
  return { model, stats: counts };
}

function buildTextModel(rows) {
  return buildModel(rows, 'taglish-intent', (text) => smsFeatures(text).features, 6000, 3, .35);
}
function buildUrlModel(rows) {
  return buildModel(rows, 'url-risk-lexical', (url) => urlLexicalFeatures(url)?.features || [], 4000, 6, .45);
}

function buildManifest(textModel, urlModel, textRows, urlRows) {
  const definitions = [
    ['asea', 'datasets/A.S.E.A Taglish scam Dataset.csv', 'active-exact-and-text-model', 'unverified', 'Repository-local Taglish intent corpus. Preserve attribution and review before redistribution.'],
    ['phiusiil', 'datasets/PhiUSIIL_Phishing_URL_Dataset.csv', 'active-exact-and-url-model', 'conflicting', 'Exact URL index plus lexical URL training. Kaggle says CC BY-NC-SA 4.0; UCI/Mendeley say CC BY 4.0. Resolve before redistribution.'],
    ['dataset-phishing', 'datasets/dataset_phishing.csv', 'reference-only', 'CC BY 4.0 (Kaggle listing)', 'Engineered page features with no raw URL string; unavailable at runtime. Not used for training or inference.'],
    ['filipino-spam-sms', 'datasets/external/filipino-spam-sms-dataset.csv', 'legitimate-only-for-scam-model', 'BSD-3-Clause', 'Alexander/Yissuh 2023.'],
    ['filipino-spam-merged', 'datasets/external/filipino-spam-sms-merged.csv', 'legitimate-only-for-scam-model', 'BSD-3-Clause', 'Alexander/Yissuh 2023.'],
    ['imc25-smishing', 'datasets/external/imc25-smishing.csv', 'active-scam-model-positive-only', 'CC BY 4.0', 'IMC 2025 public smishing reports. Positive-only source; translations used where available.'],
    ['hinglish-scam-text', 'datasets/external/hinglish-scam-text.json', 'legitimate-only-for-scam-model', 'CC BY 4.0', 'Anuj Bolewar 2026. English portion overlaps SMS Spam Collection.'],
    ['sms-spam-collection-dedup', 'datasets/external/sms-spam-collection-dedup.csv', 'legitimate-only-for-scam-model', 'SMS Spam Collection v1 terms', 'Custom attribution/no-warranty terms; overlaps the existing SMS model corpus.'],
    ['curated-synthetic', 'datasets/curated/message-training.json', 'active-synthetic-training-pool', 'Project-authored examples', 'Synthetic legitimate/scam examples; spam is excluded. Development augmentation, not independently verified real-world data.'],
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
  const previousManifest = path.join(backendRoot, 'datasets', 'manifest.json');
  if (fs.existsSync(previousManifest)) {
    const ids = new Set(datasets.map((dataset) => dataset.id));
    for (const dataset of readJson(previousManifest).datasets || []) if (!ids.has(dataset.id)) datasets.push(dataset);
  }
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
    trainingAudit: { text: { ...textAudit, partition: partitionAudit(textRows) }, url: { ...urlAudit, partition: partitionAudit(urlRows) } },
    labelPolicy: 'Only explicitly scam-labeled rows train the scam-positive class. Generic spam, Commercial Spam and unknown intent are excluded, not relabeled legitimate. Legitimate rows from spam corpora remain usable.',
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
const challengeFile = path.join(backendRoot, 'datasets', 'curated', 'message-challenge.json');
if (fs.existsSync(challengeFile)) {
  const groups = new Set(textRows.map((row) => row.group));
  const overlaps = readJson(challengeFile).cases.filter((row) => groups.has(textTemplate(row.text)));
  if (overlaps.length) throw Error('Development challenge overlaps training-pool templates. Remove the overlap before training.');
  textAudit.challengeTemplateOverlaps = 0;
}
const text = buildTextModel(textRows);
const url = buildUrlModel(urlRows);
writeJson(path.join(outRoot, 'lib', 'models', 'taglish-intent-model.json'), text.model);
writeJson(path.join(outRoot, 'lib', 'models', 'url-risk-model.json'), url.model);
writeJson(path.join(outRoot, 'datasets', 'manifest.json'), buildManifest(text.model, url.model, textRows, urlRows));
writeJson(path.join(outRoot, 'reports', 'dataset-training.json'), {
  schemaVersion: 1,
  labelPolicy: 'Scam and legitimate are source labels; generic spam and Commercial Spam are excluded from scam training.',
  text: { audit: textAudit, partition: partitionAudit(textRows), method: text.model.method, evaluation: text.model.evaluation },
  url: { audit: urlAudit, partition: partitionAudit(urlRows), evaluation: url.model.evaluation },
  limits: ['No external API calls or private feedback used.', 'Synthetic curated cases are development data, not independent validation.', 'Test metrics assess model components; exact-lookup indexes and full-app rules are not evaluated here.'],
});
console.log(JSON.stringify({
  text: { ...text.stats, threshold: text.model.threshold, evaluation: text.model.evaluation.test },
  url: { ...url.stats, threshold: url.model.threshold, evaluation: url.model.evaluation.test },
}, null, 2));
