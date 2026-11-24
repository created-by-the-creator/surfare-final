export const OFFLINE_CACHE_NAME = 'surfare-ocr-offline-v2';
export const LEGACY_OFFLINE_CACHE_NAMES = Object.freeze(['surfare-ocr-offline-v1']);
// These sizes and hashes must match the files in frontend/public. resources.test.js verifies them.
export const OFFLINE_RESOURCES = [
  { url: '/tesseract/worker.min.js', bytes: 111307, sha256: '576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d' },
  { url: '/tesseract/tesseract-core-simd-lstm.wasm.js', bytes: 3899472, sha256: 'c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38' },
  { url: '/tesseract/tesseract-core-simd-lstm.wasm', bytes: 2857601, sha256: '34e8d50cac216427d86bf397d610fdd9f49492539bbcdfbfccc4eda20c810bea' },
  { url: '/tessdata/eng.traineddata.gz', bytes: 10923060, decodedBytes: 23466654, sha256: 'daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047' },
  { url: '/tessdata/fil.traineddata.gz', bytes: 1516176, decodedBytes: 2509440, sha256: '1fae58039fcc8f56357579a10a049e25c68e7b08415b82c64fae1df1d01ce15c' },
];
export const OFFLINE_PACK_BYTES = OFFLINE_RESOURCES.reduce((sum, resource) => sum + resource.bytes, 0);
export const OFFLINE_STORAGE_BYTES = OFFLINE_RESOURCES.reduce((sum, resource) => sum + (resource.decodedBytes || resource.bytes), 0);

const expectedSizes = (resource) => [resource.bytes, resource.decodedBytes].filter(Boolean);

async function sha256(body) {
  const digest = await crypto.subtle.digest('SHA-256', await body.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validResponse(response, resource) {
  if (!response?.ok || /text\/html/i.test(response.headers.get('content-type') || '')) return false;
  const knownSize = Number(response.headers.get('x-surfare-bytes') || response.headers.get('content-length'));
  if (!expectedSizes(resource).includes(knownSize)) return false;
  const declared = response.headers.get('x-surfare-sha256');
  if (declared && declared !== resource.sha256) return false;
  // Verify the cached bytes themselves; a size check alone cannot detect a
  // truncated, replaced, or partially written OCR language file.
  try {
    return (await sha256(response)) === resource.sha256;
  }
  catch {
    return false;
  }
}

export async function pruneLegacyOfflineCaches(cacheStorage = globalThis.caches) {
  if (!cacheStorage) return 0;
  let removed = 0;
  for (const name of LEGACY_OFFLINE_CACHE_NAMES) {
    try {
      if (await cacheStorage.delete(name)) removed += 1;
    }
    catch {}
  }
  return removed;
}

export async function inspectOfflinePack(cacheStorage = globalThis.caches) {
  if (!cacheStorage) return { supported: false, ready: false, bytes: 0 };
  const cache = await cacheStorage.open(OFFLINE_CACHE_NAME);
  let bytes = 0, complete = 0;
  for (const resource of OFFLINE_RESOURCES) {
    if (await validResponse(await cache.match(resource.url), resource)) { bytes += resource.bytes; complete++; }
  }
  const ready = complete === OFFLINE_RESOURCES.length;
  if (ready) await pruneLegacyOfflineCaches(cacheStorage);
  return { supported: true, ready, bytes };
}

export async function downloadOfflinePack({ cacheStorage = globalThis.caches, fetcher = fetch, signal, onProgress = () => {} } = {}) {
  if (!cacheStorage) throw Error('offline_storage_unavailable');
  const cache = await cacheStorage.open(OFFLINE_CACHE_NAME);
  let loaded = (await inspectOfflinePack(cacheStorage)).bytes;
  onProgress({ loaded, total: OFFLINE_PACK_BYTES });
  for (const resource of OFFLINE_RESOURCES) {
    signal?.throwIfAborted();
    if (await validResponse(await cache.match(resource.url), resource)) continue;
    await cache.delete(resource.url);
    const response = await fetcher(resource.url, { cache: 'reload', signal });
    if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) throw Error('offline_download_failed');
    const chunks = [];
    let current = 0;
    // Some hosts serve .gz with Content-Encoding: gzip, so fetch exposes the decoded body.
    const bodyBytes = /gzip/i.test(response.headers.get('content-encoding') || '') ? resource.decodedBytes || resource.bytes : resource.bytes;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          signal?.throwIfAborted();
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value); current += value.byteLength;
          if (current > Math.max(...expectedSizes(resource))) throw Error('offline_resource_changed');
          onProgress({ loaded: loaded + Math.min(resource.bytes, current / bodyBytes * resource.bytes), total: OFFLINE_PACK_BYTES });
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    } else {
      const bytes = await response.arrayBuffer();
      chunks.push(bytes); current = bytes.byteLength;
    }
    if (!expectedSizes(resource).includes(current)) throw Error('offline_resource_changed');
    const body = new Blob(chunks);
    if ((await sha256(body)) !== resource.sha256) throw Error('offline_resource_changed');
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.set('content-length', String(current));
    headers.set('x-surfare-bytes', String(current));
    headers.set('x-surfare-sha256', resource.sha256);
    await cache.put(resource.url, new Response(body, { status: 200, headers }));
    // Progress tracks download bytes, not the larger decoded OCR data.
    loaded += resource.bytes;
    onProgress({ loaded, total: OFFLINE_PACK_BYTES });
  }
  return inspectOfflinePack(cacheStorage);
}
