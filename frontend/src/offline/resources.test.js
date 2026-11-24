import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  OFFLINE_CACHE_NAME,
  OFFLINE_RESOURCES,
  OFFLINE_PACK_BYTES,
  LEGACY_OFFLINE_CACHE_NAMES,
  downloadOfflinePack,
  inspectOfflinePack,
} from './resources.js';

function fakeStorage() {
  const entries = new Map();
  const deleted = new Set();
  const cache = {
    match: async (url) => entries.get(url)?.clone(),
    put: async (url, response) => entries.set(url, response.clone()),
    delete: async (url) => entries.delete(url),
  };
  return {
    entries,
    deleted,
    open: async (name) => { expect(name).toBe(OFFLINE_CACHE_NAME); return cache; },
    delete: async (name) => { deleted.add(name); return true; },
  };
}

function resourceBytes(resource) {
  const file = readFileSync(new URL(`../../public${resource.url}`, import.meta.url));
  return resource.decodedBytes ? gunzipSync(file) : file;
}

function resourceResponse(resource) {
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Length': String(resource.bytes) };
  if (resource.decodedBytes) headers['Content-Encoding'] = 'gzip';
  return new Response(new Uint8Array(resourceBytes(resource)), { headers });
}

describe('offline resource pack', () => {
  it('pins the actual shipped OCR files and their complete size and hash', async () => {
    for (const resource of OFFLINE_RESOURCES) {
      const file = readFileSync(new URL(`../../public${resource.url}`, import.meta.url));
      expect(file.length).toBe(resource.bytes);
      if (resource.decodedBytes) expect(gunzipSync(file).length).toBe(resource.decodedBytes);
      const value = resourceBytes(resource);
      const digest = await crypto.subtle.digest('SHA-256', value);
      expect([...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(resource.sha256);
    }
    expect(OFFLINE_PACK_BYTES).toBe(19307616);
  });
  it('downloads, caches, and recognizes a complete pack without another request', async () => {
    const cacheStorage = fakeStorage(); let requests = 0;
    const fetcher = async (url) => { requests++; return resourceResponse(OFFLINE_RESOURCES.find((resource) => resource.url === url)); };
    const progress = [];
    expect((await inspectOfflinePack(cacheStorage)).ready).toBe(false);
    expect((await downloadOfflinePack({ cacheStorage, fetcher, onProgress: (value) => progress.push(value.loaded) })).ready).toBe(true);
    expect(requests).toBe(5);
    expect(progress.at(-1)).toBe(OFFLINE_PACK_BYTES);
    await downloadOfflinePack({ cacheStorage, fetcher });
    expect(requests).toBe(5);
  });
  it('keeps completed files and resumes after a failed response', async () => {
    const cacheStorage = fakeStorage(); let fail = true; const requests = [];
    const fetcher = async (url) => {
      requests.push(url);
      if (url === OFFLINE_RESOURCES[1].url && fail) return new Response('failed', { status: 503 });
      return resourceResponse(OFFLINE_RESOURCES.find((resource) => resource.url === url));
    };
    await expect(downloadOfflinePack({ cacheStorage, fetcher })).rejects.toThrow('offline_download_failed');
    expect((await inspectOfflinePack(cacheStorage)).bytes).toBe(OFFLINE_RESOURCES[0].bytes);
    fail = false;
    await downloadOfflinePack({ cacheStorage, fetcher });
    expect(requests.filter((url) => url === OFFLINE_RESOURCES[0].url)).toHaveLength(1);
  });
  it('replaces a cached resource whose bytes do not match the pinned hash', async () => {
    const cacheStorage = fakeStorage();
    const resource = OFFLINE_RESOURCES[0];
    await cacheStorage.open(OFFLINE_CACHE_NAME).then((cache) => cache.put(resource.url, new Response(new Uint8Array(resource.bytes), {
      headers: { 'Content-Length': String(resource.bytes), 'x-surfare-sha256': resource.sha256 },
    })));
    expect((await inspectOfflinePack(cacheStorage)).ready).toBe(false);
    let requests = 0;
    const result = await downloadOfflinePack({
      cacheStorage,
      fetcher: async (url) => {
        requests += 1;
        return resourceResponse(OFFLINE_RESOURCES.find((item) => item.url === url));
      },
    });
    expect(result.ready).toBe(true);
    expect(requests).toBe(OFFLINE_RESOURCES.length);
    expect((await inspectOfflinePack(cacheStorage)).bytes).toBe(OFFLINE_PACK_BYTES);
  });
  it('does not mistake an HTML fallback or a truncated resource for a download', async () => {
    for (const response of [new Response('<html>not a resource</html>', { headers: { 'Content-Type': 'text/html' } }), new Response('short')]) {
      const cacheStorage = fakeStorage();
      await expect(downloadOfflinePack({ cacheStorage, fetcher: async () => response })).rejects.toThrow();
      expect(cacheStorage.entries.size).toBe(0);
    }
  });
  it('supports cancellation and unavailable cache storage', async () => {
    expect((await inspectOfflinePack(null)).supported).toBe(false);
    const controller = new AbortController(); controller.abort();
    await expect(downloadOfflinePack({ cacheStorage: fakeStorage(), signal: controller.signal })).rejects.toThrow();
    await expect(downloadOfflinePack({ cacheStorage: null })).rejects.toThrow('offline_storage_unavailable');
  });
  it('accepts language files automatically decompressed by HTTP and caches them without a gzip header', async () => {
    const cacheStorage = fakeStorage();
    const fetcher = async (url) => resourceResponse(OFFLINE_RESOURCES.find((item) => item.url === url));
    expect((await downloadOfflinePack({ cacheStorage, fetcher })).ready).toBe(true);
    for (const resource of OFFLINE_RESOURCES.filter((item) => item.decodedBytes)) {
      const cached = cacheStorage.entries.get(resource.url);
      expect(cached.headers.has('content-encoding')).toBe(false);
      expect(Number(cached.headers.get('content-length'))).toBe(resource.decodedBytes);
      expect(cached.headers.get('x-surfare-sha256')).toBe(resource.sha256);
    }
    for (const name of LEGACY_OFFLINE_CACHE_NAMES) expect(cacheStorage.deleted.has(name)).toBe(true);
  });
});
