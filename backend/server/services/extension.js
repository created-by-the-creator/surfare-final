import { EXTENSION_ID } from '../../../extension/identity.js';
import { detect } from './detect.js';
import { imageDetect } from './image-detect.js';
import { surfyChat } from './surfy.js';
import { verifyUrls } from './reputation.js';

// A fixed service dispatch, not a URL proxy. Existing service validation and
// explicit AI consent still apply after the extension-origin check.
export async function extensionApi(request, env = {}, fetcher = fetch) {
  const origin = request.headers.get('origin');
  const ids = [EXTENSION_ID, ...String(env.EXTENSION_ALLOWED_IDS || '').split(',').map(value => value.trim())]
    .filter(value => /^[a-p]{32}$/.test(value));
  const allowed = !origin || ids.some(id => origin === `chrome-extension://${id}`);
  const cors = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && allowed) Object.assign(cors, {
    'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  const json = (body, status) => Response.json(body, { status, headers: cors });
  if (!allowed) return json({ status: 'unavailable', reason: 'origin' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ status: 'unavailable' }, 405);
  let envelope;
  try {
    const raw = await request.text();
    if (raw.length > 1050000) return json({ status: 'unavailable', reason: 'too_large' }, 413);
    envelope = JSON.parse(raw);
  } catch { return json({ status: 'unavailable', reason: 'invalid_request' }, 400); }
  const { path, method, body } = envelope || {};
  const services = { '/api/detect': detect, '/api/image-detect': imageDetect, '/api/surfy': surfyChat };
  if (!Object.hasOwn(services, path) && path !== '/api/check-url') return json({ status: 'unavailable' }, 404);
  if (!['GET', 'POST'].includes(method) || (method === 'GET' && path !== '/api/image-detect')) return json({ status: 'unavailable' }, 405);
  let response;
  if (path === '/api/check-url') {
    try {
      const url = new URL(body?.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.href.length > 2048) throw Error();
      const report = await verifyUrls([url.href], env, fetcher);
      const data = await report.json();
      response = data.status === 'completed'
        ? Response.json({ matched: data.results[0].threats.length > 0 })
        : Response.json({ unavailable: true }, { status: report.status });
    } catch { return json({ status: 'unavailable' }, 400); }
  } else {
    const forwarded = new Request(new URL(path, request.url), {
      method, headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
    response = await services[path](forwarded, env, fetcher);
  }
  const headers = new Headers(response.headers);
  Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}
