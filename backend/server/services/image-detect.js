import { detectAiImage, sightengineConfiguration } from '../providers/sightengine.js';

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const source = new URL(origin), target = new URL(request.url);
    if (source.origin === target.origin) return true;
    const local = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (source.protocol === 'http:' && target.protocol === 'http:' && local.has(source.hostname) && local.has(target.hostname)) return true;
    return String(env.IMAGE_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(source.origin);
  } catch { return false; }
}

export async function imageDetect(request, env = {}, fetcher = fetch) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const unavailable = (reason, status) => json({ status: 'unavailable', reason }, status);
  const config = sightengineConfiguration(env);
  if (request.method === 'GET') return json(config);
  if (request.method !== 'POST') return unavailable('method', 405);
  if (!allowedOrigin(request, env)) return unavailable('origin', 403);
  if (Number(request.headers.get('content-length') || 0) > 1100000) return unavailable('too_large', 413);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 1050000) return unavailable('too_large', 413);
    body = JSON.parse(raw);
  } catch { return unavailable('invalid_request', 400); }
  if (body?.consent !== true) return unavailable('consent', 400);
  if (body.provider !== 'sightengine') return unavailable('provider', 409);
  if (body.mode !== 'origin') return unavailable('invalid_mode', 400);
  if (typeof body.image !== 'string' || body.image.length > 1000000 ||
      !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(body.image) ||
      (body.image.length - 'data:image/jpeg;base64,'.length) % 4 !== 0) return unavailable('invalid_image', 400);
  if (!config.configured) return unavailable('not_configured', 503);
  const result = await detectAiImage(body.image, env, fetcher);
  if (result.status !== 'completed') return unavailable(result.reason, result.reason === 'quota' ? 429 : result.reason === 'timeout' ? 504 : 502);
  return json({ status: 'completed', provider: config.provider, providerId: config.providerId,
    model: config.model, checkedAt: new Date().toISOString(), detection: result.detection });
}
