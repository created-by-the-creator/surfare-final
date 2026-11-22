import { analyzeTextAndUrls } from './text.js';
import { analyzeUrl } from './url.js';
import { decideRisk } from './decision.js';
import { inspectImage } from './media.js';
import { validateImageFile } from './fileValidation.js';
import { buildImageOriginResult, reviewImageOrigin } from './image-ai.js';
import { inspectImageMetadata } from './image-metadata.js';
import { groundSignals } from './signal-display.js';

const WEAK_URL_SIGNAL = /^(?:brand[-_]|lookalike[-_]|dataset-url-model$)/;
const ADVISORY_DETECTOR_SIGNAL = new Set(['dataset-text-model', 'dataset-url-model']);
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

function completedOnlineCheck(verification) {
  return (
    verification?.status === 'completed' &&
    Array.isArray(verification.results) &&
    verification.results.length > 0
  );
}

async function checkUrlOnline(url, online = true) {
  if (!online) return { matched: false, unavailable: true };

  const endpoints = ['/api/check-url'];
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  if (workerUrl) endpoints.push(`${workerUrl.replace(/\/$/, '')}/check-url`);

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const result = await response.json();
      if (result?.unavailable === true || typeof result?.matched !== 'boolean') continue;
      return { matched: result.matched, unavailable: false };
    } catch (error) {
      console.error('Online URL check failed:', error);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  return { matched: false, unavailable: true };
}

function uniqueSignals(signals) {
  const seen = new Set();
  return signals.filter((signal) => {
    const key = `${signal.id}:${signal.evidence ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectorEvidence(indicator) {
  if (Array.isArray(indicator.evidence)) {
    return indicator.evidence
      .map((item) => (typeof item === 'string' ? { text: item } : item))
      .filter((item) => item?.text);
  }
  return typeof indicator.evidence === 'string' && indicator.evidence
    ? [{ text: indicator.evidence }]
    : [];
}

function collectTextSignals(content) {
  return analyzeTextAndUrls(content);
}

async function checkLocalDetector(tab, content, urls, { online = false } = {}) {
  const kind = tab === 'links' ? 'link' : tab === 'qr' ? 'qr' : tab === 'image' ? 'image' : 'message';
  try {
    const response = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: content, kind, urls, online }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (!result || typeof result !== 'object') return null;
    return result;
  } catch {
    return null;
  }
}

function mergeDetectorResult(frontend, detector, content, { suppressWeakUrlSignals = false } = {}) {
  if (!detector) return frontend;
  const levelMap = {
    'High risk': 'high',
    'Suspicious': 'suspicious',
    'Low risk': 'low',
    'Insufficient evidence': 'unknown',
  };
  const mappedLevel = levelMap[detector.level];
  if (!mappedLevel) return frontend;

  const detectorSignals = (Array.isArray(detector.indicators) ? detector.indicators : [])
    .filter((indicator) => indicator?.id)
    .filter((indicator) => !ADVISORY_DETECTOR_SIGNAL.has(indicator.id))
    .filter((indicator) => !(suppressWeakUrlSignals && WEAK_URL_SIGNAL.test(indicator.id)))
    .map((indicator) => ({
      id: indicator.id,
      label: indicator.title || '',
      detail: indicator.message || '',
      severity: indicator.weight >= 4 ? 3 : indicator.weight >= 2 ? 2 : 1,
      weight: Number(indicator.weight) || 0,
      evidenceItems: detectorEvidence(indicator),
      evidence: '',
    }));
  const mergedSignals = uniqueSignals([...frontend.signals, ...detectorSignals]);
  const levelPriority = { unknown: 0, low: 1, suspicious: 2, high: 3 };
  const level = levelPriority[mappedLevel] > levelPriority[frontend.level]
    ? mappedLevel
    : frontend.level;

  return {
    ...frontend,
    level,
    score: Math.max(frontend.score, Number(detector.score) || 0),
    signals: mergedSignals,
    checkedText: content,
    detectorSummary: detector.summary,
    detectorRecommendation: detector.recommendation,
  };
}

export async function analyzeInput(
  tab,
  inputs,
  { onlineLookup = true, imageMode = 'ocr' } = {},
) {
  let content = '';
  let signals = [];
  let urls = [];
  let mediaInfo = null;

  if (tab === 'text') {
    content = inputs.message.trim();
    ({ signals, urls } = collectTextSignals(content));
  } else if (tab === 'links') {
    content = inputs.url.trim();
    const result = analyzeUrl(content);
    signals = result.signals;
    urls = result.normalized && /^https?:\/\//i.test(result.normalized) ? [result.normalized] : [];
  } else if (tab === 'image' || tab === 'qr') {
    const file = tab === 'image' ? inputs.image : inputs.qr;
    if (tab === 'image' && imageMode === 'origin' && onlineLookup) {
      const checked = await validateImageFile(file);
      const imageMetadata = await inspectImageMetadata(file);
      const mediaInfo = { width: checked.width, height: checked.height };
      const review = await reviewImageOrigin(file, { metadata: imageMetadata });
      if (review.status !== 'completed') {
        return buildImageOriginResult(null, mediaInfo, imageMetadata, {
          status: 'unavailable',
          noteKey: review.noteKey || VISUAL_NOTE_KEYS[review.reason] || 'result.imageMetadata.visualUnavailable',
        });
      }
      return buildImageOriginResult(review.review, mediaInfo, imageMetadata, { status: 'completed' });
    }
    if (tab === 'qr' && inputs.qrValue) {
      mediaInfo = { text: '', qrValue: inputs.qrValue };
    } else {
      await validateImageFile(file);
      mediaInfo = await inspectImage(file, { includeOcr: tab === 'image' });
    }
    content = [mediaInfo.qrValue, mediaInfo.text].filter(Boolean).join('\n');

    if (mediaInfo.qrValue) {
      const decoded = collectTextSignals(mediaInfo.qrValue);
      signals.push(...decoded.signals);
      urls.push(...decoded.urls);
    }
    if (tab === 'image' && mediaInfo.text) {
      const ocr = collectTextSignals(mediaInfo.text);
      signals.push(...ocr.signals);
      urls.push(...ocr.urls);
    }
    if (tab === 'qr' && !mediaInfo.qrValue) {
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

  const firstUrl = urls[0];
  const detector = await checkLocalDetector(tab, content, urls, {
    online: onlineLookup && Boolean(firstUrl),
  });
  let onlineMatch = false;
  let onlineUnavailable = false;
  let onlineNoKnownThreat = false;

  if (completedOnlineCheck(detector?.onlineVerification)) {
    onlineNoKnownThreat = true;
    onlineMatch = detector.onlineVerification.results.some((result) => result.threats?.length);
    if (onlineMatch) onlineNoKnownThreat = false;
  } else if (firstUrl && onlineLookup) {
    const online = await checkUrlOnline(firstUrl, onlineLookup);
    onlineMatch = online.matched;
    onlineUnavailable = online.unavailable;
    onlineNoKnownThreat = !onlineMatch && !online.unavailable;
  } else if (tab === 'links' && onlineLookup) {
    onlineUnavailable = true;
  }

  if (onlineMatch) {
    signals.push({
      id: 'online_match',
      severity: 3,
      weight: 8,
      evidence: firstUrl,
    });
  }
  if (onlineNoKnownThreat) {
    signals = signals.filter((signal) => !WEAK_URL_SIGNAL.test(signal.id));
  }

  const result = {
    ...decideRisk(groundSignals(uniqueSignals(signals), content), content, {
      onlineMatch,
      onlineUnavailable,
      onlineNoKnownThreat,
    }),
    mediaInfo,
  };
  const merged = mergeDetectorResult(result, detector, content, {
    suppressWeakUrlSignals: onlineNoKnownThreat,
  });
  return { ...merged, signals: groundSignals(merged.signals, content) };
}
