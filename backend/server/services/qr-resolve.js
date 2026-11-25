import { assessContent } from '../../lib/content-assessment.js';
import { describeQrPayload } from '../../lib/qr-links.js';
import { levelForIndicators, scoreForIndicators } from '../../lib/pattern-detection.js';
import { isShortLinkHost } from '../../lib/short-links.js';

export const MAX_QR_REDIRECTS = 5;
const redirects = new Set([301, 302, 303, 307, 308]);
const rank = { 'Insufficient evidence': 0, 'Low risk': 0, Suspicious: 1, 'High risk': 2 };
function rowFor(url) {
  const assessment = assessContent({ text: url, kind: 'link' });
  return { url, domain: new URL(url).hostname, visited: false, httpStatus: null,
    level: assessment.level, score: assessment.score,
    indicators: assessment.indicators.filter(item => !['dataset-url-model', 'dataset-text-model'].includes(item.id)).slice(0, 8) };
}

export async function resolveQrChain(originalUrl, transport, { timeoutMs = 10000 } = {}) {
  const chain = [], visited = new Set(), signal = AbortSignal.timeout(timeoutMs);
  let current = new URL(originalUrl).href, redirectCount = 0;
  const finish = (status, reason = null) => {
    // Shortening is a format/verification issue, not evidence of a harmful site.
    for (const row of chain) {
      row.indicators = row.indicators.filter(item => !['shortener', 'url_shortener'].includes(item.id));
      row.level = levelForIndicators(row.indicators, { sufficient: false });
      row.score = scoreForIndicators(row.indicators);
    }
    const strongest = chain.reduce((best, row) => (rank[row.level] || 0) > (rank[best.level] || 0) ? row : best,
      { level: 'Insufficient evidence', score: 0 });
    return { status, reason, originalUrl, chain, redirectCount,
      urlType: status === 'resolved' ? redirectCount ? 'redirected' : 'direct' : 'unverified',
      finalDestination: status === 'resolved' ? current : null,
      riskLevel: strongest.level, score: Math.max(0, ...chain.map(row => Number(row.score) || 0)) };
  };
  while (true) {
    const row = rowFor(current); chain.push(row);
    try {
      const key = new URL(current); key.hash = '';
      if (visited.has(key.href)) return finish('unresolved', 'redirect_loop');
      visited.add(key.href);
      signal.throwIfAborted();
      let response = await transport(current, { method: 'HEAD', signal });
      if ([405, 501].includes(response.status)) response = await transport(current, { method: 'GET', signal });
      row.visited = true; row.httpStatus = response.status;
      if (redirects.has(response.status)) {
        if (!response.location) return finish('unresolved', 'missing_location');
        if (response.location.length > 2048) return finish('unresolved', 'blocked_target');
        let next;
        try { next = new URL(response.location, current); } catch { return finish('unresolved', 'invalid_redirect'); }
        if (!['http:', 'https:'].includes(next.protocol)) return finish('unresolved', 'blocked_target');
        redirectCount++;
        current = next.href;
        if (redirectCount > MAX_QR_REDIRECTS) { chain.push(rowFor(current)); return finish('unresolved', 'redirect_limit'); }
        continue;
      }
      if (response.status >= 200 && response.status < 300) return isShortLinkHost(new URL(current).hostname)
        ? finish('unresolved', 'hidden_destination') : finish('resolved');
      return finish('unresolved', 'http_error');
    } catch (error) {
      return finish('unresolved', error.code === 'blocked_target' ? 'blocked_target'
        : signal.aborted || ['AbortError', 'TimeoutError'].includes(error.name) || error.code === 'timeout' ? 'timeout' : 'network');
    }
  }
}

let active = 0;
const requests = new Map();
export async function qrResolve(request, env = {}, transport) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return json({ status: 'unresolved', reason: 'method' }, 405);
  try {
    const origin = request.headers.get('origin');
    if (origin) {
      const source = new URL(origin), target = new URL(request.url);
      const local = [source, target].every(url => url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
      if (!local && source.origin !== target.origin) return json({ status: 'unresolved', reason: 'origin' }, 403);
    }
    const raw = await request.text();
    if (raw.length > 5000) return json({ status: 'unresolved', reason: 'invalid_request' }, 413);
    const input = JSON.parse(raw);
    if (input?.consent !== true || typeof input.url !== 'string' || input.url.length > 2048) return json({ status: 'unresolved', reason: 'invalid_request' }, 400);
    const url = new URL(input.url);
    if (!['http:', 'https:'].includes(url.protocol)) return json({ status: 'unresolved', reason: 'invalid_request' }, 400);
    if (describeQrPayload(input.url).blocked) return json({ status: 'unresolved', reason: 'blocked_target' }, 400);
    if (!transport) return json({ status: 'unresolved', reason: 'service_unavailable' }, 503);
    const now = Date.now(), identity = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || 'local';
    for (const [key, entry] of requests) if (entry.until <= now) requests.delete(key);
    const entry = requests.get(identity) || { count: 0, until: now + 60000 };
    if (active >= 4 || entry.count >= 15 || requests.size >= 1000) return json({ status: 'unresolved', reason: 'rate_limit' }, 429);
    entry.count++; requests.set(identity, entry); active++;
    try { return json(await resolveQrChain(url.href, transport)); }
    finally { active--; }
  } catch { return json({ status: 'unresolved', reason: 'invalid_request' }, 400); }
}
