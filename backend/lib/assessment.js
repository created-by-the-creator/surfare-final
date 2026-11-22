// Keep local findings distinct from reputation results. No match is not proof of safety.
import { levelForIndicators, scoreForIndicators } from './detection.js';
import { extractUrls } from './url-input.js';

const WEAK_URL_SIGNAL = /^(?:brand[-_]|lookalike[-_]|dataset-url-model$)/;
const CLEAN_NOTE =
  'A completed online check found no reported threat for the checked address. This does not prove the site is legitimate.';

function completedWithoutThreats(verification, urls) {
  return (
    verification?.status === 'completed' &&
    Array.isArray(verification.results) &&
    verification.results.length > 0 &&
    verification.results.every((r) => typeof r?.url === 'string' && Array.isArray(r.threats) && !r.threats.length) &&
    urls.length > 0 && urls.every((entry) => verification.results.some((r) => r.url === entry.url))
  );
}

// A clean reputation lookup can soften only the weak name-lookalike hint.
// It must never suppress exact-list matches, threats, or credential demands.
export function applyUrlVerification(local, verification) {
  if (!completedWithoutThreats(verification, local.urls || [])) return local;
  const original = Array.isArray(local.indicators) ? local.indicators : [];
  const reviewedUrlIndicators = original.filter((indicator) =>
    WEAK_URL_SIGNAL.test(indicator.id) && indicator.weight < 4);
  const indicators = original.filter((indicator) => !reviewedUrlIndicators.includes(indicator));
  const limitations = [...(local.limitations || []), CLEAN_NOTE];
  if (indicators.length === original.length)
    return { ...local, onlineNoKnownThreat: true, limitations };

  const sufficient =
    String(local.sourceText || '').trim().split(/\s+/).length >= 4 || (local.urls || []).length > 0;
  let level = levelForIndicators(indicators, { sufficient });
  if (local.semanticLevel === 'High risk' || (local.semanticLevel === 'Suspicious' && level === 'Low risk'))
    level = local.semanticLevel;
  const remainingConcern = indicators.some((item) => item.category === 'personal safety') || ['High risk', 'Suspicious'].includes(level);
  return {
    ...local,
    indicators,
    score: scoreForIndicators(indicators),
    level,
    onlineNoKnownThreat: true,
    reviewedUrlIndicators,
    summary: remainingConcern ? local.summary :
      'The online check found no reported threat for this address. Confirm it through the official app or website.',
    recommendation: remainingConcern ? local.recommendation :
      'Confirm the address through the official app or website before signing in or sharing information.',
    limitations,
  };
}

export function combineAssessment(local, verification = null) {
  const verified = applyUrlVerification(local, verification);
  const base = { ...verified, localLevel: local.level };
  if (verification?.status === 'completed' && verification.results?.some((r) => r.threats?.length))
    return {
      ...base,
      level: 'High risk',
      summary: verified.indicators.some((indicator) => indicator.category === 'personal safety')
        ? verified.summary + ' Google also reports an unsafe URL.'
        : 'Google Safe Browsing reports a potentially unsafe URL.',
      recommendation: verified.indicators.some((indicator) => indicator.category === 'personal safety')
        ? verified.recommendation
        : 'Avoid opening this address or submitting information. Use the official app or a known contact to verify the request.',
    };
  if (verified.urls?.length && verified.level === 'Low risk') {
    let message = verified.sourceText || '';
    for (const raw of extractUrls(message)) message = message.replaceAll(raw, ' ');
    if (verified.inputKind !== 'link' && verified.semanticLevel === 'Low risk' &&
        !verified.unsupportedQr && !verified.uncertainExtraction &&
        (message.match(/\p{L}+/gu) || []).length >= 6)
      return {
        ...base,
        summary: verified.summary + ' The link’s safety is still unconfirmed.',
        urlSafetyUnconfirmed: true,
      };
    return {
      ...base,
      level: 'Insufficient evidence',
      summary: verified.onlineNoKnownThreat
        ? 'The online check found no reported threat for this address. Confirm it through the official app or website before signing in.'
        : 'No strong local URL warning signs were found, but the destination’s safety is unconfirmed.',
      recommendation:
        'Verify the destination through an official source before sharing information. A no-match reputation result does not guarantee safety.',
    };
  }
  return base;
}
