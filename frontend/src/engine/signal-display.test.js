import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/useI18n.js';
import {
  getDisplaySignals,
  getSignalLabel,
  groundSignals,
} from './signal-display.js';

describe('signal display helpers', () => {
  const t = (key, values) => translate('en', key, values);

  it('keeps only evidence that appears in the checked message', () => {
    const [signal] = groundSignals([{
      id: 'sms-pattern',
      title: 'Pattern found in unwanted messages',
      evidenceItems: [{ text: 'claim now' }, { text: 'not in this text' }],
      evidence: '',
    }], 'Please claim now.');

    expect(signal.evidenceItems).toEqual([
      { start: 7, end: 16, text: 'claim now' },
    ]);
    expect(signal.evidence).toBe('claim now');
  });

  it('uses a plain detector title when an id has no translation', () => {
    expect(getSignalLabel({ id: 'made-up-signal', title: 'Request for a secret' }, t))
      .toBe('Request for a secret');
  });

  it('never shows a raw signal key', () => {
    expect(getSignalLabel({ id: 'violence', title: 'signal.violence' }, t))
      .toBe(t('signal.violence'));
    expect(t('signal.violence')).toBe('The message contains texts that show violence.');
  });

  it('excludes online-only and ungrounded signals from explanations', () => {
    const signals = groundSignals([
      { id: 'online_match', evidence: 'example.com' },
      { id: 'otp_request', evidence: 'OTP' },
      { id: 'secret', evidence: 'something we cannot see' },
    ], 'Send OTP now at example.com.');

    expect(getDisplaySignals({ signals }).map((signal) => signal.id))
      .toEqual(['otp_request']);
  });

  it('uses plain generic labels for brand and lookalike addresses', () => {
    expect(getSignalLabel({ id: 'brand-gcash', label: 'GCash name in address' }, t))
      .toBe(t('signal.brand-imitation-link'));
    expect(getSignalLabel({ id: 'lookalike-paypa1', title: 'Similar to PayPal' }, t))
      .toBe(t('signal.lookalike-link'));
  });

  it('labels address reference warnings without backend wording', () => {
    for (const id of [
      'dataset-url-match',
      'reported-gambling-link',
      'unlisted-gambling-link',
      'watchlisted-gambling-link',
      'fake-regulator-link',
      'stopped-lender',
    ]) {
      const label = getSignalLabel({ id }, t);
      expect(label).not.toBe(`signal.${id}`);
      expect(label.toLowerCase()).not.toContain('dataset');
      expect(label).not.toContain('signal.');
    }
  });
});
