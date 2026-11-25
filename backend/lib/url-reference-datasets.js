import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  hostCandidates,
  hostSuffixes,
  matchesHostSet,
  normalizeHost,
} from './host-reference.js';
import { hasGamblingContext } from './gambling-context.js';
import { matchStoppedLenders, prepareLenderNames } from './lender-reference.js';
import { isShortLinkHost } from './short-links.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const externalDir = path.join(backendRoot, 'datasets', 'external');
const phishingIndexPath = path.join(externalDir, 'phishdestroy-domain-index.bin');
const gamblingHostsPath = path.join(externalDir, 'pagcor-reported-hosts.txt');
const registeredGamblingHostsPath = path.join(
  externalDir,
  'pagcor-registered-gambling-hosts.txt',
);
const reviewedGamblingHostsPath = path.join(externalDir, 'local-reviewed-gambling-hosts.txt');
const regulatorHostsPath = path.join(externalDir, 'pagcor-fake-certification-hosts.txt');
const lendersPath = path.join(externalDir, 'sec-stopped-lenders.txt');

// Verified official domains that appear in the compact upstream index are
// upstream false positives. They are not treated as conclusive known-phishing
// matches; any enabled online threat check still applies independently.
// Reviewed platforms are deliberately not included: user-controlled subdomains
// on those hosts must still be checkable for impersonation.
export const VERIFIED_OFFICIAL_DOMAINS = Object.freeze([
  'bdo.com.ph',
  'bpi.com.ph',
  'gcash.com',
  'maya.ph',
  'paymaya.com',
  'paypal.com',
  'facebook.com',
  'fb.com',
  'google.com',
  'microsoft.com',
  'live.com',
  'office.com',
  'shopee.ph',
  'lazada.com.ph',
]);

const MAGIC = 'SURFPDI1';
const HEADER_BYTES = 16;

let phishingIndex = null;
const hostSets = new Map();
let lenderNames = null;

function loadLines(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function loadPhishingIndex() {
  if (phishingIndex) return phishingIndex;
  const buffer = fs.readFileSync(phishingIndexPath);
  if (buffer.length < HEADER_BYTES || buffer.subarray(0, 8).toString('ascii') !== MAGIC) {
    throw new Error('Invalid known phishing address index.');
  }
  const count = buffer.readUInt32LE(8);
  const fingerprintBytes = buffer[12];
  const expected = HEADER_BYTES + count * fingerprintBytes;
  if (fingerprintBytes !== 8 || buffer.length !== expected) {
    throw new Error('Truncated known phishing address index.');
  }
  const set = new Set();
  for (let offset = HEADER_BYTES; offset < expected; offset += fingerprintBytes) {
    set.add(buffer.subarray(offset, offset + fingerprintBytes).toString('hex'));
  }
  phishingIndex = set;
  return set;
}

function loadHostSet(file) {
  if (hostSets.has(file)) return hostSets.get(file);
  const set = new Set(loadLines(file).map((host) => normalizeHost(host)));
  hostSets.set(file, set);
  return set;
}

function fingerprint(host) {
  return crypto.createHash('sha256').update(host).digest('hex').slice(0, 16);
}

export function matchKnownPhishingHosts(urls) {
  const index = loadPhishingIndex();
  const verified = new Set(VERIFIED_OFFICIAL_DOMAINS);
  const matches = [];
  const seen = new Set();
  for (const info of Array.isArray(urls) ? urls : []) {
    for (const candidate of hostCandidates(info?.host)) {
      for (const suffix of hostSuffixes(candidate)) {
        if (verified.has(suffix) || isShortLinkHost(suffix)) continue;
        if (!index.has(fingerprint(suffix))) continue;
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
  return matchesHostSet(urls, loadHostSet(gamblingHostsPath));
}

export function matchFakeRegulatorHosts(urls) {
  return matchesHostSet(urls, loadHostSet(regulatorHostsPath));
}

export function matchReviewedGamblingHosts(urls) {
  return matchesHostSet(urls, loadHostSet(reviewedGamblingHostsPath));
}

export function matchUnlistedGamblingHosts(text, urls) {
  if (!hasGamblingContext(text, urls)) return [];
  const registered = loadHostSet(registeredGamblingHostsPath);
  const reviewed = loadHostSet(reviewedGamblingHostsPath);
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

function loadLenderNames() {
  if (lenderNames) return lenderNames;
  lenderNames = prepareLenderNames(loadLines(lendersPath));
  return lenderNames;
}

function browserMatchStoppedLenders(text, urls) {
  return matchStoppedLenders(text, urls, loadLenderNames());
}

export function assessUrlReferences(text, urls) {
  return {
    phishing: matchKnownPhishingHosts(urls),
    gambling: matchReportedGamblingHosts(urls),
    reviewedGambling: matchReviewedGamblingHosts(urls),
    unlistedGambling: matchUnlistedGamblingHosts(text, urls),
    fakeRegulator: matchFakeRegulatorHosts(urls),
    lenders: browserMatchStoppedLenders(text, urls),
  };
}
