import { describe, expect, it } from 'vitest';
import { MISSIONS, localize } from './content.js';
import { PRACTICE_CLUES, splitPracticeMessage } from './inspection.js';

describe('practice message inspection', () => {
  it.each(['en', 'tl', 'taglish'])('preserves every message and locates its teaching cue in %s', (lang) => {
    for (const mission of MISSIONS) for (const [index, step] of mission.steps.entries()) {
      const message = localize(step.message, lang);
      const clue = localize(PRACTICE_CLUES[mission.id][index], lang);
      const parts = splitPracticeMessage(message, clue);
      expect(parts.map((part) => part.text).join('')).toBe(message);
      expect(parts.filter((part) => part.inspectable).map((part) => part.text)).toEqual([clue]);
    }
  });
});
