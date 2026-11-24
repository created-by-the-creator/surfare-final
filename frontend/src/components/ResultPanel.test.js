import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResultPanel, { buildHighlightSegments } from './ResultPanel.jsx';
import { translate } from '../i18n/useI18n.js';

it('reports a completed no-match local check without calling the message unsafe or low risk', () => {
  const t = (key, values) => translate('en', key, values);
  const result = { level: 'unknown', checkedText: 'Our meeting is tomorrow at four.', signals: [], aiReview: { status: 'not_checked' } };
  const html = renderToStaticMarkup(createElement(ResultPanel, { status: 'result', result, t }));
  expect(html).toContain(t('result.noLocalWarnings.title'));
  expect(html).not.toContain(t('result.unknown.subtitle'));
  expect(html).not.toContain('treat it as unsafe');
  expect(html).not.toContain('meter-position-low');
  const unreadable = renderToStaticMarkup(createElement(ResultPanel, { status: 'result', result: { ...result, mediaInfo: { uncertainExtraction: true } }, t }));
  expect(unreadable).not.toContain(t('result.noLocalWarnings.title'));
});

it('shows ambiguous visual details and source-note failure reasons independently', () => {
  const t = (key, values) => translate('en', key, values);
  const note = 'The hand looks elongated, but perspective may explain it.';
  const result = {
    level: 'unknown', aiImageOnly: true, signals: [], summaryKey: 'result.imageOrigin.inconclusive',
    imageMetadata: {
      labelKey: 'result.imageMetadata.label.credentialsInvalid', summaryKey: 'result.imageMetadata.summary.credentialsInvalid',
      limitationKey: 'result.imageMetadata.limitation', findings: ['credentials-invalid'], credentialChecks: ['file-mismatch'],
    },
    imageOrigin: {
      labelKey: 'result.imageOrigin.inconclusive', observations: [note], ambiguousObservations: [note], nonClues: [],
      limitationKey: 'result.imageOrigin.limitation',
    },
  };
  const html = renderToStaticMarkup(createElement(ResultPanel, { status: 'result', result, t }));
  expect(html).toContain(note);
  expect(html).toContain(t('result.imageOrigin.ambiguousNote'));
  expect(html).toContain(t('result.imageMetadata.check.file-mismatch'));
  expect(html).not.toContain('We do not show');
  expect(html.indexOf(t('result.imageOrigin.title'))).toBeLessThan(html.indexOf(t('result.imageMetadata.title')));
});

it('shows progress and a caution before revealing the verdict or enabling a report', () => {
  const t = (key, values) => translate('en', key, values);
  const props = { result: { level: 'high', checkedText: 'Send your OTP', signals: [] }, t };
  const pending = renderToStaticMarkup(createElement(ResultPanel, { ...props, status: 'reviewing' }));
  expect(pending).toContain(t('check.progress.wait'));
  expect(pending).toContain(t('check.progress.caution'));
  expect(pending).not.toContain('risk-meter');
  expect(pending).not.toContain('result-save-button');
  const final = renderToStaticMarkup(createElement(ResultPanel, { ...props, status: 'result' }));
  expect(final).toContain('result-save-button');
  expect(final).not.toContain(t('check.progress.wait'));
});

describe('unknown result wording', () => {
  const renderUnknown = (result) => {
    const t = (key, values) => translate('en', key, values);
    return { html: renderToStaticMarkup(createElement(ResultPanel, { status: 'result', result, t })), t };
  };

  it('does not call a long message with no warnings "too little to judge"', () => {
    const { html, t } = renderUnknown({
      level: 'unknown',
      checkedText: 'Hey, are we still meeting at the cafe tomorrow morning?',
      signals: [],
    });
    expect(html).toContain(t('result.unknown.noWarning'));
    expect(html).toContain(t('result.noLocalWarning'));
    expect(html).not.toContain(t('result.unknown.subtitle'));
  });

  it('explains weak warning signs instead of saying there is too little text', () => {
    const { html, t } = renderUnknown({
      level: 'unknown',
      checkedText: 'Open http://example.com when you have a moment',
      signals: [{ id: 'http', evidence: 'http://example.com' }],
    });
    expect(html).toContain(t('result.unknown.withSignals'));
    expect(html).not.toContain(t('result.unknown.subtitle'));
  });

  it('keeps the original wording when there really is very little text', () => {
    const { html, t } = renderUnknown({ level: 'unknown', checkedText: 'Hi.', signals: [] });
    expect(html).toContain(t('result.unknown'));
    expect(html).toContain(t('result.unknown.subtitle'));
  });

  it('keeps the original wording when AI review completed without a verdict', () => {
    const { html, t } = renderUnknown({
      level: 'unknown',
      checkedText: 'Hey, are we still meeting at the cafe tomorrow morning?',
      signals: [],
      aiReview: { status: 'completed' },
    });
    expect(html).toContain(t('result.unknown'));
    expect(html).toContain(t('result.unknown.subtitle'));
  });
});

describe('checked-message highlights', () => {
  it('builds clickable segments for warning evidence', () => {
    const segments = buildHighlightSegments(
      'Send your OTP now. Your account will be blocked today.',
      {
        signals: [
          { id: 'otp_request', evidence: 'OTP' },
          { id: 'threat_loss', evidence: 'blocked today' },
        ],
      },
    );
    expect(segments.filter((segment) => segment.signals.length).map((segment) => segment.text)).toEqual([
      'OTP',
      'blocked today',
    ]);
  });

  it('uses grounded offsets instead of re-searching the message', () => {
    const segments = buildHighlightSegments('Send OTP now.', {
      signals: [{
        id: 'secret',
        label: 'Request for a secret',
        evidence: 'OTP',
        evidenceItems: [{ start: 5, end: 8, text: 'OTP' }],
      }],
    });
    expect(segments.filter((segment) => segment.signals.length).map((segment) => segment.text)).toEqual([
      'OTP',
    ]);
  });

  it('does not highlight joined evidence that is not in the checked message', () => {
    const segments = buildHighlightSegments('Send OTP now. Your account is fine.', {
      signals: [{ id: 'secret', evidence: 'OTP account' }],
    });
    expect(segments.every((segment) => segment.signals.length === 0)).toBe(true);
  });

  it('keeps every signal attached to an overlapping highlight', () => {
    const segments = buildHighlightSegments('Send OTP now.', {
      signals: [
        { id: 'otp_request', evidence: 'OTP' },
        { id: 'secret', evidence: 'OTP', evidenceItems: [{ start: 5, end: 8, text: 'OTP' }] },
      ],
    });
    const highlighted = segments.find((segment) => segment.signals.length);
    expect(highlighted.text).toBe('OTP');
    expect(highlighted.signals.map((signal) => signal.id)).toEqual(['otp_request', 'secret']);
  });

  it('does not highlight ordinary text without evidence', () => {
    const segments = buildHighlightSegments('The school meeting is tomorrow.', { signals: [] });
    expect(segments).toEqual([
      { text: 'The school meeting is tomorrow.', signals: [] },
    ]);
  });

  it('highlights an address-reference warning only where its evidence appears', () => {
    const message = 'Open https://apintoto.com now.';
    const segments = buildHighlightSegments(message, {
      signals: [{
        id: 'reported-gambling-link',
        evidence: 'https://apintoto.com',
        evidenceItems: [{ start: 5, end: 25, text: 'https://apintoto.com' }],
      }],
    });
    expect(segments.filter((segment) => segment.signals.length).map((segment) => segment.text))
      .toEqual(['https://apintoto.com']);
  });

  it('does not highlight online-only signals as message evidence', () => {
    const segments = buildHighlightSegments('Open example.com now.', {
      signals: [
        { id: 'online_match', evidence: 'example.com' },
        {
          id: 'link_in_message',
          evidence: 'example.com',
          evidenceItems: [{ start: 4, end: 15, text: 'example.com' }],
        },
      ],
    });
    const highlighted = segments.filter((segment) => segment.signals.length);
    expect(highlighted.map((segment) => segment.text)).toEqual(['example.com']);
    expect(highlighted[0].signals.map((signal) => signal.id)).toEqual(['link_in_message']);
  });

  it('ignores offsets that do not match the checked message', () => {
    const segments = buildHighlightSegments('Send OTP now.', {
      signals: [{
        id: 'otp_request',
        evidence: 'OTP',
        evidenceItems: [{ start: 0, end: 3, text: 'OTP' }],
      }],
    });
    expect(segments.filter((segment) => segment.signals.length).map((segment) => segment.text))
      .toEqual(['OTP']);
  });
});
