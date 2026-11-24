import { analyzePatterns } from '../../../backend/lib/pattern-detection.js';
import { normalizeUrl } from '../../../backend/lib/url-input.js';
import { isPrivateQrPayload, isUnsupportedQrPayload } from '../../../backend/lib/qr-payload.js';
import { groundSignals } from './signal-display.js';
import { apiFetch } from '../api/fetch.js';
import { addBrowserReferenceIndicators } from './reference-indicators.js';

const LEVELS = { 'High risk': 'high', Suspicious: 'suspicious', 'Low risk': 'low', 'Insufficient evidence': 'unknown' };
const ADVISORY = new Set(['dataset-text-model', 'dataset-url-model']);

function displayIndicators(indicators, text) {
  const byId = new Map();
  for (const indicator of indicators) {
    if (!indicator?.id || ADVISORY.has(indicator.id)) continue;
    // The local "secret" rule looks for credentials. The semantic "secret" category means secrecy.
    let id = indicator.id;
    if (id === 'secret' && indicator.source !== 'contextual AI') {
      id = /\botp\b|one[- ]time|verification code/i.test(indicator.evidence?.map(e => e.text).join(' '))
        ? 'otp_request' : 'credential_request';
    }
    const signal = byId.get(id) || {
      id, label: indicator.title, detail: indicator.message, weight: indicator.weight, evidenceItems: [],
    };
    const evidence = Array.isArray(indicator.evidence) ? indicator.evidence : [indicator.evidence];
    for (const item of evidence) if (item) signal.evidenceItems.push(typeof item === 'string' ? { text: item } : item);
    signal.weight = Math.max(signal.weight || 0, indicator.weight || 0);
    signal.severity = signal.weight >= 4 ? 3 : signal.weight >= 2 ? 2 : 1;
    byId.set(id, signal);
  }
  return groundSignals([...byId.values()], text);
}

async function fetchDetector(input) {
  try {
    const response = await apiFetch('/api/detect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(input.ai ? 45000 : 15000),
    });
    if (response.ok) {
      const data = await response.json();
      if (Object.hasOwn(LEVELS, data?.level) && Array.isArray(data.indicators)) return data;
    }
  } catch { /* Keep the completed on-device assessment. */ }
  return null;
}

async function lookupUrl(url) {
  const endpoints = ['/api/check-url'];
  if (import.meta.env.VITE_WORKER_URL) endpoints.push(import.meta.env.VITE_WORKER_URL.replace(/\/$/, '') + '/check-url');
  for (const endpoint of endpoints) {
    try {
      const response = await (endpoint.startsWith('/') ? apiFetch : fetch)(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }), signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (!data.unavailable && typeof data.matched === 'boolean') return { url, matched: data.matched };
    } catch { /* Try the configured backup, if available. */ }
  }
  return { url, unavailable: true };
}

function normalized(raw) {
  try { return normalizeUrl(raw).href; } catch { return ''; }
}

export async function checkExtractedContent(tab, content, mediaInfo, { onlineLookup, ai, onLocalResult }) {
  if (content.length > 12000) return { level: 'unknown', errorKey: 'result.tooLong', checkedText: content, mediaInfo, signals: [] };
  const kind = { links: 'link', text: 'message', image: 'image', qr: 'qr' }[tab];
  const qrValues = mediaInfo?.qrValues || (mediaInfo?.qrValue ? [mediaInfo.qrValue] : []);
  const privateQr = isPrivateQrPayload(content) || qrValues.some(isPrivateQrPayload);
  const unsupportedQr = isUnsupportedQrPayload(content) || qrValues.some(isUnsupportedQrPayload);
  const local = analyzePatterns(
    content,
    tab === 'links' ? [content] : [],
    addBrowserReferenceIndicators,
  );
  const urls = local.urls.map(item => item.url).filter(url => url.length <= 2048);
  const base = {
    checkedText: content, mediaInfo, privateQr, unsupportedQr, score: local.score,
    level: local.level === 'Low risk' ? 'unknown' : LEVELS[local.level],
    signals: displayIndicators(local.indicators, content), summaryKey: 'summary_local',
    usedOnline: false, onlineNoKnownThreat: false, onlineUnavailable: false,
    aiReview: { status: 'not_checked' },
  };
  if ((tab === 'links' || tab === 'qr') && /^(?:javascript|data|vbscript):/i.test(content.trim())) {
    const scheme = content.trim().split(':')[0] + ':';
    return { ...base, level: 'high', score: 8, signals: groundSignals([
      { id: 'data_or_javascript_scheme', severity: 3, weight: 8, evidence: scheme },
    ], content) };
  }
  if (!onlineLookup || privateQr) return base;
  if (ai) onLocalResult?.({ ...base, aiReview: { status: 'pending' } });
  const detector = await fetchDetector({
    kind, text: content, urls, online: true, uncertain: Boolean(mediaInfo?.uncertainExtraction),
    ...(ai ? { ai: true, consent: true } : {}),
  });
  const report = detector?.onlineVerification;
  const checks = (report?.status === 'completed' && Array.isArray(report.results) ? report.results : [])
    .filter(row => typeof row?.url === 'string' && Array.isArray(row.threats))
    .map(row => ({ url: row.url, matched: row.threats.length > 0 }));
  const checked = new Set(checks.map(row => normalized(row.url)));
  const missing = urls.filter(url => !checked.has(url));
  checks.push(...await Promise.all(missing.map(lookupUrl)));
  const matches = checks.filter(row => row.matched);
  const reputationSignals = matches.map(row => ({
    id: 'online_match', weight: 8, severity: 3,
    evidenceItems: local.urls.find(item => item.url === normalized(row.url))?.evidence || [{ text: row.url }],
  }));
  const onlineUnavailable = checks.some(row => row.unavailable);
  const result = detector ? {
    ...base, level: LEVELS[detector.level], score: Number(detector.score) || 0,
    signals: displayIndicators(detector.indicators, content),
    semanticConflict: Boolean(detector.semanticConflict), unsupportedQr: unsupportedQr || Boolean(detector.unsupportedQr),
    detectorSummary: detector.summary, detectorRecommendation: detector.recommendation,
  } : base;
  return {
    ...result, ...(matches.length ? { level: 'high', summaryKey: 'summary_online', score: Math.max(8, result.score) } : {}),
    signals: [...result.signals, ...groundSignals(reputationSignals, content)],
    matchedUrls: matches.map(row => row.url), usedOnline: matches.length > 0, onlineUnavailable,
    onlineNoKnownThreat: checks.length > 0 && !onlineUnavailable && !matches.length,
    aiReview: detector?.aiReview || { status: ai ? 'unavailable' : 'not_checked' },
  };
}
