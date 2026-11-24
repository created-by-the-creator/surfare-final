import { getDisplaySignals } from './signal-display.js';

// Report what completed checks found without turning absence of evidence into safety.
export function localOutcome(result) {
  if (!result || result.level !== 'unknown' || result.errorKey || result.aiImageOnly ||
      result.privateQr || result.unsupportedQr || result.mediaInfo?.uncertainExtraction) return null;
  if (result.onlineNoKnownThreat) return 'noKnownThreats';
  if (result.aiReview?.status !== 'completed' && getDisplaySignals(result).length === 0 &&
      String(result.checkedText || '').trim().split(/\s+/).length >= 4) return 'noLocalWarnings';
  return null;
}
