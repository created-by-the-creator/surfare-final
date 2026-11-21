import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/useI18n.js';
import { getSuggestedQuestionKeys, getSurfyAnswer } from './templates.js';

describe('Ask Surfy topic matching', () => {
  const english = (key, values) => translate('en', key, values);

  it('does not mistake "Does" for the next-step keyword "do"', () => {
    expect(getSurfyAnswer('Does this work offline?', null, english)).toBe(english('ask.offline.answer'));
  });

  it.each(['en', 'tl', 'taglish'])('answers the matching suggested topic in %s', (language) => {
    const t = (key, values) => translate(language, key, values);
    expect(getSurfyAnswer(t('ask.offline'), null, t)).toBe(t('ask.offline.answer'));
    expect(getSurfyAnswer(t('ask.photo'), null, t)).toBe(t('ask.photo.answer'));
    expect(getSurfyAnswer(t('ask.uncertain'), null, t)).toBe(t('ask.next.unknown'));
  });

  it('asks for a check before explaining warnings, then explains real signals', () => {
    expect(getSurfyAnswer(english('ask.why'), null, english)).toBe(english('ask.noResult'));
    expect(getSurfyAnswer(english('ask.whyClean'), null, english)).toBe(english('ask.noResult'));
    expect(getSurfyAnswer(english('ask.next'), null, english)).toBe(english('ask.noResult'));
    const answer = getSurfyAnswer(
      english('ask.why'),
      {
        level: 'suspicious',
        signals: [{ id: 'urgency', evidence: 'act now' }],
      },
      english,
    );
    expect(answer).toContain(english('signal.urgency'));
    expect(answer).toContain('act now');
  });

  it('uses the detector title instead of exposing a raw signal id', () => {
    const answer = getSurfyAnswer(
      english('ask.why'),
      {
        level: 'high',
        signals: [{
          id: 'made-up-signal',
          label: 'Request for a secret',
          evidence: 'claim now',
        }],
      },
      english,
    );
    expect(answer).toContain('Request for a secret');
    expect(answer).toContain('claim now');
    expect(answer).not.toContain('signal.');
  });

  it('does not invent warning signs when the checked content has none', () => {
    expect(getSurfyAnswer(english('ask.why'), { signals: [] }, english)).toBe(english('ask.why.none'));
    expect(getSurfyAnswer(
      english('ask.why'),
      {
        level: 'high',
        signals: [{ id: 'online_match', evidence: 'example.com' }],
      },
      english,
    )).toBe(english('ask.why.onlyOnline'));
    expect(getSurfyAnswer(
      english('ask.why'),
      { level: 'suspicious', signals: [{ id: 'urgency', weight: 2 }] },
      english,
    )).toBe(english('ask.why.flaggedNoSignals', { level: english('result.suspicious') }));
  });

  it('explains a reported address with its grounded quote', () => {
    const answer = getSurfyAnswer(
      english('ask.why'),
      {
        level: 'high',
        signals: [{ id: 'reported-gambling-link', evidence: 'https://apintoto.com' }],
      },
      english,
    );
    expect(answer).toContain(english('signal.reported-gambling-link'));
    expect(answer).toContain('https://apintoto.com');
    expect(answer).not.toContain('signal.');
  });

  it('explains a clean check without claiming proof', () => {
    const checked = {
      level: 'low',
      onlineNoKnownThreat: true,
      signals: [],
      checkedText: 'https://www.bdo.com.ph',
    };
    expect(getSurfyAnswer(english('ask.whyClean'), checked, english))
      .toBe(english('ask.why.cleanUrl'));

    const offline = {
      level: 'low',
      onlineNoKnownThreat: false,
      signals: [],
      checkedText: 'Hello there, this is a normal message.',
    };
    expect(getSurfyAnswer(english('ask.whyClean'), offline, english))
      .toBe(english('ask.why.cleanOffline'));
  });

  it('suggests questions that match the result and the selected feature', () => {
    const flaggedText = { level: 'suspicious', signals: [], checkedText: 'Send your OTP now' };
    expect(getSuggestedQuestionKeys({ result: flaggedText, activeTab: 'text' }))
      .toEqual(['ask.why', 'ask.next', 'ask.offline', 'ask.uncertain']);

    const cleanLink = {
      level: 'low',
      onlineNoKnownThreat: true,
      signals: [],
      checkedText: 'https://www.bdo.com.ph',
    };
    expect(getSuggestedQuestionKeys({ result: cleanLink, activeTab: 'links' }))
      .toEqual(['ask.whyClean', 'ask.next', 'ask.link', 'ask.offline', 'ask.uncertain']);

    const flaggedQr = { level: 'high', signals: [], checkedText: 'https://example.com' };
    expect(getSuggestedQuestionKeys({ result: flaggedQr, activeTab: 'qr' }))
      .toContain('ask.photo');
    expect(getSuggestedQuestionKeys({ result: flaggedQr, activeTab: 'text' }))
      .not.toContain('ask.photo');
  });
});
