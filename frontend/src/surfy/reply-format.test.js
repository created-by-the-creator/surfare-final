import { describe, expect, it } from 'vitest';
import { formatSurfyReply } from './reply-format.js';

describe('readable Surfy replies', () => {
  it('turns dense prose into a takeaway and individual points without dropping warnings', () => {
    expect(formatSurfyReply('This message asks for your OTP. Keep the code private. Open your usual wallet app to check. This result does not verify the sender.')).toEqual({
      lead: 'This message asks for your OTP.',
      points: ['Keep the code private.', 'Open your usual wallet app to check.', 'This result does not verify the sender.'],
    });
  });
  it('recognizes mixed introductions, bullet markers and numbered steps without blank lines', () => {
    expect(formatSurfyReply('Pause before paying.\n- Verify the sender.\n* Keep your PIN private.\n• Save the conversation.\n1. Open the official app.\n2) Ask trusted support.')).toEqual({
      lead: 'Pause before paying.', points: ['Verify the sender.', 'Keep your PIN private.', 'Save the conversation.', 'Open the official app.', 'Ask trusted support.'],
    });
  });
  it('preserves URLs, decimal scores, unsafe markup and emphasis as inert text', () => {
    const reply = formatSurfyReply('The score is 0.940. Check https://example.com/help.\n- **Do not share** your OTP.\n- <img src=x onerror=alert(1)>');
    expect(reply.lead).toBe('The score is 0.940.');
    expect(reply.points).toContain('Check https://example.com/help.');
    expect(reply.points).toContain('**Do not share** your OTP.');
    expect(reply.points).toContain('<img src=x onerror=alert(1)>');
  });
  it.each(['en', 'tl', 'fil', 'taglish'])('supports short answers and continuations in %s', language => {
    expect(formatSurfyReply('Ilihim ang OTP.', language)).toEqual({ lead: 'Ilihim ang OTP.', points: [] });
    expect(formatSurfyReply('- Check the app\n  you already use.\n\nNo online review was available.', language)).toEqual({ lead: '', points: ['Check the app you already use.', 'No online review was available.'] });
    expect(formatSurfyReply('', language)).toEqual({ lead: '', points: [] });
  });
});
