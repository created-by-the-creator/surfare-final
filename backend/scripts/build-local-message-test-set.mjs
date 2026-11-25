// Freeze corpus examples before tuning; never train on the generated evaluation files.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCsv } from '../lib/csv-rows.js';

const root = new URL('../evaluation/local-messages/', import.meta.url);
mkdirSync(root, { recursive: true });
const sources = {
  asea: { path: 'datasets/A.S.E.A Taglish scam Dataset.csv', url: 'https://github.com/ChrisThePCGamer/asea-sms-scam-detection', license: 'Unverified; internal research only', trainingOverlap: true },
  filipino: { path: 'datasets/external/filipino-spam-sms-dataset.csv', url: 'https://github.com/Yissuh/Filipino-Spam-SMS-Detection-Model', license: 'BSD-3-Clause (repository manifest)', trainingOverlap: true },
};
const rows = Object.fromEntries(Object.entries(sources).map(([key, source]) => {
  const bytes = readFileSync(new URL(`../${source.path}`, import.meta.url));
  source.sha256 = createHash('sha256').update(bytes).digest('hex');
  return [key, parseCsv(bytes.toString('utf8')).map((row, index) => ({ ...row, record: index + 2 }))];
}));
function redact(text) {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<EMAIL>')
    .replace(/\b(?:\+?63|0)9[\d* -]{8,13}\b/g, '<PHONE>')
    .replace(/\b\d{4,}\b/g, '<NUMBER>')
    .replace(/Rider:[^,\n]+/gi, 'Rider:<NAME>')
    .replace(/\b(?:Ms\.?|Mr\.?)\s*[A-Z][a-z]+/g, '<NAME>')
    .replace(/\s+/g, ' ').trim();
}
const cases = [], seen = new Set();
function take(source, label, category, count, accept) {
  let added = 0;
  for (const row of rows[source]) {
    if (!accept(row)) continue;
    const text = redact(row.text || row.message);
    const template = text.toLowerCase().replace(/(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/g, '<url>').replace(/\d+/g, '#');
    if (seen.has(template)) continue;
    seen.add(template);
    cases.push({ id: `${label === 'scam' ? 'S' : 'L'}${String(cases.filter(c => c.label === label).length + 1).padStart(3, '0')}`, label, category, text, provenance: 'corpus-reported', source, sourceRecord: row.record, originalLabel: row.intent || row.label, trainingOverlap: true, labelStatus: 'source label; sender authenticity not independently verified' });
    if (++added === count) break;
  }
  if (added < count) throw Error(`${category}: only ${added}/${count} distinct cases`);
}
take('asea', 'scam', 'parcel-delivery', 15, r => r.intent === 'Delivery Scam' && /(?:https?:\/\/|\.[a-z]{2,}\b)/i.test(r.text) && !/was delivered|scheduled for delivery/i.test(r.text));
take('asea', 'scam', 'account-lock-phishing', 15, r => /Bank(?:ing)? Scam/.test(r.intent) && /suspend|login|verify|security|update|validat|locked|restricted/i.test(r.text) && /(?:https?:\/\/|\.[a-z]{2,}\b)/i.test(r.text));
take('asea', 'scam', 'task-job', 10, r => r.intent === 'Job Scam' && r.text.length > 60);
take('asea', 'scam', 'prize', 10, r => r.intent === 'Prize Scam' && /claim|premyo|redeem|received|maglagay|natanggap|number mo/i.test(r.text));
take('filipino', 'legitimate', 'otp-security', 12, r => r.label === 'ham' && /OTP|verification code|security code|confirmation code|authentication|one-time/i.test(r.message) && r.message.length > 40);
take('filipino', 'legitimate', 'shopping-delivery', 5, r => r.label === 'ham' && /delivery|parcel|lazada|shopee/i.test(r.message) && !/OTP|password|bill for account/i.test(r.message));
take('filipino', 'legitimate', 'ordinary-notice', 18, r => r.label === 'ham' && r.message.length >= 55 && !/cashbee|loan is waiting|NCA888/i.test(r.message));
take('asea', 'legitimate', 'school-family-work', 15, r => r.intent === 'HAM' && r.text.length >= 25 && !/(?:https?:\/\/|\.[a-z]{2,}\b)/i.test(r.text));
const dataset = { version: 1, frozenAt: '2026-11-25', scope: 'Development regression set: 50 corpus-labeled scams and 50 corpus-labeled legitimate messages. Not an independent accuracy benchmark; source corpora overlap training/reference data. Text is redacted; source labels can be noisy.', sources, cases };
writeFileSync(new URL('messages.json', root), JSON.stringify(dataset, null, 2) + '\n');
const csv = [ ['id','label','category','text','source','source_record','provenance','training_overlap','label_status'], ...cases.map(c => [c.id,c.label,c.category,c.text,c.source,c.sourceRecord,c.provenance,c.trainingOverlap,c.labelStatus]) ];
writeFileSync(new URL('messages.csv', root), '\uFEFF' + csv.map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n') + '\r\n');
console.log(`Saved ${cases.length} cases to backend/evaluation/local-messages/`);
