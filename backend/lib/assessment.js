// Keep local findings distinct from reputation results. No match is not proof of safety.
import { levelForIndicators, scoreForIndicators } from './detection.js';

const WEAK_URL_SIGNAL = /^(?:brand[-_]|lookalike[-_]|dataset-url-model$)/;
const CLEAN_NOTE =
  'A completed online check found no reported threat for the checked address. This does not prove the site is legitimate.';

function completedWithoutThreats(verification) {
  return (
    verification?.status === 'completed' &&
    Array.isArray(verification.results) &&
    verification.results.length > 0 &&
    verification.results.every(
      (result) => !Array.isArray(result.threats) || result.threats.length === 0,
    )
  );
}

// A clean reputation lookup can soften only the weak name-lookalike hint.
// It must never suppress exact-list matches, threats, or credential demands.
export function applyUrlVerification(local, verification) {
  if (!completedWithoutThreats(verification)) return local;
  const original = Array.isArray(local.indicators) ? local.indicators : [];
  const indicators = original.filter((indicator) => !WEAK_URL_SIGNAL.test(indicator.id));
  const limitations = [...(local.limitations || []), CLEAN_NOTE];
  if (indicators.length === original.length)
    return { ...local, onlineNoKnownThreat: true, limitations };

  const sufficient =
    String(local.sourceText || '').trim().split(/\s+/).length >= 4 || (local.urls || []).length > 0;
  return {
    ...local,
    indicators,
    score: scoreForIndicators(indicators),
    level: levelForIndicators(indicators, { sufficient }),
    onlineNoKnownThreat: true,
    summary:
      'The online check found no reported threat for this address. Confirm it through the official app or website.',
    recommendation:
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
  if (verified.urls?.length && verified.level === 'Low risk')
    return {
      ...base,
      level: 'Insufficient evidence',
      summary: verified.onlineNoKnownThreat
        ? 'The online check found no reported threat for this address. Confirm it through the official app or website before signing in.'
        : 'No strong local URL warning signs were found, but the destination’s safety is unconfirmed.',
      recommendation:
        'Verify the destination through an official source before sharing information. A no-match reputation result does not guarantee safety.',
    };
  return base;
}
