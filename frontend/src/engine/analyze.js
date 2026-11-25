import { validateImageFile } from './fileValidation.js';
import { buildImageOriginResult, reviewImageOrigin } from './image-ai.js';
const VISUAL_NOTE_KEYS = {
  not_configured: 'result.imageMetadata.visualNotConfigured',
  busy: 'result.imageMetadata.visualBusy',
  timeout: 'result.imageMetadata.visualTimeout',
  incomplete: 'result.imageMetadata.visualIncomplete',
  bad_origin_output: 'result.imageMetadata.visualBadOutput',
  provider: 'result.imageMetadata.visualProvider',
  provider_error: 'result.imageMetadata.visualProvider',
  origin: 'result.imageMetadata.visualRequest',
  consent: 'result.imageMetadata.visualConsent',
  invalid_image: 'result.imageMetadata.visualImageIssue',
  invalid_request: 'result.imageMetadata.visualUnavailable',
  method: 'result.imageMetadata.visualUnavailable',
  too_large: 'result.imageMetadata.visualImageIssue',
};

export async function analyzeInput(
  tab,
  inputs,
  { onlineLookup = true, imageMode = 'ocr', ai = false, onLocalResult } = {},
) {
  let content = '';
  let mediaInfo = null;

  if (tab === 'text') {
    content = inputs.message.trim();
  } else if (tab === 'links') {
    content = inputs.url.trim();
  } else if (tab === 'image' || tab === 'qr') {
    const file = tab === 'image' ? inputs.image : inputs.qr;
    if (tab === 'image' && imageMode === 'origin') {
      const { inspectImageMetadata } = await import('./image-metadata.js');
      const checked = await validateImageFile(file);
      const imageMetadata = await inspectImageMetadata(file);
      const mediaInfo = { width: checked.width, height: checked.height };
      if (!onlineLookup || !inputs.imageVisualConsent) {
        return buildImageOriginResult(null, mediaInfo, imageMetadata, {
          status: 'skipped',
          noteKey: onlineLookup ? 'result.imageMetadata.visualConsent' : 'result.imageMetadata.visualOffline',
        });
      }
      onLocalResult?.(buildImageOriginResult(null, mediaInfo, imageMetadata, {
        status: 'pending',
        noteKey: 'result.imageMetadata.visualPending',
      }));
      const review = await reviewImageOrigin(file);
      if (review.status !== 'completed') {
        return buildImageOriginResult(null, mediaInfo, imageMetadata, {
          status: 'unavailable',
          reason: review.reason,
          noteKey: review.noteKey || VISUAL_NOTE_KEYS[review.reason] || 'result.imageMetadata.visualUnavailable',
        });
      }
      return buildImageOriginResult(review.review, mediaInfo, imageMetadata, { status: 'completed' });
    }
    if (tab === 'qr' && !file && inputs.qrValue) {
      mediaInfo = { text: '', qrValue: inputs.qrValue };
    } else {
      await validateImageFile(file);
      const { inspectImage } = await import('./media.js');
      mediaInfo = await inspectImage(file, { includeOcr: tab === 'image' });
    }
    const decoded = mediaInfo.qrValues || (mediaInfo.qrValue ? [mediaInfo.qrValue] : []);
    content = [...new Set([...decoded, mediaInfo.text].filter(Boolean))].join('\n');
    if (tab === 'qr' && !decoded.length) {
      return {
        level: 'unknown',
        score: 0,
        signals: [],
        usedOnline: false,
        onlineUnavailable: false,
        checkedText: '',
        errorKey: 'error.qr_missing',
      };
    }
    if (tab === 'image' && !mediaInfo.text && !mediaInfo.qrValue) {
      return {
        level: 'unknown',
        score: 0,
        signals: [],
        usedOnline: false,
        onlineUnavailable: false,
        checkedText: '',
        errorKey: 'error.ocr_failed',
      };
    }
  }

  const { checkExtractedContent } = await import('./check-content.js');
  return checkExtractedContent(tab, content, mediaInfo, { onlineLookup, ai, onLocalResult });
}
