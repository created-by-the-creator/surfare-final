import { describe, expect, it } from 'vitest';
import { buildHighlightSegments } from './ResultPanel.jsx';

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
});
