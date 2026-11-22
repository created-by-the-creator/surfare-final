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

  it('shows the metadata result first and then the visual finding on a stripped image', async () => {
    const local = vi.fn();
    const result = await analyzeInput('image', { image: {}, imageVisualConsent: true },
      { onlineLookup: true, imageMode: 'origin', onLocalResult: local });
    expect(local.mock.calls[0][0].imageVisualStatus).toBe('pending');
    expect(reviewImageOrigin).toHaveBeenCalledWith({});
    expect(result.summaryKey).toBe('result.imageOrigin.possible');
    expect(inspectImage).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps the origin inconclusive without visual sharing (online=%s)', async onlineLookup => {
    const result = await analyzeInput('image', { image: {} }, { onlineLookup, imageMode: 'origin' });
    expect(inspectImageMetadata).toHaveBeenCalled();
    expect(reviewImageOrigin).not.toHaveBeenCalled();
    expect(inspectImage).not.toHaveBeenCalled();
    expect(result.imageVisualStatus).toBe('skipped');
    expect(result.summaryKey).toBe('result.imageOrigin.unclear');
  });
});
