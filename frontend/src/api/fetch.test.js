import { describe, expect, it, vi } from 'vitest';
import { extensionApiOrigin, extensionFetch } from './fetch.js';
describe('extension API adapter', () => {
  it('sends bounded service requests to the Surfare gateway, omitting cookies and preserving cancellation', async () => {
    const fetcher = vi.fn(async () => Response.json({ configured: true }));
    const signal = new AbortController().signal;
    await extensionFetch('/api/image-detect', { signal }, fetcher);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://surfare.vercel.app/api/extension');
    expect(options.credentials).toBe('omit');
    expect(options.signal).toBe(signal);
    expect(JSON.parse(options.body)).toEqual({ path: '/api/image-detect', method: 'GET', body: null });
  });
  it('keeps the explicit AI consent in the actual service body', async () => {
    const fetcher = vi.fn(async () => Response.json({}));
    await extensionFetch('/api/detect', { method: 'POST', body: JSON.stringify({ text: 'hello', ai: true, consent: true }) }, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).body.consent).toBe(true);
    expect(() => extensionFetch('https://evil.test/api', {}, fetcher)).toThrow();
    expect(extensionApiOrigin('https://surfare.vercel.app.evil')).toBe('https://surfare.vercel.app');
    expect(extensionApiOrigin('http://127.0.0.1:8790')).toBe('http://127.0.0.1:8790');
  });
});
