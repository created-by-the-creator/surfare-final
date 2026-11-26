// Starting a backup helps latency; these generous overall limits protect
// slow, healthy requests from being abandoned before a result is ready.
export const DETECTOR_AI_TIMEOUT_MS = 90000;
export const DETECTOR_AI_CLIENT_TIMEOUT_MS = 100000;
export const DETECTOR_AI_HEDGE_AFTER_MS = 1500;
