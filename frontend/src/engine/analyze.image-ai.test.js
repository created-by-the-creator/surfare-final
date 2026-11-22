import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  validateImageFile,
  inspectImageMetadata,
  inspectImage,
  reviewImageOrigin,
} = vi.hoisted(() => ({
  validateImageFile: vi.fn(),
  inspectImageMetadata: vi.fn(),
  inspectImage: vi.fn(),
  reviewImageOrigin: vi.fn(),
}));

vi.mock('./fileValidation.js', () => ({ validateImageFile }));
vi.mock('./image-metadata.js', () => ({ inspectImageMetadata }));
vi.mock('./media.js', () => ({ inspectImage }));
vi.mock('./image-ai.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, reviewImageOrigin };
});

import { analyzeInput } from './analyze.js';

describe('image visual mode follows connection status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateImageFile.mockResolvedValue({ width: 120, height: 80 });
    inspectImageMetadata.mockResolvedValue({ labelKey: 'result.imageMetadata.label.none' });
    inspectImage.mockResolvedValue({
      text: 'Send your OTP now. Your account will be blocked today.',
      qrValue: '',
    });
    reviewImageOrigin.mockResolvedValue({
      status: 'completed',
      review: {
        origin: {
          label: 'AI-like visual cues',
          likelihood: 'Possible',
          summary: 'A clue was seen.',
          observations: [],
          nonClues: [],
        },
      },
    });
  });

  it('uses visual AI when online without a separate sharing choice', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');

    try {
      const result = await analyzeInput(
        'image',
        { image: {} },
        { onlineLookup: true, imageMode: 'origin' },
      );

      expect(reviewImageOrigin).toHaveBeenCalledTimes(1);
      expect(reviewImageOrigin).toHaveBeenCalledWith(
        {},
        { metadata: { labelKey: 'result.imageMetadata.label.none' } },
      );
      expect(inspectImage).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(result.imageOrigin.labelKey).toBe('result.imageOrigin.possible');
      expect(result.summaryKey).toBe('result.imageMetadata.label.none');
    } finally {
      fetch.mockRestore();
    }
  });

  it('runs local text detection only when offline, even if origin mode is requested', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false });

    try {
      const result = await analyzeInput(
        'image',
        { image: {} },
        { onlineLookup: false, imageMode: 'origin' },
      );

      expect(reviewImageOrigin).not.toHaveBeenCalled();
      expect(inspectImageMetadata).not.toHaveBeenCalled();
      expect(inspectImage).toHaveBeenCalledWith({}, { includeOcr: true });
      expect(result.imageOrigin).toBeUndefined();
      expect(result.imageVisualStatus).toBeUndefined();
      expect(result.level).toBe('high');
      expect(result.signals.map((signal) => signal.id)).toContain('otp_request');
    } finally {
      fetch.mockRestore();
    }
  });
});
