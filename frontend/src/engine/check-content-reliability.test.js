import { afterEach, expect, it, vi } from 'vitest';
import { checkExtractedContent } from './check-content.js';
import { DETECTOR_AI_TIMEOUT_MS, DETECTOR_AI_CLIENT_TIMEOUT_MS } from '../../../backend/lib/ai-timing.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

for (const failure of ['network', 502]) {
  it(`recovers from an API ${failure} failure while keeping one total timeout`, async () => {
    const fetcher = vi.fn().mockImplementationOnce(async () => {
      if (failure === 'network') throw new TypeError('fetch failed');
      return new Response('', { status: failure });
    }).mockResolvedValueOnce(Response.json({ level: 'High risk', score: 6, indicators: [], aiReview: { status: 'completed' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await checkExtractedContent('text', 'Send your OTP now', null, { onlineLookup: true, ai: true });
    expect(result.aiReview.status).toBe('completed');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal);
  });
}

it('does not repeat quota failures and preserves local warnings', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
  vi.stubGlobal('fetch', fetcher);
  const result = await checkExtractedContent('text', 'Send your OTP now or your account will be blocked.', null, { onlineLookup: true, ai: true });
  expect(result.aiReview.status).toBe('unavailable');
  expect(result.level).toBe('high');
  expect(result.signals.length).toBeGreaterThan(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('allows the backend its full review deadline plus time to return the result', async () => {
  const timeouts = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
    level: 'High risk', score: 6, indicators: [], aiReview: { status: 'completed' },
  })));
  const result = await checkExtractedContent('text', 'Send your OTP now', null, { onlineLookup: true, ai: true });
  expect(result.aiReview.status).toBe('completed');
  expect(timeouts).toHaveBeenCalledWith(DETECTOR_AI_CLIENT_TIMEOUT_MS);
  expect(DETECTOR_AI_CLIENT_TIMEOUT_MS).toBeGreaterThan(DETECTOR_AI_TIMEOUT_MS);
});
