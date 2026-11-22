import fs from 'node:fs';
import path from 'node:path';
import { assessContent } from '../lib/content-assessment.js';
import { classifyTaglishIntent } from '../lib/dataset-models.js';
import { smsFeatures } from '../lib/sms-features.js';
import { scoreFeatures } from '../lib/model-scoring.js';
import { textTemplate } from './lib/dataset-training.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const file = path.resolve(option('--cases', path.join(root, 'datasets/curated/message-challenge.json')));
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(data.cases) || !data.cases.length) throw Error('Expected a nonempty cases array.');
const seen = new Set();
const allowed = new Set(['legitimate', 'scam', 'spam']);
for (const row of data.cases) {
  if (!row.id || seen.has(row.id) || !allowed.has(row.label) || !row.text?.trim()
    || !['English', 'Filipino', 'Taglish'].includes(row.language)) throw Error('Invalid or duplicate challenge case.');
  seen.add(row.id);
}
const trainingFile = path.join(root, 'datasets/curated/message-training.json');
const trainingGroups = new Set(JSON.parse(fs.readFileSync(trainingFile, 'utf8')).cases.map((row) => textTemplate(row.text)));
if (data.cases.some((row) => trainingGroups.has(textTemplate(row.text)))) throw Error('Challenge overlaps curated training templates.');
const candidatePath = option('--candidate', '');
const candidate = candidatePath ? JSON.parse(fs.readFileSync(path.resolve(candidatePath), 'utf8')) : null;
const results = data.cases.map((row) => {
  const result = assessContent({ text: row.text });
  return {
    id: row.id, label: row.label, language: row.language, level: result.level,
    alert: ['High risk', 'Suspicious'].includes(result.level),
    abstained: result.level === 'Insufficient evidence',
    indicators: result.indicators.map((indicator) => indicator.id),
    currentModelFlagged: classifyTaglishIntent(row.text).flagged,
    currentModelAbstained: classifyTaglishIntent(row.text).abstained,
    ...(candidate ? { candidateModelFlagged: scoreFeatures(candidate, smsFeatures(row.text).features).flagged,
      candidateModelAbstained: scoreFeatures(candidate, smsFeatures(row.text).features).abstained } : {}),
  };
});
function summarize(rows, key = 'alert') {
  const scams = rows.filter((row) => row.label === 'scam');
  const legitimate = rows.filter((row) => row.label === 'legitimate');
  const spam = rows.filter((row) => row.label === 'spam');
  const tp = scams.filter((row) => row[key]).length;
  const fp = legitimate.filter((row) => row[key]).length;
  return {
    count: rows.length, scamCount: scams.length, legitimateCount: legitimate.length, spamCount: spam.length,
    tp, fp, missedScams: scams.length - tp,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: scams.length ? tp / scams.length : null,
    falsePositiveRate: legitimate.length ? fp / legitimate.length : null,
    abstained: rows.filter((row) => key === 'alert' ? row.abstained : row[key.replace('Flagged', 'Abstained')]).length,
    commercialSpamHighRisk: spam.filter((row) => row.level === 'High risk').length,
  };
}
const report = {
  provenance: data.provenance,
  limitations: ['Synthetic development challenge, not independent real-world validation.',
    'This checks text after extraction; it does not measure OCR accuracy or AI-image provenance.',
    'No external AI or reputation calls are made. Insufficient evidence remains an abstention, not a safe verdict.',
    'Candidate model flags are component signals, not predictions of full-app behavior.'],
  overall: summarize(results),
  byLanguage: Object.fromEntries(['English', 'Filipino', 'Taglish'].map((language) => [language, summarize(results.filter((row) => row.language === language))])),
  modelComponents: { current: summarize(results, 'currentModelFlagged'), ...(candidate ? { candidate: summarize(results, 'candidateModelFlagged') } : {}) },
  rows: results,
};
const output = path.resolve(option('--out', path.join(root, 'reports/detector-challenge.json')));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
