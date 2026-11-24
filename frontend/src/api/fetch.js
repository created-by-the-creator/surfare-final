import { SURFARE_ORIGIN } from '../../../extension/identity.js';

const SERVICES = new Set(['/api/detect', '/api/check-url', '/api/image-detect', '/api/surfy']);
export function extensionApiOrigin(value) {
  return [SURFARE_ORIGIN, 'http://127.0.0.1:8790', 'http://localhost:8790'].includes(value) ? value : SURFARE_ORIGIN;
}

export function extensionFetch(path, options = {}, fetcher = fetch, origin = SURFARE_ORIGIN) {
  if (!SERVICES.has(path)) throw Error('unsupported_service');
  const method = options.method || 'GET';
  if (!['GET', 'POST'].includes(method)) throw Error('unsupported_method');
  const body = options.body ? JSON.parse(options.body) : null;
  return fetcher(`${extensionApiOrigin(origin)}/api/extension`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: options.signal,
    credentials: 'omit', body: JSON.stringify({ path, method, body }),
  });
}

export function apiFetch(path, options = {}) {
  return import.meta.env.MODE === 'extension'
    ? extensionFetch(path, options, fetch, import.meta.env.VITE_EXTENSION_API_ORIGIN)
    : fetch(path, options);
}
