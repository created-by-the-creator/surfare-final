const AI_ENDPOINT = '/api/image-assess';
const MAX_IMAGE_DATA_LENGTH = 1000000;
const ORIGIN_LABEL_KEYS = {
  'AI-like visual cues': 'result.imageOrigin.likely',
  'No clear AI cues': 'result.imageOrigin.none',
  Uncertain: 'result.imageOrigin.unclear',
};
const ORIGIN_LIKELIHOOD_KEYS = {
  Strong: 'result.imageOrigin.strong',
  Possible: 'result.imageOrigin.possible',
  'No clear': 'result.imageOrigin.none',
  Unclear: 'result.imageOrigin.unclear',
};
const ERROR_BY_REASON = {
  not_configured: 'error.image_ai_unavailable',
  busy: 'error.image_ai_busy',
  timeout: 'error.image_ai_busy',
  incomplete: 'error.image_ai_incomplete',
  bad_origin_output: 'error.image_ai_incomplete',
  provider: 'error.image_ai_provider',
  provider_error: 'error.image_ai_provider',
  origin: 'error.image_ai_unavailable',
  consent: 'error.image_ai_unavailable',
  invalid_image: 'error.image_ai_unavailable',
  invalid_request: 'error.image_ai_unavailable',
  method: 'error.image_ai_unavailable',
  too_large: 'error.image_ai_unavailable',
};
const FILE_AI_LABELS = new Set(['result.imageMetadata.label.declaration', 'result.imageMetadata.label.generation', 'result.imageMetadata.label.tool']);
const VISUAL_AI_LABELS = new Set(['result.imageOrigin.strong', 'result.imageOrigin.possible', 'result.imageOrigin.likely']);

const NOTE_BY_REASON = {
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

export function hasImageAiClues(result) {
  return FILE_AI_LABELS.has(result?.imageMetadata?.labelKey) || VISUAL_AI_LABELS.has(result?.imageOrigin?.labelKey);
}

export async function getImageAiConfig(fetcher = fetch) {
  const response = await fetcher(AI_ENDPOINT, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return { configured: false, providerId: '' };
  const data = await response.json();
  return {
    configured: Boolean(data.configured),
    providerId: typeof data.providerId === 'string' ? data.providerId : '',
  };
}

function bytesToDataUrl(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export async function prepareImageForReview(file, maxLength = MAX_IMAGE_DATA_LENGTH) {
  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 1600;
    let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas_unavailable');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = [0.82, 0.72, 0.62, 0.55, 0.5][attempt];
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('capture_failed');
      const url = bytesToDataUrl(new Uint8Array(await blob.arrayBuffer()));
      if (url.length <= maxLength) return url;
      scale *= 0.75;
    }
    throw new Error('image_too_large');
  } finally {
    bitmap.close();
  }
}

async function reviewImage(
  file,
  { fetcher = fetch, prepare = prepareImageForReview } = {},
) {
  try {
    const config = await getImageAiConfig(fetcher);
    if (!config.configured)
      return {
        status: 'unavailable',
        reason: 'not_configured',
        noteKey: NOTE_BY_REASON.not_configured,
        errorKey: 'error.image_ai_unavailable',
      };
    const image = await prepare(file);
    const response = await fetcher(AI_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,
        mode: 'origin',
        secondReview: true,
        consent: true,
        provider: config.providerId,
      }),
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok || data.status !== 'completed') {
      const reason =
        typeof data.reason === 'string' && data.reason
          ? data.reason
          : response.status === 409
            ? 'provider'
            : '';
      return {
        status: 'unavailable',
        reason,
        noteKey: NOTE_BY_REASON[reason] || 'result.imageMetadata.visualUnavailable',
        errorKey: ERROR_BY_REASON[reason] || 'error.image_ai_unavailable',
      };
    }
    return { status: 'completed', review: data };
  } catch (error) {
    if (error?.name === 'TimeoutError')
      return { status: 'unavailable', reason: 'timeout', noteKey: NOTE_BY_REASON.timeout, errorKey: ERROR_BY_REASON.timeout };
    if (error?.message === 'canvas_unavailable')
      return {
        status: 'unavailable',
        reason: 'canvas',
        noteKey: 'result.imageMetadata.visualImageIssue',
        errorKey: 'error.canvas_unavailable',
      };
    return {
      status: 'unavailable',
      reason: 'client',
      noteKey: 'result.imageMetadata.visualUnavailable',
      errorKey: 'error.image_ai_unavailable',
    };
  }
}

export function reviewImageOrigin(file, options = {}) {
  return reviewImage(file, options);
}

export function imageOriginVerdict(review) {
  const label = review?.origin?.label;
  const likelihood = review?.origin?.likelihood;
  const labelKey =
    ORIGIN_LIKELIHOOD_KEYS[likelihood] || ORIGIN_LABEL_KEYS[label] || 'result.imageOrigin.unclear';
  const confidenceKey =
    likelihood === 'Strong'
      ? 'result.imageOrigin.confidence.strong'
      : likelihood === 'Possible' || label === 'AI-like visual cues'
        ? 'result.imageOrigin.confidence.medium'
        : 'result.imageOrigin.confidence.low';
  const observations = Array.isArray(review?.origin?.observations)
    ? review.origin.observations.slice(0, 4).map((text) => String(text).slice(0, 400))
    : [];
  const nonClues = Array.isArray(review?.origin?.nonClues)
    ? review.origin.nonClues.slice(0, 3).map((text) => String(text).slice(0, 300))
    : [];
  return {
    labelKey,
    confidenceKey,
    summary: typeof review?.origin?.summary === 'string' ? review.origin.summary.slice(0, 800) : '',
    observations,
    nonClues,
    limitationKey: 'result.imageOrigin.limitation',
  };
}

export function buildImageOriginResult(
  review,
  mediaInfo = null,
  imageMetadata = null,
  visual = {},
) {
  const imageOrigin = review ? imageOriginVerdict(review) : null;
  const labelKey = FILE_AI_LABELS.has(imageMetadata?.labelKey)
    ? imageMetadata.labelKey
    : VISUAL_AI_LABELS.has(imageOrigin?.labelKey)
      ? imageOrigin.labelKey
      : 'result.imageOrigin.unclear';
  return {
    level: 'unknown',
    score: 0,
    signals: [],
    usedOnline: Boolean(imageOrigin),
    onlineUnavailable: false,
    checkedText: '',
    summaryKey: labelKey,
    imageOrigin,
    imageMetadata,
    imageVisualStatus: visual.status || (imageOrigin ? 'completed' : 'skipped'),
    imageVisualNoteKey: visual.noteKey || '',
    aiImageOnly: true,
    mediaInfo,
  };
}
