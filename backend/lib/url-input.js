import { parse } from 'tldts';
import { decodeUrlComponent } from './url-identity.js';

export function normalizeUrl(value) {
  let s = value
    .trim()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\[\.\]|\(\.\)/g, '.')
    .replace(/^hxxp/i, 'http');
  if (!/^[a-z][a-z\d+.-]*:/i.test(s) || /^[^/:]+\.\w+:\d{1,5}(?:[/?#]|$)/u.test(s)) s = 'https://' + s;
  const u = new URL(s);
  u.hostname = u.hostname.replace(/\.$/, '');
  if (
    !['http:', 'https:'].includes(u.protocol) ||
    (!u.hostname.includes('.') && !u.hostname.includes(':'))
  )
    throw Error('Enter a complete HTTP or HTTPS website address.');
  return u;
}

export function extractUrls(text) {
  const pattern = /(?:https?|hxxps?):\/\/(?:\[\.\]|\[[\da-f:.]+\]|[^\s<>"'\[\]*])+|(?:[\p{L}\d](?:[\p{L}\d-]*[\p{L}\d])?(?:\.|\[\.\]|\(\.\)))+[\p{L}]{2,63}(?::\d{1,5})?(?:[/?#][^\s<>"'\[\]*]*)?/giu;
  const found = new Set();
  for (const match of text.matchAll(pattern)) {
    // An email domain is not itself a link in a message.
    if (text[match.index - 1] === '@') continue;
    let raw = match[0].replace(/[.,!?;:]+$/g, '');
    while (raw.endsWith(')') && raw.split(')').length > raw.split('(').length) raw = raw.slice(0, -1);
    try {
      const url = normalizeUrl(raw);
      if (/^(?:https?|hxxps?):/i.test(raw) || parse(url.hostname, { allowPrivateDomains: true }).isIcann)
        found.add(raw);
    } catch {}
    if (found.size === 10) break;
  }
  return [...found];
}

const redirectKey = /^(?:url|redirect|redirect_uri|redirect_url|next|continue|target|dest|destination|return|returnurl|return_url)$/i;

// Inspect explicit destinations embedded in an address. No redirect is followed.
export function redirectDestinations(u) {
  const destinations = new Set();
  for (const [key, value] of u.searchParams) {
    const decoded = decodeUrlComponent(value);
    if (!redirectKey.test(key) || !/^(?:https?:)?\/\//i.test(decoded)) continue;
    try {
      const target = normalizeUrl(new URL(decoded, u).href);
      if (target.hostname !== u.hostname && target.href.length <= 2048) destinations.add(target.href);
    } catch {}
    if (destinations.size >= 4) break;
  }
  return [...destinations];
}

export function urlCandidates(text, explicitUrls = []) {
  const candidates = new Map();
  const add = (url, evidence) => {
    if (!candidates.has(url) && candidates.size < 10) candidates.set(url, { url, evidence });
  };
  // Begin with the submitted spelling so a normalized client hint cannot erase its highlight.
  for (const raw of [...extractUrls(text), ...explicitUrls]) {
    try {
      const parsed = normalizeUrl(raw);
      const start = text.indexOf(raw);
      const evidence = start < 0 ? [] : [{ start, end: start + raw.length, text: raw }];
      add(parsed.href, evidence);
      const queue = [{ url: parsed, depth: 0 }];
      const visited = new Set([parsed.href]);
      while (queue.length && candidates.size < 10) {
        const current = queue.shift();
        if (current.depth >= 3) continue;
        for (const target of redirectDestinations(current.url)) {
          if (visited.has(target)) continue;
          visited.add(target);
          add(target, evidence);
          queue.push({ url: new URL(target), depth: current.depth + 1 });
        }
      }
    } catch {}
  }
  return [...candidates.values()];
}
