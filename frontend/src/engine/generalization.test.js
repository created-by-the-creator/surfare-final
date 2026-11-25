import { expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkExtractedContent } from './check-content.js';

const directory = new URL('../../../backend/evaluation/generalization/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', directory), 'utf8'));
it('checks separate message and URL challenges without networking or exact-message exceptions', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Network forbidden'));
  const rows = [];
  try {
    for (const [kind, items] of [['text', cases.messages], ['links', cases.links]]) {
      for (const item of items) {
        const result = await checkExtractedContent(kind, item.text, null, { onlineLookup: false, ai: false });
        const flagged = ['high', 'suspicious'].includes(result.level);
        rows.push({ id: item.id, kind, label: item.label, level: result.level, flagged, signals: result.signals.map(s => s.id) });
        for (const signal of result.signals) for (const evidence of signal.evidenceItems || [])
          if (Number.isInteger(evidence.start)) expect(item.text.slice(evidence.start, evidence.end)).toBe(evidence.text);
      }
    }
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
  const summary = kind => {
    const items = rows.filter(r => r.kind === kind);
    const positive = items.filter(r => ['scam', 'review'].includes(r.label));
    const negative = items.filter(r => ['legitimate', 'no_warning'].includes(r.label));
    return { positive: positive.length, caught: positive.filter(r => r.flagged).length, negative: negative.length, falseAlarms: negative.filter(r => r.flagged).length };
  };
  const report = { provenance: cases.provenance, caseHash: createHash('sha256').update(JSON.stringify(cases)).digest('hex'), messages: summary('text'), links: summary('links'), rows };
  const baseline = process.env.SURFARE_GENERALIZATION_BASELINE === '1';
  writeFileSync(new URL(baseline ? 'baseline.json' : 'latest.json', directory), JSON.stringify(report, null, 2) + '\n');
  if (!baseline) {
    for (const row of rows) expect(row.flagged, `${row.id}: ${row.signals.join(', ')}`).toBe(['scam', 'review'].includes(row.label));
    expect(report.caseHash).toBe(JSON.parse(readFileSync(new URL('baseline.json', directory), 'utf8')).caseHash);
  }
});
