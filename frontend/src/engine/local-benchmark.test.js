import { expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkExtractedContent } from './check-content.js';

const directory = new URL('../../../backend/evaluation/local-messages/', import.meta.url);
const dataset = JSON.parse(readFileSync(new URL('messages.json', directory), 'utf8'));
const supplemental = JSON.parse(readFileSync(new URL('supplemental.json', directory), 'utf8'));

it('runs the frozen local message set offline and prevents new misses or false alarms', async () => {
  expect(dataset.cases.filter(c => c.label === 'scam')).toHaveLength(50);
  expect(dataset.cases.filter(c => c.label === 'legitimate')).toHaveLength(50);
  expect(new Set(dataset.cases.map(c => c.text)).size).toBe(100);
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Network forbidden in offline benchmark'));
  const results = [];
  try {
    for (const item of [...dataset.cases, ...supplemental.cases]) {
      const result = await checkExtractedContent('text', item.text, null, { onlineLookup: false, ai: false });
      const warned = ['high', 'suspicious'].includes(result.level);
      results.push({ id: item.id, label: item.label, category: item.category, level: result.level, warned, signals: result.signals.map(s => s.id) });
    }
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
  const core = results.filter(r => !r.id.startsWith('X'));
  const scams = core.filter(r => r.label === 'scam');
  const legitimate = core.filter(r => r.label === 'legitimate');
  const report = {
    datasetSha256: createHash('sha256').update(JSON.stringify(dataset.cases)).digest('hex'),
    scope: dataset.scope, total: core.length,
    scams: { total: scams.length, caught: scams.filter(r => r.warned).length, missed: scams.filter(r => !r.warned).length, calledLowRisk: scams.filter(r => r.level === 'low').length },
    legitimate: { total: legitimate.length, falseAlarms: legitimate.filter(r => r.warned).length, lowRisk: legitimate.filter(r => r.level === 'low').length, uncertain: legitimate.filter(r => r.level === 'unknown').length },
    results: core,
    supplemental: { scope: supplemental.scope, results: results.filter(r => r.id.startsWith('X')) },
  };
  const baselineUrl = new URL('baseline.json', directory);
  writeFileSync(new URL(process.env.SURFARE_FREEZE_BASELINE === '1' ? 'baseline.json' : 'latest.json', directory), JSON.stringify(report, null, 2) + '\n');
  if (process.env.SURFARE_FREEZE_BASELINE !== '1') {
    const csv = [['id', 'source_label', 'category', 'text', 'verdict', 'flagged', 'signals'], ...dataset.cases.map(item => {
      const result = core.find(row => row.id === item.id);
      return [item.id, item.label, item.category, item.text, result.level, result.warned, result.signals.join('; ')];
    })];
    writeFileSync(new URL('results.csv', directory), '\uFEFF' + csv.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n');
  }
  console.log(JSON.stringify({ scams: report.scams, legitimate: report.legitimate }));
  if (existsSync(baselineUrl)) {
    const baseline = JSON.parse(readFileSync(baselineUrl, 'utf8'));
    expect(report.datasetSha256, 'Frozen cases changed; review and version the dataset rather than replacing labels silently').toBe(baseline.datasetSha256);
    const acceptedUrl = new URL('accepted.json', directory);
    const accepted = process.env.SURFARE_FREEZE_BASELINE !== '1' && existsSync(acceptedUrl)
      ? JSON.parse(readFileSync(acceptedUrl, 'utf8')) : null;
    if (accepted) expect(accepted.datasetSha256).toBe(report.datasetSha256);
    for (const previous of [...baseline.results, ...(accepted?.results || [])]) {
      const current = results.find(r => r.id === previous.id);
      if (previous.label === 'scam' && previous.warned) expect(current.warned, `${previous.id}: newly missed scam`).toBe(true);
      if (previous.label === 'legitimate' && !previous.warned) expect(current.warned, `${previous.id}: new false alarm`).toBe(false);
    }
  }
});
