import { classifyAiGeneratedScore } from '../../../backend/lib/sightengine-assessment.js';
import { apiFetch } from '../api/fetch.js';

const AI_ENDPOINT = '/api/image-detect';
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
  credentials: 'result.sightengine.credentials',
  quota: 'result.sightengine.quota',
  unsupported_image: 'result.sightengine.unsupported',
  method: 'error.image_ai_unavailable',
  too_large: 'error.image_ai_unavailable',
};
const FILE_AI_LABELS = new Set(['result.imageMetadata.label.declaration', 'result.imageMetadata.label.generation', 'result.imageMetadata.label.tool']);
const VISUAL_AI_LABELS = new Set(['result.imageOrigin.strong', 'result.imageOrigin.possible', 'result.imageOrigin.likely', 'result.sightengine.high']);

const NOTE_BY_REASON = {
  network: 'result.imageMetadata.visualNetwork',
  service_missing: 'result.imageMetadata.visualRequest',
  access_denied: 'result.imageMetadata.visualRequest',
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
  credentials: 'result.sightengine.credentials',
  quota: 'result.sightengine.quota',
  unsupported_image: 'result.sightengine.unsupported',
  method: 'result.imageMetadata.visualUnavailable',
  too_large: 'result.imageMetadata.visualImageIssue',
};

export function hasImageAiClues(result) {
  return FILE_AI_LABELS.has(result?.imageMetadata?.labelKey) || VISUAL_AI_LABELS.has(result?.imageOrigin?.labelKey);
}

export async function getImageAiConfig(fetcher = apiFetch) {
  const response = await fetcher(AI_ENDPOINT, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return { configured: false, providerId: '', reason: imageApiFailure(response.status) };
  const data = await response.json();
  return {
    configured: data.configured === true && data.providerId === 'sightengine',
    providerId: data.providerId === 'sightengine' ? data.providerId : '',
  };
}

function imageApiFailure(status) {
  if (status === 404) return 'service_missing';
  if ([401, 403].includes(status)) return 'access_denied';
  if (status === 413) return 'too_large';
  if (status === 429) return 'quota';
  if ([408, 504].includes(status)) return 'timeout';
  if (status === 409) return 'provider';
  return 'provider_error';
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
  { fetcher = apiFetch, prepare = prepareImageForReview } = {},
) {
  try {
    const config = await getImageAiConfig(fetcher);
    if (!config.configured) {
      const reason = config.reason || 'not_configured';
      return {
        status: 'unavailable',
        reason,
        noteKey: NOTE_BY_REASON[reason] || NOTE_BY_REASON.provider_error,
        errorKey: 'error.image_ai_unavailable',
      };
    }
    const image = await prepare(file);
    const response = await fetcher(AI_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,
        mode: 'origin',
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
          : imageApiFailure(response.status);
      return {
        status: 'unavailable',
        reason,
        noteKey: NOTE_BY_REASON[reason] || 'result.imageMetadata.visualUnavailable',
        errorKey: ERROR_BY_REASON[reason] || 'error.image_ai_unavailable',
      };
    }
    if (data.providerId !== 'sightengine') throw Error('invalid_image_provider');
    classifyAiGeneratedScore(data.detection?.aiGeneratedScore);
    return { status: 'completed', review: data };
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error?.name))
      return { status: 'unavailable', reason: 'timeout', noteKey: NOTE_BY_REASON.timeout, errorKey: ERROR_BY_REASON.timeout };
    if (['canvas_unavailable', 'capture_failed', 'image_too_large'].includes(error?.message))
      return {
        status: 'unavailable',
        reason: 'canvas',
        noteKey: 'result.imageMetadata.visualImageIssue',
        errorKey: 'error.canvas_unavailable',
      };
    return {
      status: 'unavailable',
      reason: error instanceof TypeError ? 'network' : 'client',
      noteKey: error instanceof TypeError ? NOTE_BY_REASON.network : 'result.imageMetadata.visualUnavailable',
      errorKey: 'error.image_ai_unavailable',
    };
  }
}

export function reviewImageOrigin(file, options = {}) {
  return reviewImage(file, options);
}

export function imageOriginVerdict(review) {
  if (review?.providerId === 'sightengine') {
    const score = review.detection?.aiGeneratedScore;
    const band = classifyAiGeneratedScore(score);
    return {
      source: 'sightengine', score, band,
      labelKey: `result.sightengine.${band}`,
      summaryKey: `result.sightengine.summary.${band}`,
      confidenceKey: band === 'high' ? 'result.imageOrigin.confidence.strong' : 'result.imageOrigin.confidence.low',
      summary: '', observations: [], ambiguousObservations: [], nonClues: [],
      limitationKey: 'result.sightengine.limitation',
    };
  }
  const label = review?.origin?.label;
  const likelihood = review?.origin?.likelihood;
  const labelKey = likelihood === 'Unclear' && review?.origin?.observations?.length
    ? 'result.imageOrigin.inconclusive'
    : ORIGIN_LIKELIHOOD_KEYS[likelihood] || ORIGIN_LABEL_KEYS[label] || 'result.imageOrigin.unclear';
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
    ambiguousObservations: Array.isArray(review?.origin?.ambiguousObservations)
      ? review.origin.ambiguousObservations.filter((note) => observations.includes(note)) : [],
    reviewDisagreement: review?.origin?.reviewDisagreement === true,
    nonClues,
    limitationKey: 'result.imageOrigin.limitation',
  };
}

export function imageOriginSummary(origin, t) {
  return origin?.summaryKey
    ? `${t(origin.summaryKey)} ${t('result.sightengine.score', { score: origin.score.toFixed(3) })}`
    : origin?.summary || '';
}

export function buildImageOriginResult(
  review,
  mediaInfo = null,
  imageMetadata = null,
  visual = {},
) {
  const imageOrigin = review ? imageOriginVerdict(review) : null;
  const labelKey = imageOrigin?.source === 'sightengine' ? imageOrigin.labelKey : FILE_AI_LABELS.has(imageMetadata?.labelKey)
    ? imageMetadata.labelKey
    : imageOrigin?.labelKey || (visual.status === 'unavailable' ? 'result.imageOrigin.unavailable' : 'result.imageOrigin.unclear');
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
    imageVisualReason: visual.reason || '',
    imageVisualNoteKey: visual.noteKey || '',
    aiImageOnly: true,
    mediaInfo,
  };
}
