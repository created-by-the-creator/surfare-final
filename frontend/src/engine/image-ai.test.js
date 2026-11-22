import { describe, expect, it, vi } from 'vitest';
import {
  buildImageOriginResult,
  getImageAiConfig,
  imageOriginVerdict,
  reviewImageOrigin,
} from './image-ai.js';

describe('image AI review', () => {
  it('reads configuration without exposing credentials', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ configured: true, providerId: 'openrouter', provider: 'OpenRouter (free models)' }),
    );
    const config = await getImageAiConfig(fetcher);
    expect(config).toEqual({ configured: true, providerId: 'openrouter' });
    expect(JSON.stringify(config)).not.toContain('API_KEY');
  });

  it('sends a bounded JPEG with explicit consent and origin mode only', async () => {
    const calls = [];
    const fetcher = async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method !== 'POST') return Response.json({ configured: true, providerId: 'openrouter' });
      return Response.json({
        status: 'completed',
        origin: {
          label: 'AI-like visual cues',
          likelihood: 'Possible',
          summary: 'A visual clue was seen.',
          observations: ['A clue.'],
          nonClues: ['The blur came from resizing.'],
        },
      });
    };
    const result = await reviewImageOrigin('file', {
      fetcher,
      prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
    });
    expect(result.status).toBe('completed');
    expect(result.review.origin.nonClues).toEqual(['The blur came from resizing.']);
    expect(calls).toHaveLength(2);
    const post = JSON.parse(calls[1].options.body);
    expect(post).toEqual({
      image: 'data:image/jpeg;base64,/9j/AA==',
      mode: 'origin',
      secondReview: true,
      consent: true,
      provider: 'openrouter',
    });
  });

  it('keeps file-note clues local for an independent visual review', async () => {
    const calls = [];
    const fetcher = async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method !== 'POST') return Response.json({ configured: true, providerId: 'openrouter' });
      return Response.json({
        status: 'completed',
        origin: {
          label: 'No clear AI cues',
          likelihood: 'No clear',
          summary: 'No clear visual clue.',
          observations: [],
          nonClues: [],
        },
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

  it('accepts Gemini as the configured visual provider', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ configured: true, providerId: 'gemini', provider: 'Gemini' }),
    );
    const config = await getImageAiConfig(fetcher);
    expect(config.providerId).toBe('gemini');
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
        : Response.json({ configured: true, providerId: 'openrouter' });
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
        : Response.json({ configured: true, providerId: 'openrouter' });
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
        : Response.json({ configured: true, providerId: 'openrouter' });
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
        : Response.json({ configured: true, providerId: 'openrouter' });
    const result = await reviewImageOrigin('file', {
      fetcher,
      prepare: async () => 'data:image/jpeg;base64,/9j/AA==',
    });
    expect(result.errorKey).toBe('error.image_ai_busy');
  });
});
