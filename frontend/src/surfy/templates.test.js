import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/useI18n.js';
import { getSuggestedQuestionKeys, getSuggestedSignalQuestions, getSurfyAnswer, getSurfyResultMessage } from './templates.js';
import { analyzeInput } from '../engine/analyze.js';
import { getDisplaySignals, getSignalExplanation, getSignalLabel } from '../engine/signal-display.js';

describe('Ask Surfy topic matching', () => {
  const english = (key, values) => translate('en', key, values);

  it('does not mistake "Does" for the next-step keyword "do"', () => {
    expect(getSurfyAnswer('Does this work offline?', null, english)).toBe(english('ask.offline.answer'));
  });

  it.each(['en', 'tl', 'taglish'])('answers the matching suggested topic in %s', (language) => {
    const t = (key, values) => translate(language, key, values);
    expect(getSurfyAnswer(t('ask.offline'), null, t)).toBe(t('ask.offline.answer'));
    expect(getSurfyAnswer(t('ask.photo'), null, t)).toBe(t('ask.photo.answer'));
    expect(getSurfyAnswer(t('ask.uncertain'), null, t)).toBe(t('ask.uncertain.answer'));
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

  it('gives AI-specific next steps instead of scam advice for an image result', () => {
    const imageResult = {
      level: 'unknown',
      imageMetadata: { labelKey: 'result.imageMetadata.label.none' },
      imageOrigin: { labelKey: 'result.imageOrigin.strong' },
    };
    expect(getSurfyAnswer(english('ask.next'), imageResult, english))
      .toBe(english('ask.next.aiImageClues'));
    expect(getSurfyAnswer(english('ask.next'), { ...imageResult, imageOrigin: null }, english))
      .toBe(english('ask.next.aiImageNone'));
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

describe('Surfy explanations follow the actual check', () => {
  it.each(['en', 'tl', 'taglish'])('explains each real tag and its risk in %s', async (language) => {
    const t = (key, values) => translate(language, key, values);
    const result = await analyzeInput('text', { message: 'Send your OTP now. Your account will be blocked today.' }, { onlineLookup: false });
    expect(['high', 'suspicious']).toContain(result.level);
    const opening = getSurfyResultMessage(result, t);
    const questions = getSuggestedSignalQuestions(result, t);
    expect(questions.length).toBeGreaterThan(0);
    for (const [index, question] of questions.entries()) {
      const signal = getDisplaySignals(result)[index];
      const answer = getSurfyAnswer(question.text, result, t);
      expect(answer).toContain(getSignalLabel(signal, t));
      expect(answer).toContain(signal.evidenceItems[0].text.slice(0, 60));
      expect(answer).toContain(getSignalExplanation(signal, t));
    }
    expect(opening).toContain(t(`result.${result.level}`));
    expect(opening).toContain(t('signalHelp.codes'));
  });

  it('explains a typed OTP question without mixing in unrelated warning tags', () => {
    const t = (key, values) => translate('en', key, values);
    const result = { level: 'high', signals: [{ id: 'otp_request', evidence: 'send OTP' }, { id: 'money_demand', evidence: 'pay 100' }] };
    for (const question of ['What does OTP mean?', 'Why is OTP tagged?', 'bakit may OTP warning?']) {
      const answer = getSurfyAnswer(question, result, t);
      expect(answer).toContain('send OTP');
      expect(answer).toContain(t('signalHelp.codes'));
      expect(answer).not.toContain('pay 100');
    }
  });

  it('does not invent an OTP warning for a protective GCash reminder', async () => {
    const t = (key, values) => translate('en', key, values);
    const result = await analyzeInput('text', { message: 'GCash Security Reminder: Never share your OTP with anyone. For more information about protecting your account, visit https://www.gcash.com' }, { onlineLookup: false });
    expect(['low', 'unknown']).toContain(result.level);
    expect(getSurfyAnswer('Why is OTP tagged?', result, t)).toBe(t('ask.signalNotFound'));
    expect(getSurfyResultMessage(result, t)).not.toContain(t('signalHelp.codes'));
  });

  it('explains the actual money-offer findings instead of counting tags', async () => {
    const t = (key, values) => translate('en', key, values);
    const result = await analyzeInput('text', { message: 'okay lang ba makipag deal ako sayo? Cash in ka 100 ipapanalo kita 7k basta hati tayo 2k sakin 5k sayo' }, { onlineLookup: false });
    expect(['high', 'suspicious']).toContain(result.level);
    const answer = getSurfyResultMessage(result, t);
    expect(answer).toContain(t('signalHelp.money'));
    expect(answer).not.toContain('Ask me anything');
  });

  it('does not imply an unknown check is clear', () => {
    const t = (key, values) => translate('en', key, values);
    const answer = getSurfyResultMessage({ level: 'unknown', signals: [] }, t);
    expect(answer).toBe(t('ask.uncertain.answer'));
    expect(getSuggestedQuestionKeys({ result: { level: 'unknown' } })[0]).toBe('ask.uncertain');
  });

  it('includes the image observations and any unavailable-check notice', () => {
    const t = (key, values) => translate('en', key, values);
    const result = { level: 'unknown', signals: [], imageMetadata: { labelKey: 'result.imageMetadata.label.none', summaryKey: 'result.imageMetadata.summary.none' }, imageOrigin: { labelKey: 'result.imageOrigin.possible', observations: ['The lettering bends unevenly.'] } };
    expect(getSurfyAnswer('Explain the result', result, t)).toContain('The lettering bends unevenly.');
    expect(getSurfyAnswer('Explain the result', result, t)).toContain(t(result.imageMetadata.summaryKey));
    const unavailable = { ...result, imageOrigin: null, imageVisualNoteKey: 'result.imageMetadata.visualUnavailable' };
    expect(getSurfyResultMessage(unavailable, t)).toContain(t(unavailable.imageVisualNoteKey));
  });

  it('uses the new result after a suspicious check, without carrying over old warnings', () => {
    const t = (key, values) => translate('en', key, values);
    getSurfyResultMessage({ level: 'high', signals: [{ id: 'otp_request', evidence: 'OTP' }] }, t);
    const clean = { level: 'low', signals: [], checkedText: 'See you tomorrow.' };
    expect(getSurfyResultMessage(clean, t)).toBe(t('ask.why.cleanOffline'));
    expect(getSurfyAnswer('Why is OTP tagged?', clean, t)).toBe(t('ask.signalNotFound'));
  });

  it('keeps privacy questions separate from warning explanations', () => {
    const t = (key, values) => translate('en', key, values);
    expect(getSurfyAnswer('Do you save my photo with the OTP?', { level: 'high', signals: [{ id: 'otp_request', evidence: 'OTP' }] }, t)).toBe(t('ask.photo.answer'));
  });
});
