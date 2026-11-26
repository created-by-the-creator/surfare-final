import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { checkExtractedContent } from './check-content.js';
import { getSignalLabel, getSignalExplanation } from './signal-display.js';
import { translate } from '../i18n/useI18n.js';

const cases = JSON.parse(readFileSync(new URL('../../../backend/tests/fixtures/expected-local-checks.json', import.meta.url), 'utf8'));

it('matches all Expected labels in the browser with AI and networking disabled', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Network forbidden'));
  try {
    for (const item of cases) {
      const result = await checkExtractedContent(item.kind === 'link' ? 'links' : 'text', item.text, null, { onlineLookup: false, ai: false });
      expect(result.level, item.id).toBe(item.expected === 'High risk' ? 'high' : 'low');
      expect(result.aiReview.status).toBe('not_checked');
      for (const signal of result.signals) {
        for (const evidence of signal.evidenceItems || [])
          expect(item.text.slice(evidence.start, evidence.end)).toBe(evidence.text);
        for (const language of ['en', 'tl', 'taglish']) {
          const t = key => translate(language, key);
          expect(getSignalLabel(signal, t)).not.toMatch(/^signal\./);
          expect(getSignalExplanation(signal, t)).not.toBe('');
        }
      }
    }
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
});
