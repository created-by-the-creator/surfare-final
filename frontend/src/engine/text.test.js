import { describe, expect, it } from 'vitest';
import { analyzeText, analyzeTextAndUrls } from './text.js';

describe('text evidence offsets', () => {
  it('keeps offsets aligned after URLs are masked', () => {
    const text = 'Send OTP to https://example.com/path now.';
    const { signals } = analyzeText(text);
    const otp = signals.find((signal) => signal.id === 'otp_request');
    expect(otp.evidenceItems).toEqual([{ start: 5, end: 8, text: 'OTP' }]);
    expect(text.slice(5, 8)).toBe('OTP');
  });

  it('does not let a URL mask shift later matches', () => {
    const text = 'Visit https://example.com/a and send OTP now.';
    const { signals } = analyzeText(text);
    const otp = signals.find((signal) => signal.id === 'otp_request');
    const item = otp.evidenceItems[0];
    expect(text.slice(item.start, item.end)).toBe(item.text);
    expect(item.text).toBe('OTP');
  });

  it('attaches URL signals to the URL in the message', () => {
    const url = 'https://gcash.login-example.xyz/verify';
    const text = 'Open ' + url + ' now.';
    const { signals } = analyzeTextAndUrls(text);
    const signal = signals.find((item) => item.id === 'brand_in_subdomain_not_domain');
    const item = signal.evidenceItems[0];
    expect(item.text).toBe('gcash.login-example.xyz');
    expect(text.slice(item.start, item.end)).toBe(item.text);
  });
});
