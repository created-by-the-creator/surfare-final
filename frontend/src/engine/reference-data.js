import {
  FAKE_REGULATOR_HOSTS,
  PHISHING_FINGERPRINTS_BASE64,
  PHISHING_INDEX,
  REGISTERED_GAMBLING_HOSTS,
  REPORTED_GAMBLING_HOSTS,
  REVIEWED_GAMBLING_HOSTS,
  SOCIAL_PLATFORM_DOMAINS,
  STOPPED_LENDER_NAMES,
  VERIFIED_OFFICIAL_DOMAINS,
} from './generated/url-reference-data.js';
import {
  hostCandidates,
  hostSuffixes,
  matchesHostSet,
  normalizeHost,
} from '../../../backend/lib/host-reference.js';
import { hasGamblingContext } from '../../../backend/lib/gambling-context.js';
import { matchStoppedLenders, prepareLenderNames } from '../../../backend/lib/lender-reference.js';
import { sha256Fingerprint } from './sha256.js';

export { SOCIAL_PLATFORM_DOMAINS };

const verifiedOfficialDomains = new Set(VERIFIED_OFFICIAL_DOMAINS);
const reportedGamblingHosts = new Set(REPORTED_GAMBLING_HOSTS);
const fakeRegulatorHosts = new Set(FAKE_REGULATOR_HOSTS);
const reviewedGamblingHosts = new Set(REVIEWED_GAMBLING_HOSTS);
const registeredGamblingHosts = new Set(REGISTERED_GAMBLING_HOSTS);
const preparedLenderNames = prepareLenderNames(STOPPED_LENDER_NAMES);
let phishingFingerprints = null;

function loadPhishingFingerprints() {
  if (phishingFingerprints) return phishingFingerprints;
  const binary = atob(PHISHING_FINGERPRINTS_BASE64);
  if (
    binary.length !==
    PHISHING_INDEX.count * PHISHING_INDEX.fingerprintBytes
  ) {
    throw new Error('Truncated offline phishing index.');
  }
  const fingerprints = new Set();
  for (let offset = 0; offset < binary.length; offset += PHISHING_INDEX.fingerprintBytes) {
    let hex = '';
    for (let byte = 0; byte < PHISHING_INDEX.fingerprintBytes; byte += 1) {
      hex += binary.charCodeAt(offset + byte).toString(16).padStart(2, '0');
    }
    fingerprints.add(hex);
  }
  phishingFingerprints = fingerprints;
  return fingerprints;
}

export function matchKnownPhishingHosts(urls) {
  const index = loadPhishingFingerprints();
  const matches = [];
  const seen = new Set();
  for (const info of Array.isArray(urls) ? urls : []) {
    for (const candidate of hostCandidates(info?.host)) {
      for (const suffix of hostSuffixes(candidate)) {
        if (verifiedOfficialDomains.has(suffix)) continue;
        if (!index.has(sha256Fingerprint(suffix))) continue;
        const key = `${info.url}:${suffix}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ url: info.url, host: suffix });
      }
    }
  }
  return matches;
}

export function matchReportedGamblingHosts(urls) {
  return matchesHostSet(urls, reportedGamblingHosts);
}

export function matchFakeRegulatorHosts(urls) {
  return matchesHostSet(urls, fakeRegulatorHosts);
}

export function matchReviewedGamblingHosts(urls) {
  return matchesHostSet(urls, reviewedGamblingHosts);
}

export function matchUnlistedGamblingHosts(text, urls) {
  if (!hasGamblingContext(text, urls)) return [];
  const registered = registeredGamblingHosts;
  const reviewed = reviewedGamblingHosts;
  const matches = [];
  const seen = new Set();
  for (const info of Array.isArray(urls) ? urls : []) {
    const candidates = hostCandidates(info?.host);
    const isListed = (set) =>
      candidates.some((candidate) =>
        hostSuffixes(candidate).some((suffix) => set.has(suffix)),
      );
    if (isListed(registered) || isListed(reviewed)) continue;
    const key = String(info?.url || info?.host || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    matches.push({ url: info.url, host: normalizeHost(info?.host) });
  }
  return matches;
}

export function matchStoppedLenderNames(text, urls) {
  return matchStoppedLenders(text, urls, preparedLenderNames);
}

export function assessUrlReferences(text, urls) {
  return {
    phishing: matchKnownPhishingHosts(urls),
    gambling: matchReportedGamblingHosts(urls),
    reviewedGambling: matchReviewedGamblingHosts(urls),
    unlistedGambling: matchUnlistedGamblingHosts(text, urls),
    fakeRegulator: matchFakeRegulatorHosts(urls),
    lenders: matchStoppedLenderNames(text, urls),
  };
}
