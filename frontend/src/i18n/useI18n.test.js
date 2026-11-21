import { describe, expect, it } from 'vitest';
import { hasTranslation, translate } from './useI18n.js';

describe('translations', () => {
  it('never exposes a missing translation key to the user', () => {
    expect(hasTranslation('en', 'signal.not-a-real-key')).toBe(false);
    expect(translate('en', 'signal.not-a-real-key'))
      .toBe(translate('en', 'fallback.missing'));
  });

  it('keeps existing translated labels intact', () => {
    expect(hasTranslation('tl', 'signal.urgency')).toBe(true);
    expect(translate('tl', 'signal.urgency'))
      .toBe('Pinipilit ka ng mensahe na kumilos agad.');
  });

  it('uses plain wording for contextual and highlighted labels', () => {
    expect(translate('en', 'signal.violence'))
      .toBe('The message contains texts that show violence.');
    expect(translate('en', 'signal.matched_phrase'))
      .toBe('These words stood out.');
  });

  it('provides plain address-reference labels in every language', () => {
    const keys = [
      'signal.dataset-url-match',
      'signal.brand-imitation-link',
      'signal.lookalike-link',
      'signal.reported-gambling-link',
      'signal.unlisted-gambling-link',
      'signal.watchlisted-gambling-link',
      'signal.fake-regulator-link',
      'signal.stopped-lender',
    ];
    for (const language of ['en', 'tl', 'taglish']) {
      for (const key of keys) {
        expect(hasTranslation(language, key)).toBe(true);
        const label = translate(language, key);
        expect(label).not.toBe(key);
        expect(label.toLowerCase()).not.toContain('dataset');
        expect(label).not.toContain('signal.');
      }
    }
  });
});
