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

  it('does not highlight ordinary text without evidence', () => {
    const segments = buildHighlightSegments('The school meeting is tomorrow.', { signals: [] });
    expect(segments).toEqual([
      { text: 'The school meeting is tomorrow.', signals: [] },
    ]);
  });
});
