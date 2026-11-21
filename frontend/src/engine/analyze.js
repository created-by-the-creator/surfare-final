import { analyzeTextAndUrls } from './text.js';
import { analyzeUrl } from './url.js';
import { decideRisk } from './decision.js';
import { inspectImage } from './media.js';
import { validateImageFile } from './fileValidation.js';
import { groundSignals } from './signal-display.js';

const WEAK_URL_SIGNAL = /^(?:brand[-_]|lookalike[-_]|dataset-url-model$)/;
const ADVISORY_DETECTOR_SIGNAL = new Set(['dataset-text-model', 'dataset-url-model']);

function completedOnlineCheck(verification) {
  return (
    verification?.status === 'completed' &&
    Array.isArray(verification.results) &&
    verification.results.length > 0
  );
}

async function checkUrlOnline(url) {
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  if (!navigator.onLine || !workerUrl) {
    return { matched: false, unavailable: true };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/check-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`online_check_${response.status}`);
    const result = await response.json();
    return { matched: Boolean(result.matched), unavailable: false };
  } catch (error) {
    console.error('Online URL check failed:', error);
    return { matched: false, unavailable: true };
  } finally {
    window.clearTimeout(timeout);
  }
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

export async function analyzeInput(tab, inputs, { onlineLookup = true } = {}) {
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
    const online = await checkUrlOnline(firstUrl);
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
