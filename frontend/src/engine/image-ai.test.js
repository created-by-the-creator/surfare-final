import { describe, expect, it, vi } from 'vitest';
import {
  buildImageOriginResult,
  getImageAiConfig,
  imageOriginVerdict,
  imageOriginSummary,
  reviewImageOrigin,
} from './image-ai.js';

describe('image AI review', () => {
  it.each([[0, 'low'], [0.51, 'uncertain'], [0.94, 'high']])('keeps score %s separate from scam risk and file metadata', (score, band) => {
    const metadata = { labelKey: 'result.imageMetadata.label.declaration', findings: ['ai-tool'] };
    const result = buildImageOriginResult({ providerId: 'sightengine', detection: { aiGeneratedScore: score, band: 'forged' } }, null, metadata);
    expect(result.imageOrigin).toMatchObject({ source: 'sightengine', score, band });
    expect(result.summaryKey).toBe(`result.sightengine.${band}`);
    expect(result.imageMetadata).toBe(metadata);
    expect(result.level).toBe('unknown');
    expect(result.score).toBe(0);
    expect(imageOriginSummary(result.imageOrigin, (key, values) => values?.score || key)).toContain(score.toFixed(3));
  });

  it.each([null, undefined, '0.01', -0.1, 1.1])('does not treat invalid score %s as a low AI signal', async (score) => {
    const fetcher = async (_url, options = {}) => Response.json(options.method === 'POST'
      ? { status: 'completed', providerId: 'sightengine', detection: { aiGeneratedScore: score } }
      : { configured: true, providerId: 'sightengine' });
    const review = await reviewImageOrigin('file', { fetcher, prepare: async () => 'data:image/jpeg;base64,/9j/AA==' });
    expect(review.status).toBe('unavailable');
    const metadata = { labelKey: 'result.imageMetadata.label.declaration', findings: ['ai-tool'] };
    const result = buildImageOriginResult(null, null, metadata, review);
    expect(result.imageMetadata).toBe(metadata);
    expect(result.imageOrigin).toBeNull();
    expect(result.imageVisualStatus).toBe('unavailable');
  });

  it.each(['quota', 'credentials', 'unsupported_image'])('keeps %s failures distinct and never retries automatically', async (reason) => {
    const fetcher = vi.fn(async (_url, options = {}) => options.method === 'POST'
      ? Response.json({ status: 'unavailable', reason }, { status: 429 })
      : Response.json({ configured: true, providerId: 'sightengine' }));
    const review = await reviewImageOrigin('file', { fetcher, prepare: async () => 'data:image/jpeg;base64,/9j/AA==' });
    expect(review).toMatchObject({ status: 'unavailable', reason });
    expect(review.noteKey).toMatch(/^result.sightengine\./);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps a completed visual result when a screenshot has no creation metadata', () => {
    const result = buildImageOriginResult({ origin: {
      label: 'No clear AI cues', likelihood: 'No clear', summary: 'No visible irregularity.', observations: [], nonClues: [],
    } }, null, { labelKey: 'result.imageMetadata.label.none' });
    expect(result.summaryKey).toBe('result.imageOrigin.none');
    expect(result.imageVisualStatus).toBe('completed');
  });

  it('keeps an inconclusive hand observation distinct from a failed visual call', () => {
    const note = 'The hand looks elongated, but perspective may explain it.';
    const result = buildImageOriginResult({ origin: {
      label: 'Uncertain', likelihood: 'Unclear', summary: 'A detail needs closer inspection.',
      observations: [note], ambiguousObservations: [note], nonClues: [],
    } });
    expect(result.summaryKey).toBe('result.imageOrigin.inconclusive');
    expect(result.imageOrigin.ambiguousObservations).toEqual([note]);
    expect(buildImageOriginResult(null, null, null, { status: 'unavailable' }).summaryKey).toBe('result.imageOrigin.unavailable');
  });

  it('reads configuration without exposing credentials', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ configured: true, providerId: 'sightengine', provider: 'Sightengine' }),
    );
    const config = await getImageAiConfig(fetcher);
    expect(config).toEqual({ configured: true, providerId: 'sightengine' });
    expect(JSON.stringify(config)).not.toContain('API_KEY');
  });

  it('sends a bounded JPEG with explicit consent and origin mode only', async () => {
    const calls = [];
    const fetcher = async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method !== 'POST') return Response.json({ configured: true, providerId: 'sightengine' });
      return Response.json({
        status: 'completed', providerId: 'sightengine', detection: { aiGeneratedScore: 0.94, band: 'high' },
      });
    };
    const result = await reviewImageOrigin('file', {
      fetcher,
      prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
    });
    expect(result.status).toBe('completed');
    expect(result.review.detection.aiGeneratedScore).toBe(0.94);
    expect(calls).toHaveLength(2);
    const post = JSON.parse(calls[1].options.body);
    expect(post).toEqual({
      image: 'data:image/jpeg;base64,/9j/AA==',
      mode: 'origin',
      consent: true,
      provider: 'sightengine',
    });
  });

  it('keeps file-note clues local for an independent visual review', async () => {
    const calls = [];
    const fetcher = async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method !== 'POST') return Response.json({ configured: true, providerId: 'sightengine' });
      return Response.json({
        status: 'completed', providerId: 'sightengine', detection: { aiGeneratedScore: 0.04, band: 'low' },
      });
    };
    await reviewImageOrigin('file', {
      fetcher,
      prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
      metadata: {
        findings: ['ai-tool', 'credentials-verified', 'credentials-invalid', 'made-up-code'],
        notes: ['editorOnly', 'credentialsUnchecked', 'secret-value'],
        fields: [{ key: 'Content Credentials', value: 'raw binary must not be sent' }],
      },
    });
    const post = JSON.parse(calls[1].options.body);
    expect(post.metadata).toBeUndefined();
    expect(JSON.stringify(post)).not.toContain('raw binary must not be sent');
    expect(JSON.stringify(post)).not.toContain('made-up-code');
  });

  it('does not upload to a legacy visual provider through the Sightengine flow', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ configured: true, providerId: 'gemini', provider: 'Gemini' }),
    );
    const config = await getImageAiConfig(fetcher);
    expect(config).toEqual({ configured: false, providerId: '' });
  });

  it('does not call the provider when the server is not configured', async () => {
    const fetcher = vi.fn(async () => Response.json({ configured: false, providerId: '' }));
    const result = await reviewImageOrigin('file', {
      fetcher,
      prepare: () => { throw new Error('prepare should not run'); },
    });
    expect(result).toEqual({
      status: 'unavailable',
      reason: 'not_configured',
      noteKey: 'result.imageMetadata.visualNotConfigured',
      errorKey: 'error.image_ai_unavailable',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('maps a provider conflict to a refresh message', async () => {
    const fetcher = async (url, options = {}) =>
      options.method === 'POST'
        ? new Response('{}', { status: 409 })
        : Response.json({ configured: true, providerId: 'sightengine' });
    const result = await reviewImageOrigin('file', {
      fetcher,
      prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
    });
    expect(result).toEqual({
      status: 'unavailable',
      reason: 'provider',
      noteKey: 'result.imageMetadata.visualProvider',
      errorKey: 'error.image_ai_provider',
    });
  });

  it('keeps the origin verdict limited and separate from risk scoring', () => {
    const verdict = imageOriginVerdict({
      origin: {
        label: 'AI-like visual cues',
        likelihood: 'Strong',
        summary: 'A visual clue was seen.',
        observations: ['One', 'Two', 'Three', 'Four', 'Five'],
        nonClues: ['A screenshot frame is not an AI clue.', 'Another note.'],
      },
    });
    expect(verdict.labelKey).toBe('result.imageOrigin.strong');
    expect(verdict.confidenceKey).toBe('result.imageOrigin.confidence.strong');
    expect(verdict.observations).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(verdict.nonClues).toEqual(['A screenshot frame is not an AI clue.', 'Another note.']);
    const result = buildImageOriginResult({
      origin: { label: 'AI-like visual cues', likelihood: 'Possible' },
    });
    expect(result.level).toBe('unknown');
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.checkedText).toBe('');
    expect(result.imageOrigin.labelKey).toBe('result.imageOrigin.possible');
  });

  it('maps a rejected local page request to a page-specific note', async () => {
    const fetcher = async (url, options = {}) =>
      options.method === 'POST'
        ? Response.json({ status: 'unavailable', reason: 'origin' }, { status: 403 })
        : Response.json({ configured: true, providerId: 'sightengine' });
    const result = await reviewImageOrigin('file', {
      fetcher,
      prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
    });
    expect(result.noteKey).toBe('result.imageMetadata.visualRequest');
  });

  it('maps a busy free model to a specific message without using paid models', async () => {
    const fetcher = async (url, options = {}) =>
      options.method === 'POST'
        ? Response.json({ status: 'unavailable', reason: 'busy' }, { status: 429 })
        : Response.json({ configured: true, providerId: 'sightengine' });
    const result = await reviewImageOrigin('file', {
      fetcher,
      prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
    });
    expect(result.errorKey).toBe('error.image_ai_busy');
  });

  it('maps a timeout to the same busy message', async () => {
    const fetcher = async (url, options = {}) =>
      options.method === 'POST'
        ? Response.json({ status: 'unavailable', reason: 'timeout' }, { status: 504 })
        : Response.json({ configured: true, providerId: 'sightengine' });
    const result = await reviewImageOrigin('file', {
      fetcher,
      prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
    });
    expect(result.errorKey).toBe('error.image_ai_busy');
  });
});


it.each([[404, 'service_missing'], [403, 'access_denied'], [429, 'quota'], [504, 'timeout'], [503, 'provider_error']])('preserves configuration failure HTTP %s without uploading an image', async (http, reason) => {
  const fetcher = vi.fn(async () => new Response('service unavailable', { status: http }));
  const prepare = vi.fn();
  const result = await reviewImageOrigin('file', { fetcher, prepare });
  expect(result.status).toBe('unavailable');
  expect(result.reason).toBe(reason);
  expect(prepare).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('distinguishes a lost connection from missing provider configuration', async () => {
  const result = await reviewImageOrigin('file', { fetcher: async () => { throw new TypeError('Failed to fetch'); } });
  expect(result.reason).toBe('network');
  expect(result.noteKey).toBe('result.imageMetadata.visualNetwork');
  const stored = buildImageOriginResult(null, null, { labelKey: 'result.imageMetadata.label.none' }, result);
  expect(stored.imageVisualReason).toBe('network');
});

it('uses the HTTP status when an image upload failure has no JSON error body', async () => {
  const result = await reviewImageOrigin('file', {
    fetcher: async (_url, options = {}) => options.method === 'POST' ? new Response('upstream timeout', { status: 504 }) : Response.json({ configured: true, providerId: 'sightengine' }),
    prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
  });
  expect(result.reason).toBe('timeout');
  expect(result.noteKey).toBe('result.imageMetadata.visualTimeout');
});
