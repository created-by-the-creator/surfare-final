import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { assessContent } from '../lib/content-assessment.js';
import { applySemanticAssessment } from '../lib/semantic-assessment.js';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prototypeRoot = path.resolve(process.argv[2] || 'C:/Users/kaixe/Desktop/surfare-prototype');
const prototype = await import(pathToFileURL(path.join(prototypeRoot, 'lib/content-assessment.js')));
const prototypeSemantic = await import(pathToFileURL(path.join(prototypeRoot, 'lib/semantic-assessment.js')));
const prototypePolicy = await import(pathToFileURL(path.join(prototypeRoot, 'lib/assessment-policy.js')));
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const fixtureGroups = [
  ['current-development-challenge', (await readJson(path.join(workspace, 'backend/datasets/curated/message-challenge.json'))).cases],
  ['prototype-authored-examples', await readJson(path.join(prototypeRoot, 'research/fixtures/sample-cases.json'))],
  ['prototype-ai-smoke', (await readJson(path.join(prototypeRoot, 'tests/fixtures/semantic-smoke.json'))).map((row) => ({ ...row, label: row.expected === 'Low risk' ? 'legitimate' : 'scam' }))],
  ['user-reported-regressions', [
    { id: 'gcash-reminder', label: 'legitimate', text: 'GCash Security Reminder: Never share your OTP with anyone. For more information about protecting your account, visit https://www.gcash.com' },
    { id: 'cash-in-winnings', label: 'scam', text: 'okay lang ba makipag deal ako sayo? Cash in ka 100 ipapanalo kita 7k basta hati tayo 2k sakin 5k sayo' },
  ]],
];
const unique = new Map();
for (const [source, rows] of fixtureGroups) {
  for (const [index, row] of rows.entries()) {
    const key = row.text.trim().replace(/\s+/g, ' ').toLowerCase();
    if (unique.has(key)) { unique.get(key).sources.push(source); continue; }
    unique.set(key, { id: row.id || row.name || `${source}-${index}`, text: row.text, label: row.label, language: row.language || 'Taglish/English', sources: [source] });
  }
}
const levels = { high: 'High risk', suspicious: 'Suspicious', low: 'Low risk', unknown: 'Insufficient evidence' };
const warned = (level) => ['High risk', 'Suspicious'].includes(level);
const brief = (result) => ({ level: levels[result.level] || result.level, score: result.score, tags: (result.indicators || result.signals || []).map((signal) => signal.id) });
const server = await createServer({ root: path.join(workspace, 'frontend'), configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const originalFetch = globalThis.fetch;
const cases = [];
try {
  const { analyzeInput } = await server.ssrLoadModule('/src/engine/analyze.js');
  for (const row of unique.values()) {
    const oldLocal = prototype.assessContent({ text: row.text });
    const currentLocal = assessContent({ text: row.text });
    globalThis.fetch = async url => url === '/api/detect' ? Response.json(currentLocal) : new Response(null, { status: 503 });
    const currentDisplayed = await analyzeInput('text', { message: row.text }, { onlineLookup: true });
    // Feed the same validated benign AI result into both fusion paths. This isolates merging from model quality.
    let sameBenignAi = null;
    if (row.label === 'legitimate') {
      const ai = { status: 'completed', analysis: { level: 'Low risk', summary: 'Benign test control.', recommendation: 'Verify unexpected requests.', findings: [] } };
      const oldMerged = prototypeSemantic.applySemanticAssessment(oldLocal, ai);
      const currentMerged = applySemanticAssessment(currentLocal, ai);
      globalThis.fetch = async url => url === '/api/detect' ? Response.json(currentMerged) : new Response(null, { status: 503 });
      const displayed = await analyzeInput('text', { message: row.text }, { onlineLookup: true });
      sameBenignAi = { prototypeBackend: brief(oldMerged), currentBackend: brief(currentMerged), currentDisplayed: brief(displayed), aiUsedByPrototypePolicy: prototypePolicy.needsAiBackup(oldLocal, { enabled: true, configured: true, online: true }) };
    }
    cases.push({ ...row, prototypeLocal: brief(oldLocal), currentBackendLocal: brief(currentLocal), currentDisplayed: brief(currentDisplayed), sameBenignAi });
  }
} finally { globalThis.fetch = originalFetch; await server.close(); }

function summarize(key, rows = cases) {
  const legitimate = rows.filter((row) => row.label === 'legitimate');
  const scam = rows.filter((row) => row.label === 'scam');
  return {
    count: rows.length, legitimate: legitimate.length, scam: scam.length, spam: rows.filter((row) => row.label === 'spam').length,
    legitimateFlagged: legitimate.filter((row) => warned(row[key].level)).length,
    legitimateAbstained: legitimate.filter((row) => row[key].level === 'Insufficient evidence').length,
    scamsWarned: scam.filter((row) => warned(row[key].level)).length,
    scamsCalledLow: scam.filter((row) => row[key].level === 'Low risk').length,
    scamsAbstained: scam.filter((row) => row[key].level === 'Insufficient evidence').length,
  };
}
const fileComparisons = [];
for (const file of ['assessment-policy.js', 'content-assessment.js', 'assessment.js', 'semantic-assessment.js', 'detection.js', 'scam-signals.js', 'safety-signals.js', 'text-evidence.js', 'sms-features.js', 'models/sms-model.json']) {
  const normalize = (text) => text.replace(/\r\n/g, '\n');
  const a = normalize(await fs.readFile(path.join(prototypeRoot, 'lib', file), 'utf8'));
  const b = normalize(await fs.readFile(path.join(workspace, 'backend/lib', file), 'utf8'));
  fileComparisons.push({ file, identicalIgnoringLineEndings: a === b,
    prototypeSha256: createHash('sha256').update(a).digest('hex'),
    currentSha256: createHash('sha256').update(b).digest('hex'),
  });
}
const report = {
  createdAt: new Date().toISOString(), scope: 'Read-only source comparison and authored development examples; not a production accuracy benchmark. No provider keys read or external requests made.',
  caveats: ['These examples were used during development, so percentages would not estimate real-world accuracy.', 'Offline comparisons do not compare the default AI-enabled prototype against an AI-disabled current app as an accuracy contest.', 'The benign-AI experiment uses the same mocked valid answer only to isolate result merging, not to measure model accuracy.', 'OCR, image pixels, live website reputation and model providers are not accuracy-benchmarked in this report.'],
  summary: Object.fromEntries(['prototypeLocal', 'currentBackendLocal', 'currentDisplayed'].map((key) => [key, summarize(key)])),
  bySource: Object.fromEntries(fixtureGroups.map(([source]) => [source, Object.fromEntries(['prototypeLocal', 'currentBackendLocal', 'currentDisplayed'].map((key) => [key, summarize(key, cases.filter((row) => row.sources.includes(source)))]))])),
  fileComparisons,
  sourceFindings: [
    { finding: 'AI defaults differ', prototype: 'AI enabled automatically when configured; unclear/suspicious checks use meaning review.', current: 'AI help starts off and must be selected; enabling it reviews all supported text/URL/OCR/QR submissions.', files: ['prototype/src/App.tsx:135', 'prototype/src/App.tsx:297', 'frontend/src/App.jsx:172'] },
    { finding: 'Final display uses the completed detector verdict and its retained evidence. The browser runs shared contextual rules when disconnected.' },
    { finding: 'The original SMS model weights are identical', detail: 'The old 97.44% archived score measures a spam/ham classifier, not scam accuracy or the full application. The prototype documentation says its newer detection changes were not accuracy-evaluated.', files: ['prototype/docs/VALIDATION.md:7', 'prototype/README.md:86'] },
    { finding: 'Current OCR retries difficult reads and exposes extraction uncertainty and editable text.' },
    { finding: 'Current image-origin mode checks file provenance offline, then separately reviews pixels when online sharing is selected.' },
    { finding: 'Current version also adds useful detection layers', detail: 'Current backend includes exact reference matches, advisory dataset models, improved protective-advice handling, and cash-in/winnings context rules. These should be evaluated separately from frontend integration faults.', files: ['backend/lib/detection.js', 'backend/lib/scam-signals.js', 'backend/lib/text-evidence.js'] },
  ],
  staleWarningsAfterBenignAi: cases.filter((row) => row.sameBenignAi?.currentBackend.level === 'Low risk' && warned(row.sameBenignAi.currentDisplayed.level)).map((row) => ({ id: row.id, text: row.text, ...row.sameBenignAi })),
  differences: cases.filter((row) => row.prototypeLocal.level !== row.currentDisplayed.level).map((row) => ({ id: row.id, text: row.text, label: row.label, prototype: row.prototypeLocal, currentBackend: row.currentBackendLocal, currentDisplayed: row.currentDisplayed })),
  cases,
};
const output = path.join(workspace, 'backend/reports/prototype-comparison.json');
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: output, count: cases.length, summary: report.summary, staleWarningsAfterBenignAi: report.staleWarningsAfterBenignAi, fileComparisons }, null, 2));
