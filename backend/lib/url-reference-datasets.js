import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse as parseDomain } from 'tldts';

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
const VERIFIED_OFFICIAL_DOMAINS = new Set([
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

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

function hostCandidates(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return [];
  return [...new Set([normalized, normalized.replace(/^www\./, '')])].filter(Boolean);
}

function hostSuffixes(host) {
  const normalized = normalizeHost(host);
  if (!normalized || !normalized.includes('.')) return [];
  let base = normalized;
  try {
    base = normalizeHost(parseDomain(normalized, { allowPrivateDomains: true }).domain || normalized);
  } catch {}
  const labels = normalized.split('.');
  const baseCount = base.split('.').length;
  const suffixes = [];
  for (let i = 0; i <= labels.length - baseCount; i++) {
    suffixes.push(labels.slice(i).join('.'));
  }
  return [...new Set(suffixes)];
}

function fingerprint(host) {
  return crypto.createHash('sha256').update(host).digest('hex').slice(0, 16);
}

function matchesHostSet(urls, set) {
  const matches = [];
  const seen = new Set();
  for (const info of Array.isArray(urls) ? urls : []) {
    for (const candidate of hostCandidates(info?.host)) {
      for (const suffix of hostSuffixes(candidate)) {
        if (!set.has(suffix)) continue;
        const key = `${info.url}:${suffix}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ url: info.url, host: suffix });
        break;
      }
    }
  }
  return matches;
}

export function matchKnownPhishingHosts(urls) {
  const index = loadPhishingIndex();
  const matches = [];
  const seen = new Set();
  for (const info of Array.isArray(urls) ? urls : []) {
    for (const candidate of hostCandidates(info?.host)) {
      for (const suffix of hostSuffixes(candidate)) {
        if (VERIFIED_OFFICIAL_DOMAINS.has(suffix)) continue;
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

const GAMBLING_CONTEXT_PATTERN =
  /\b(?:gambl(?:e|ing)|casino|sports(?:book|[- ]?bet(?:ting)?)|bet(?:ting|s|\d+)?|wager(?:ing)?|poker|bingo|lotto|lottery|perya|swert(?:e|res)|taya|juankada|baccarat|roulette|slots?|cash[- ]?wheel|jackpot|free spins?|payout|igaming|online gaming|mahjong|sabong|cockfight)\b/i;

function decodeUrlText(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function hasGamblingContext(text, urls) {
  const urlText = (Array.isArray(urls) ? urls : [])
    .map((info) => decodeUrlText(info?.url))
    .join(' ');
  return GAMBLING_CONTEXT_PATTERN.test(`${String(text || '')} ${urlText}`);
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

function compact(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function compactText(text) {
  let value = '';
  const offsets = [];
  for (let i = 0; i < text.length; i++) {
    const character = compact(text[i]);
    if (!character) continue;
    value += character;
    offsets.push(i);
  }
  return { value, offsets };
}

function isWordCharacter(character) {
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

const genericLenderNames = new Set([
  'bat loan',
  'cash 100',
  'easy cash',
  'flash cash',
  'happy credit',
  'happy loan',
  'hatulong',
  'little cash',
  'umbrella',
]);

function hasLoanContext(text, start, end) {
  const before = text.slice(Math.max(0, start - 90), start);
  const after = text.slice(end, Math.min(text.length, end + 90));
  return /\b(?:loan|lending|lender|pera|cash|credit|pautang|hiram|bayad|installment|loan app)\b/i.test(
    `${before} ${after}`,
  );
}

function loadLenderNames() {
  if (lenderNames) return lenderNames;
  lenderNames = loadLines(lendersPath)
    .map((name) => ({ name, key: compact(name) }))
    .filter((entry) => entry.key.length >= 5 && !genericLenderNames.has(entry.name.toLowerCase()));
  return lenderNames;
}

export function matchStoppedLenders(text, urls) {
  const source = String(text || '');
  const indexed = compactText(source);
  const matches = [];
  const byStart = new Map();

  const addMatch = (name, start, end) => {
    if (start < 0 || end <= start) return;
    const previous = byStart.get(start);
    if (previous && previous.name.length >= name.length) return;
    const match = {
      name,
      evidence: [{ start, end, text: source.slice(start, end) }],
    };
    if (previous) matches.splice(matches.indexOf(previous), 1, match);
    else matches.push(match);
    byStart.set(start, match);
  };

  for (const { name, key } of loadLenderNames()) {
    let from = 0;
    while (from <= indexed.value.length - key.length) {
      const at = indexed.value.indexOf(key, from);
      if (at < 0) break;
      from = at + 1;
      const start = indexed.offsets[at];
      const end = indexed.offsets[at + key.length - 1] + 1;
      if (isWordCharacter(source[start - 1]) || isWordCharacter(source[end])) continue;
      if (genericLenderNames.has(name.toLowerCase()) && !hasLoanContext(source, start, end)) continue;
      addMatch(name, start, end);
      break;
    }

    for (const info of Array.isArray(urls) ? urls : []) {
      const rawHost = String(info?.host || '');
      const labels = rawHost.split('.').filter(Boolean);
      const matchedLabel = labels.find((label) => compact(label) === key);
      if (!matchedLabel) continue;
      const start = source.indexOf(matchedLabel);
      if (start < 0) continue;
      const end = start + matchedLabel.length;
      if (genericLenderNames.has(name.toLowerCase()) && !hasLoanContext(source, start, end)) continue;
      addMatch(name, start, end);
    }
  }
  return matches;
}

export function assessUrlReferences(text, urls) {
  return {
    phishing: matchKnownPhishingHosts(urls),
    gambling: matchReportedGamblingHosts(urls),
    reviewedGambling: matchReviewedGamblingHosts(urls),
    unlistedGambling: matchUnlistedGamblingHosts(text, urls),
    fakeRegulator: matchFakeRegulatorHosts(urls),
    lenders: matchStoppedLenders(text, urls),
  };
}
