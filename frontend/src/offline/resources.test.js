import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { OFFLINE_CACHE_NAME, OFFLINE_RESOURCES, OFFLINE_PACK_BYTES, downloadOfflinePack, inspectOfflinePack } from './resources.js';

function fakeStorage() {
  const entries = new Map();
  const cache = {
    match: async (url) => entries.get(url)?.clone(),
    put: async (url, response) => entries.set(url, response.clone()),
    delete: async (url) => entries.delete(url),
  };
  return { entries, open: async (name) => { expect(name).toBe(OFFLINE_CACHE_NAME); return cache; } };
}
const resourceResponse = (resource) => new Response(new Uint8Array(resource.bytes), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(resource.bytes) } });

describe('offline resource pack', () => {
  it('pins the actual shipped OCR files and their complete size', () => {
    for (const resource of OFFLINE_RESOURCES) {
      const file = readFileSync(new URL(`../../public${resource.url}`, import.meta.url));
      expect(file.length).toBe(resource.bytes);
      if (resource.decodedBytes) expect(gunzipSync(file).length).toBe(resource.decodedBytes);
    }
    expect(OFFLINE_PACK_BYTES).toBe(19307809);
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
    const fetcher = async (url) => {
      const resource = OFFLINE_RESOURCES.find((item) => item.url === url);
      return resource.decodedBytes ? new Response(new Uint8Array(resource.decodedBytes), { headers: { 'Content-Encoding': 'gzip', 'Content-Length': String(resource.bytes) } }) : resourceResponse(resource);
    };
    expect((await downloadOfflinePack({ cacheStorage, fetcher })).ready).toBe(true);
    for (const resource of OFFLINE_RESOURCES.filter((item) => item.decodedBytes)) {
      expect(cacheStorage.entries.get(resource.url).headers.has('content-encoding')).toBe(false);
      expect(Number(cacheStorage.entries.get(resource.url).headers.get('content-length'))).toBe(resource.decodedBytes);
    }
  });
});
