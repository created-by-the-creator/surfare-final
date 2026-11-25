import { expect, it, vi } from 'vitest';
import { analyzeInput } from './analyze.js';
import { requestSurfyReply } from '../surfy/client.js';

vi.mock('./fileValidation.js', () => ({ validateImageFile: async () => ({ width: 20, height: 20 }) }));
vi.mock('./image-metadata.js', () => ({ inspectImageMetadata: async () => ({
  labelKey: 'result.imageMetadata.label.none', summaryKey: 'result.imageMetadata.summary.none', findings: [],
}) }));

it('does not upload ordinary message text when online without AI consent', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ matched: false, unavailable: false }));
  try {
    const message = 'Your school meeting is tomorrow at nine. Details are at https://example.com/meeting';
    const result = await analyzeInput('text', { message }, { onlineLookup: true, ai: false });
    expect(result.level).toBe('low');
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
});

it.each([
  { onlineLookup: false, consent: true, note: 'result.imageMetadata.visualOffline' },
  { onlineLookup: true, consent: false, note: 'result.imageMetadata.visualConsent' },
])('preserves local image notes without an upload: %j', async ({ onlineLookup, consent, note }) => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Network must not be used'));
  try {
    const result = await analyzeInput('image', { image: {}, imageVisualConsent: consent }, { onlineLookup, imageMode: 'origin' });
    expect(result.imageMetadata.findings).toEqual([]);
    expect(result.imageVisualStatus).toBe('skipped');
    expect(result.imageVisualNoteKey).toBe(note);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
});

it('preserves local image notes when the connection fails during a consented check', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Connection lost'));
  try {
    const result = await analyzeInput('image', { image: {}, imageVisualConsent: true }, { onlineLookup: true, imageMode: 'origin' });
    expect(result.imageMetadata).toBeTruthy();
    expect(result.imageVisualStatus).toBe('unavailable');
    expect(result.imageOrigin).toBeNull();
  } finally { fetcher.mockRestore(); }
});

it('rejects an online Surfy call immediately when the browser goes offline', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  const fetcher = vi.spyOn(globalThis, 'fetch');
  try {
    await expect(requestSurfyReply({ question: 'Why?', history: [] })).rejects.toThrow('offline');
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); vi.unstubAllGlobals(); }
});
