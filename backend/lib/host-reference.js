import { parse as parseDomain } from 'tldts';
import { isShortLinkHost } from './short-links.js';

// Browser-safe hostname helpers shared by the Node detector and the bundled
// offline reference checks. A match is a clue for review, never an approval.
export function normalizeHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export function hostCandidates(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return [];
  return [...new Set([normalized, normalized.replace(/^www\./, '')])].filter(Boolean);
}

export function hostSuffixes(host) {
  const normalized = normalizeHost(host);
  if (!normalized || !normalized.includes('.')) return [];
  let base = normalized;
  try {
    base = normalizeHost(parseDomain(normalized, { allowPrivateDomains: true }).domain || normalized);
  } catch {}
  const labels = normalized.split('.');
  const baseCount = base.split('.').length;
  const suffixes = [];
  for (let i = 0; i <= labels.length - baseCount; i += 1) {
    suffixes.push(labels.slice(i).join('.'));
  }
  return [...new Set(suffixes)];
}

export function matchesHostSet(urls, set) {
  const matches = [];
  const seen = new Set();
  for (const info of Array.isArray(urls) ? urls : []) {
    for (const candidate of hostCandidates(info?.host)) {
      for (const suffix of hostSuffixes(candidate)) {
        if (!set.has(suffix) || isShortLinkHost(suffix)) continue;
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
