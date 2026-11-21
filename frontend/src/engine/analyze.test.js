import { describe, expect, it, vi } from 'vitest';
import { analyzeInput } from './analyze.js';

describe('analyzeInput', () => {
  it('classifies a message with an OTP and account threat as high risk', async () => {
    const result = await analyzeInput(
      'text',
      { message: 'Send your OTP now. Your account will be blocked today.' },
      { onlineLookup: false },
    );

    expect(result.level).toBe('high');
    expect(result.signals.map((signal) => signal.id)).toContain('otp_request');
  });

  it('keeps ordinary, sufficiently detailed text at low risk', async () => {
    const result = await analyzeInput(
      'text',
      { message: 'The school meeting has moved to Thursday afternoon at two.' },
      { onlineLookup: false },
    );

    expect(result.level).toBe('low');
    expect(result.signals).toHaveLength(0);
  });

  it('does not make a URL request when offline-only checks are selected', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');

    try {
      const result = await analyzeInput(
        'links',
        { url: 'example.com/help' },
        { onlineLookup: false },
      );

      expect(result.usedOnline).toBe(false);
      expect(result.onlineUnavailable).toBe(false);
      expect(fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/check-url'),
        expect.anything(),
      );
    } finally {
      fetch.mockRestore();
    }
  });

  it('returns an insufficient-information result for short text', async () => {
    const result = await analyzeInput(
      'text',
      { message: 'Hi.' },
      { onlineLookup: false },
    );

    expect(result.level).toBe('unknown');
  });

  it('shows evidence supplied by dataset indicators', async () => {
    const detectorResponse = {
      level: 'High risk',
      score: 5,
      summary: 'Review signal.',
      recommendation: 'Verify independently.',
      indicators: [
        {
          id: 'dataset-text-match',
          title: 'Known suspicious pattern',
          message: 'Similar to a labeled scam message.',
          weight: 5,
          evidence: [{ text: 'claim now' }],
          category: 'dataset',
        },
      ],
    };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => detectorResponse,
    });

    try {
      const result = await analyzeInput(
        'text',
        { message: 'Please claim now.' },
        { onlineLookup: false },
      );
      const signal = result.signals.find((item) => item.id === 'dataset-text-match');
      expect(signal?.evidence).toBe('claim now');
      expect(signal?.evidenceItems).toEqual([
        { start: 7, end: 16, text: 'claim now' },
      ]);
      expect(result.datasetIntent).toBeUndefined();
    } finally {
      fetch.mockRestore();
    }
  });

  it('keeps evidence from new address-reference indicators', async () => {
    const detectorResponse = {
      level: 'High risk',
      score: 5,
      summary: 'Review signal.',
      recommendation: 'Verify independently.',
      indicators: [
        {
          id: 'reported-gambling-link',
          title: 'Reported gambling link',
          message: 'Regulator warning.',
          weight: 5,
          evidence: [{ start: 5, end: 25, text: 'https://apintoto.com' }],
          category: 'link',
        },
        {
          id: 'stopped-lender',
          title: 'Loan service ordered to stop',
          message: 'Regulator action.',
          weight: 5,
          evidence: [{ start: 9, end: 15, text: 'CashAB' }],
          category: 'scam',
        },
      ],
    };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => detectorResponse,
    });

    try {
      const result = await analyzeInput(
        'text',
        { message: 'Open https://apintoto.com now. CashAB loan' },
        { onlineLookup: false },
      );
      const gambling = result.signals.find((item) => item.id === 'reported-gambling-link');
      const lender = result.signals.find((item) => item.id === 'stopped-lender');
      expect(gambling?.evidence).toBe('https://apintoto.com');
      expect(gambling?.evidenceItems).toEqual([
        { start: 5, end: 25, text: 'https://apintoto.com' },
      ]);
      expect(lender?.evidence).toBe('CashAB');
      expect(lender?.evidenceItems).toEqual([
        { start: 31, end: 37, text: 'CashAB' },
      ]);
    } finally {
      fetch.mockRestore();
    }
  });

  it('suppresses a weak lookalike warning after a clean online check', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        level: 'Low risk',
        score: 0,
        summary: 'No reported threat.',
        indicators: [],
        onlineNoKnownThreat: true,
        onlineVerification: {
          status: 'completed',
          results: [{ url: 'https://gcas1.com/login', threats: [] }],
        },
      }),
    });

    try {
      const result = await analyzeInput('links', { url: 'https://gcas1.com/login' });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetch.mock.calls[0][1].body).online).toBe(true);
      expect(result.onlineNoKnownThreat).toBe(true);
      expect(result.signals.some((signal) => /^(?:brand[-_]|lookalike[-_]|dataset-url-model$)/.test(signal.id))).toBe(false);
      expect(result.level).not.toBe('suspicious');
    } finally {
      fetch.mockRestore();
    }
  });

  it('keeps an unlisted gambling warning after a clean online check', async () => {
    const url = 'https://yyphs8i.com/#/cashwheel?a=0twbf7dc';
    const message = `Play at ${url} now`;
    const start = message.indexOf(url);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        level: 'Suspicious',
        score: 2,
        summary: 'Review signal.',
        indicators: [
          {
            id: 'unlisted-gambling-link',
            title: 'Gambling site not on PAGCOR list',
            message: 'Gambling address not on the published registered list.',
            weight: 2,
            evidence: [{ start, end: start + url.length, text: url }],
            category: 'link',
          },
        ],
        onlineVerification: {
          status: 'completed',
          results: [{ url, threats: [] }],
        },
      }),
    });

    try {
      const result = await analyzeInput('text', { message });
      expect(result.onlineNoKnownThreat).toBe(true);
      expect(result.signals.some((signal) => signal.id === 'unlisted-gambling-link')).toBe(true);
      expect(result.level).toBe('suspicious');
    } finally {
      fetch.mockRestore();
    }
  });

  it('keeps a locally reviewed gambling warning after a clean online check', async () => {
    const url = 'https://www.mpjl.run/register?affiliateCode=agmtrqv86z15287b6001';
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        level: 'Suspicious',
        score: 2,
        summary: 'Review signal.',
        indicators: [
          {
            id: 'watchlisted-gambling-link',
            title: 'Reported gambling site',
            message: 'Reported for review.',
            weight: 2,
            evidence: [{ start: 0, end: url.length, text: url }],
            category: 'link',
          },
        ],
        onlineVerification: {
          status: 'completed',
          results: [{ url, threats: [] }],
        },
      }),
    });

    try {
      const result = await analyzeInput('links', { url });
      expect(result.onlineNoKnownThreat).toBe(true);
      expect(result.signals.some((signal) => signal.id === 'watchlisted-gambling-link')).toBe(true);
      expect(result.level).toBe('suspicious');
    } finally {
      fetch.mockRestore();
    }
  });

  it('keeps the lookalike warning when the online check is unavailable', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        level: 'Suspicious',
        score: 3,
        summary: 'Review signal.',
        indicators: [],
        onlineVerification: { status: 'unavailable' },
      }),
    });

    try {
      const result = await analyzeInput('links', { url: 'https://gcas1.com/login' });
      expect(result.onlineNoKnownThreat).toBe(false);
      expect(result.signals.some((signal) => /^lookalike[-_]/.test(signal.id))).toBe(true);
    } finally {
      fetch.mockRestore();
    }
  });

  it('adds an online warning when the API reports a known threat', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        level: 'High risk',
        score: 0,
        summary: 'Reported unsafe URL.',
        indicators: [],
        onlineVerification: {
          status: 'completed',
          results: [{ url: 'https://gcas1.com/login', threats: ['SOCIAL_ENGINEERING'] }],
        },
      }),
    });

    try {
      const result = await analyzeInput('links', { url: 'https://gcas1.com/login' });
      expect(result.usedOnline).toBe(true);
      expect(result.level).toBe('high');
      expect(result.signals.some((signal) => signal.id === 'online_match')).toBe(true);
    } finally {
      fetch.mockRestore();
    }
  });

  it('does not flag a brand name inside an official web address', async () => {
    for (const message of ['https://www.bdo.com.ph', 'www.bpi.com.ph', 'https://www.gcash.com']) {
      const result = await analyzeInput('text', { message }, { onlineLookup: false });
      const ids = result.signals.map((signal) => signal.id);
      expect(ids).not.toContain('impersonation');
      expect(ids).not.toContain('lookalike_brand');
      expect(ids).not.toContain('money_demand');
      expect(result.level).not.toBe('suspicious');
      expect(result.level).not.toBe('high');
    }
  });

  it('does not score advisory model indicators from the API', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        level: 'Low risk',
        score: 0,
        summary: 'Review evidence only.',
        indicators: [
          { id: 'dataset-text-model', title: 'Wording hint', message: 'Review wording.', weight: 2, evidence: [{ text: 'claim' }] },
          { id: 'dataset-url-model', title: 'Address hint', message: 'Review address.', weight: 2, evidence: [{ text: 'login' }] },
        ],
      }),
    });

    try {
      const result = await analyzeInput(
        'text',
        { message: 'Please claim your reward.' },
        { onlineLookup: false },
      );
      const ids = result.signals.map((signal) => signal.id);
      expect(ids).not.toContain('dataset-text-model');
      expect(ids).not.toContain('dataset-url-model');
      expect(result.level).not.toBe('suspicious');
    } finally {
      fetch.mockRestore();
    }
  });
});
