import { normalizeUrl } from './url-input.js';
import { isPrivateQrPayload, isUnsupportedQrPayload } from './qr-payload.js';
import { isShortLinkHost } from './short-links.js';

// A local label only. Unlisted hosts can redirect too; every web link can be checked.
export function isLocalQrHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host.includes('.') && !host.includes(':')) return true;
  if (/(?:^|\.)(?:localhost|local|localdomain|internal|intranet|corp|home|lan|onion|invalid|test|example)$/.test(host) || host.endsWith('.home.arpa')) return true;
  if (host.includes(':')) return !/^[23][0-9a-f]{3}:/.test(host) || /^2001:(?:db8|0*:)/.test(host) || /^2002:|^3fff:/.test(host);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127;
  }
  return false;
}

export function describeQrPayload(value) {
  const text = String(value || '').trim();
  if (isPrivateQrPayload(text)) return { type: 'private' };
  if (isUnsupportedQrPayload(text) || /^(?!https?:)[a-z][a-z\d+.-]*:/i.test(text) && !/\s/.test(text)) return { type: 'unsupported' };
  if (/\s/.test(text) || !text) return { type: 'text' };
  try {
    const url = normalizeUrl(text);
    const sensitiveQuery = [...url.searchParams.keys()].some(key => /^(?:access_token|id_token|token|secret|otp|password|passcode|auth|authorization|signature|code|api_key|apikey|session|sessionid)$/i.test(key));
    const blocked = Boolean(url.username || url.password || url.port || sensitiveQuery || isLocalQrHost(url.hostname));
    return { type: 'url', originalValue: text, url: url.href, domain: url.hostname,
      urlType: isShortLinkHost(url.hostname) ? 'shortened' : 'web', blocked };
  } catch { return { type: 'text' }; }
}

export function qrPayloads(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))].slice(0, 8)
    .map(describeQrPayload);
}
