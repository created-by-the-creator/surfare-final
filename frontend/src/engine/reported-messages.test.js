import { describe, expect, it, vi } from 'vitest';
import { assessContent } from '../../../backend/lib/content-assessment.js';
import { analyzeInput } from './analyze.js';
import { extractUrls } from './text.js';

const reminder = 'GCash Security Reminder: Never share your OTP with anyone. For more information about protecting your account, visit ';
// Contact details are deliberately omitted: the risk is in the offer itself.
const winningsOffer = 'okay lang ba makipag deal ako sayo? Cash in ka 100 ipapanalo kita 7k basta hati tayo 2k sakin 5k sayo';

describe('reported reminder and cash-in offer regressions', () => {
  for (const backendAvailable of [true, false]) {
    const check = async (message) => {
      const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
        if (!backendAvailable) throw Error('Local API unavailable');
        return Response.json(assessContent(JSON.parse(options.body)));
      });
      try { return await analyzeInput('text', { message }, { onlineLookup: backendAvailable }); }
      finally { mock.mockRestore(); }
    };
    for (const link of ['https://www.gcash.com', '[**https://www.gcash.com**](https://www.gcash.com)']) {
      // The first case in a worker parses the local dataset files, which can exceed the default timeout under load.
      it(`does not flag the protective GCash reminder (backend=${backendAvailable}, markdown=${link.startsWith('[')})`, async () => {
        const result = await check(reminder + link);
        expect(['low', 'unknown']).toContain(result.level);
        expect(result.signals.some((signal) => ['money_demand', 'impersonation', 'combo_bonus', 'otp_request', 'invalid_url'].includes(signal.id))).toBe(false);
      }, 30000);
    }
    for (const offer of [winningsOffer, '"' + winningsOffer + ',\\\nName: Example Sender\\\nsearch: @example_sender', 'Cash-in kayo 250. Ipapanalo ko kayo 9k, hati tayo sa kita.']) {
      it(`flags a cash-in request with a controlled-winnings promise (backend=${backendAvailable}, offer=${offer.slice(0, 25)})`, async () => {
        const result = await check(offer);
        expect(result.level).toBe('high');
        expect(result.signals.some((signal) => signal.id === 'winnings-deposit')).toBe(true);
        expect(result.signals.filter((signal) => signal.id === 'winnings-deposit')).toHaveLength(1);
      });
    }
    it(`does not treat a routine cash-in as promised winnings (backend=${backendAvailable})`, async () => {
      const result = await check('Cash in ka 100 para may balance ka sa sarili mong wallet. May resibo ang transaction.');
      expect(result.signals.some((signal) => signal.id === 'winnings-deposit')).toBe(false);
    });
    it(`still flags a separate credential demand using the GCash name (backend=${backendAvailable})`, async () => {
      const result = await check(reminder + 'https://www.gcash.com. But send me your OTP now or your account will be blocked today.');
      expect(result.level).toBe('high');
    });
    it(`still flags an impersonating domain inside a protective reminder (backend=${backendAvailable})`, async () => {
      const result = await check(reminder + 'https://www.gcash.com.attacker.example/login');
      expect(['suspicious', 'high']).toContain(result.level);
    });
  }

  it('extracts the actual URLs from Markdown link formatting', () => {
    expect(extractUrls(reminder + '[**https://www.gcash.com**](https://www.gcash.com)'))
      .toEqual(['https://www.gcash.com', 'https://www.gcash.com']);
  });
});
