import { analyzePatterns } from '../../../backend/lib/pattern-detection.js';
import { isPrivateQrPayload, isUnsupportedQrPayload, isLoginQrPayload } from '../../../backend/lib/qr-payload.js';
import { groundSignals } from './signal-display.js';
import { apiFetch } from '../api/fetch.js';
import { addBrowserReferenceIndicators } from './reference-indicators.js';
import { describeLink } from './link-description.js';
import { qrPayloads as describeQrPayloads, describeQrPayload } from '../../../backend/lib/qr-links.js';
import { extractUrls } from '../../../backend/lib/url-input.js';
import { automaticallyResolveLinks, mergeLinkResolution } from './link-destination.js';
import { DETECTOR_AI_CLIENT_TIMEOUT_MS } from '../../../backend/lib/ai-timing.js';

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
  const signal = AbortSignal.timeout(input.ai ? DETECTOR_AI_CLIENT_TIMEOUT_MS : 15000);
  const options = {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal,
  };
  for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
    try {
      const response = await apiFetch('/api/detect', options);
      if (response.ok) {
        const data = await response.json();
        if (Object.hasOwn(LEVELS, data?.level) && Array.isArray(data.indicators)) return data;
        break;
      }
      if (![408, 500, 502, 503, 504].includes(response.status)) break;
      await response.body?.cancel();
    } catch (error) {
      if (signal.aborted || !(error instanceof TypeError || error instanceof SyntaxError)) break;
    }
  }
  return null;
}

export async function checkExtractedContent(tab, content, mediaInfo, { onlineLookup, ai, onLocalResult }) {
  if (content.length > 12000) return { level: 'unknown', errorKey: 'result.tooLong', checkedText: content, mediaInfo, signals: [] };
  const kind = { links: 'link', text: 'message', image: 'image', qr: 'qr' }[tab];
  const qrValues = mediaInfo?.qrValues || (mediaInfo?.qrValue ? [mediaInfo.qrValue] : []);
  const payloads = describeQrPayloads(qrValues);
  const loginQr = isLoginQrPayload(content) || qrValues.some(isLoginQrPayload);
  const privateQr = isPrivateQrPayload(content) || qrValues.some(isPrivateQrPayload) || payloads.some(item => item.type === 'url' && item.blocked);
  const unsupportedQr = isUnsupportedQrPayload(content) || qrValues.some(isUnsupportedQrPayload) || payloads.some(item => item.type === 'unsupported');
  const local = analyzePatterns(
    content,
    tab === 'links' ? [content] : [],
    addBrowserReferenceIndicators,
  );
  const urls = local.urls.map(item => item.url).filter(url => url.length <= 2048);
  const detectedLinks = !qrValues.length && ['links', 'text', 'image'].includes(tab)
    ? [...new Set(tab === 'links' ? [content] : extractUrls(content))].map(describeQrPayload)
      .filter(item => item.type === 'url' && (tab === 'links' || item.urlType === 'shortened')) : payloads;
  const base = {
    ...(detectedLinks.length ? { linkPayloads: detectedLinks, destinationContext: qrValues.length ? 'qr' : tab } : {}),
    ...(tab === 'links' ? { linkInfo: describeLink(content) } : {}),
    checkedText: content, mediaInfo, privateQr, unsupportedQr, loginQr, score: local.score,
    level: local.level === 'Low risk' && (tab === 'links' || privateQr || unsupportedQr || mediaInfo?.uncertainExtraction ||
      (urls.length > 0 && content.trim().split(/\s+/).length < 4))
      ? 'unknown' : LEVELS[local.level],
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
  const needsDestinations = detectedLinks.some(item => item.type === 'url' && !item.blocked && (item.urlType === 'shortened' || tab === 'links'));
  let withDestinations = base;
  if (needsDestinations) {
    onLocalResult?.({ ...base, destinationPending: true });
    withDestinations = await automaticallyResolveLinks(base);
  }
  if (!ai) return withDestinations;
  onLocalResult?.({ ...withDestinations, destinationPending: false, aiReview: { status: 'pending' } });
  // Only the explicit AI choice sends text to OpenRouter/Gemini.
  const detector = await fetchDetector({
    kind, text: content, urls, uncertain: Boolean(mediaInfo?.uncertainExtraction),
    ai: true, consent: true,
  });
  if (!detector) return { ...withDestinations, aiReview: { status: 'unavailable' } };
  const reviewed = {
    ...base, level: detector.level === 'Low risk' && base.linkPayloads?.some(item => item.type === 'url')
      ? 'unknown' : LEVELS[detector.level], score: Number(detector.score) || 0,
    signals: displayIndicators(detector.indicators, content),
    semanticConflict: Boolean(detector.semanticConflict), unsupportedQr: unsupportedQr || Boolean(detector.unsupportedQr),
    detectorSummary: detector.summary, detectorRecommendation: detector.recommendation,
    aiReview: detector.aiReview || { status: 'unavailable' },
  };
  return Object.values(withDestinations.linkDestinations || {}).reduce(mergeLinkResolution, reviewed);
}
