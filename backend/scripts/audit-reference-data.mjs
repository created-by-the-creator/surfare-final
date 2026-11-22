import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { textTemplate } from './lib/dataset-training.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = option('--source', '');
if (!source) throw Error('Pass --source with the downloaded reference-project directory.');
const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.resolve(source);
const read = (file) => fs.readFileSync(path.join(sourceRoot, file), 'utf8');
const jsonl = (file) => read(file).split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
const corpus = jsonl('data/training/corpus.jsonl');
const holdout = jsonl('data/training/test-ph-holdout.jsonl');
const baseline = JSON.parse(read('data/training/ml-baseline.json'));
const manifest = JSON.parse(read('data/training/manifest.json'));
const holdoutGroups = new Set(holdout.map((row) => textTemplate(row.text)));
const sources = {}, groups = new Map();
let invalidRows = 0;
for (const row of corpus) {
  if (typeof row.text !== 'string' || !row.text.trim() || !['SCAM', 'LEGIT'].includes(row.label)) { invalidRows++; continue; }
  const stats = sources[row.source] ||= { rows: 0, labels: {}, channels: {}, licenses: {}, holdoutTemplateOverlaps: 0 };
  stats.rows++;
  for (const [field, value] of [['labels', row.label], ['channels', row.channel], ['licenses', row.license]]) stats[field][value] = (stats[field][value] || 0) + 1;
  const key = textTemplate(row.text);
  if (holdoutGroups.has(key)) stats.holdoutTemplateOverlaps++;
  const found = groups.get(key) || { rows: [], labels: new Set() };
  found.rows.push(row); found.labels.add(row.label); groups.set(key, found);
}
// This is a preparation file. Nothing here is automatically enabled for training.
const expectedLicense = { scamshield: 'mit', 'llmgen-email': 'apache-2.0' };
const candidate = [];
let duplicateTemplatesRemoved = 0, conflictingTemplatesExcluded = 0, holdoutTemplatesExcluded = 0;
for (const [template, group] of groups) {
  if (group.labels.size !== 1) { conflictingTemplatesExcluded++; continue; }
  if (holdoutGroups.has(template)) { holdoutTemplatesExcluded++; continue; }
  const eligible = group.rows.filter((row) => Object.hasOwn(expectedLicense, row.source) && row.license === expectedLicense[row.source]);
  if (!eligible.length) continue;
  duplicateTemplatesRemoved += eligible.length - 1;
  const row = eligible[0];
  candidate.push({ id: `reference-${row.id}`, text: row.text, sourceLabel: row.label, channel: row.channel,
    source: row.source, license: row.license, redacted: Boolean(row.redacted),
    sourceUrl: manifest.sources.find((item) => item.id === row.source)?.license_url,
    status: 'candidate-only-not-enabled-for-training', provenance: 'Third-party reference corpus; see UPSTREAM_NOTICES.txt for source attribution. Labels retained, not independently verified' });
}
const output = path.resolve(option('--out', path.join(root, '.training-candidates/reference-data-review')));
fs.mkdirSync(output, { recursive: true });
const candidatePath = path.join(output, 'candidate.jsonl');
fs.writeFileSync(candidatePath, candidate.map((row) => JSON.stringify(row)).join('\n') + '\n');
fs.copyFileSync(path.join(sourceRoot, 'data/training/THIRD_PARTY_NOTICES.txt'), path.join(output, 'UPSTREAM_NOTICES.txt'));
const report = {
  scope: 'Inspection of the user-provided reference checkout. Existing detectors and training inputs are unchanged.',
  sourceAttribution: 'Project Aghoy prepared corpus; original datasets retain their own notices and terms.',
  corpusRows: corpus.length, holdoutRows: holdout.length, invalidRows, sources, localBaseline: baseline,
  artifacts: { quantizedModelBytes: fs.statSync(path.join(sourceRoot, 'public/models/tinybert-v1/onnx/model_quantized.onnx')).size,
    rootLicenseFilePresent: fs.existsSync(path.join(sourceRoot, 'LICENSE')),
    corpusSha256: createHash('sha256').update(read('data/training/corpus.jsonl')).digest('hex') },
  preparation: { rows: candidate.length, sources: Object.keys(expectedLicense), duplicateTemplatesRemoved, conflictingTemplatesExcluded,
    holdoutTemplatesExcluded, candidatePath: path.relative(root, candidatePath).replaceAll('\\', '/'), enabledForTraining: false,
    excludedDataset: 'SMS PHISHING DATASET.csv remains excluded as requested.' },
  findings: [
    'Saved baseline: test precision 0.9476, recall 0.9064, FPR 0.0228; separate PH holdout recall 0.9791 and FPR 0.0863. These are upstream reports, not reproduced Surfare results.',
    'Training uses source/label stratification, a near-duplicate leakage guard, class weighting, early stopping and validation-only threshold tuning.',
    'train_classifier.py uses sigmoid(class-1 logit); browser text-classification defaults to softmax for two labels. Thresholds need re-evaluation with the actual exported-model scoring.',
    'UCI spam is mapped to SCAM upstream, unlike Surfare\'s distinction between generic spam and source-labeled scams.',
    'sources.ts warns that Tagalog-SMS message-type labels can introduce mislabeled negatives. The downloaded corpus/manifest still contain that source.',
    'The corpus includes CC-BY-NC-SA and no-license sources with upstream project-owner exception notes. Those notes are not evidence of permission from the data rightsholders.',
    'README declares MIT, but this download has no root LICENSE file. No upstream game code, scenario text or model weights were copied into the app.',
  ],
  nextSteps: [
    'Review the separate candidate by channel/source and verify provenance before integration. It is not automatically read by the trainer.',
    'Keep the upstream holdout out of training. Audit its overlap with all existing Surfare sources before calling it independent validation.',
    'Reproduce exported-model scoring, thresholds, false positives and coverage before adopting TinyBERT.',
  ],
};
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/reference-data-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ corpusRows: corpus.length, holdoutRows: holdout.length, candidateRows: candidate.length,
  invalidRows, holdoutTemplatesExcluded, conflictingTemplatesExcluded, enabledForTraining: false }, null, 2));
