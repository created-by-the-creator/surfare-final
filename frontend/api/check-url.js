const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const recentRequests = new Map();

const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
];

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function allowRequest(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const hits = (recentRequests.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    recentRequests.set(ip, hits);
    return false;
  }
  hits.push(now);
  recentRequests.set(ip, hits);
  return true;
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!isSameOrigin(request)) return json({ error: 'Origin rejected.' }, 403);
  if (!allowRequest(request)) return json({ matched: false, unavailable: true }, 429);

  let url;
  try {
    const body = await request.json();
    url = new URL(String(body?.url || ''));
  } catch {
    return json({ error: 'Provide a URL.' }, 400);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return json({ error: 'Unsupported URL.' }, 400);
  }

  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) return json({ matched: false, unavailable: true });

  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'surfare', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: THREAT_TYPES,
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: url.href }],
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return json({ matched: false, unavailable: true });
    const data = await response.json();
    return json({ matched: Array.isArray(data.matches) && data.matches.length > 0, unavailable: false });
  } catch {
    return json({ matched: false, unavailable: true });
  }
}
