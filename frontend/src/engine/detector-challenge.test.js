import { describe, expect, it, vi } from 'vitest';
import challenge from '../../../backend/datasets/curated/message-challenge.json';
import { assessContent } from '../../../backend/lib/content-assessment.js';
import { analyzeInput } from './analyze.js';

describe('development challenge through browser and backend signal merging', () => {
  for (const row of challenge.cases) {
    it(`${row.id}: ${row.label} (${row.language})`, async () => {
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) =>
        Response.json(assessContent(JSON.parse(options.body))));
      try {
        const result = await analyzeInput('text', { message: row.text }, { onlineLookup: true });
        if (row.label === 'scam') expect(['suspicious', 'high']).toContain(result.level);
        else if (row.label === 'legitimate') expect(['low', 'unknown']).toContain(result.level);
        else expect(result.level).not.toBe('high');
      } finally { fetch.mockRestore(); }
    });
  }
});
