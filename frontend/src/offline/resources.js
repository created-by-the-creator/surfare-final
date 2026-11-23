export const OFFLINE_CACHE_NAME = 'surfare-ocr-offline-v1';
// These sizes must match the files in frontend/public. resources.test.js verifies them.
export const OFFLINE_RESOURCES = [
  { url: '/tesseract/worker.min.js', bytes: 111307 },
  { url: '/tesseract/tesseract-core-simd-lstm.wasm.js', bytes: 3899472 },
  { url: '/tesseract/tesseract-core-simd-lstm.wasm', bytes: 2857601 },
  { url: '/tessdata/eng.traineddata.gz', bytes: 10923060, decodedBytes: 23466654 },
  { url: '/tessdata/fil.traineddata.gz', bytes: 1516176, decodedBytes: 2509440 },
];
export const OFFLINE_PACK_BYTES = OFFLINE_RESOURCES.reduce((sum, resource) => sum + resource.bytes, 0);
export const OFFLINE_STORAGE_BYTES = OFFLINE_RESOURCES.reduce((sum, resource) => sum + (resource.decodedBytes || resource.bytes), 0);

const expectedSizes = (resource) => [resource.bytes, resource.decodedBytes].filter(Boolean);

async function validResponse(response, resource) {
  if (!response?.ok || /text\/html/i.test(response.headers.get('content-type') || '')) return false;
  const knownSize = Number(response.headers.get('x-surfare-bytes') || response.headers.get('content-length'));
  return expectedSizes(resource).includes(knownSize || (await response.clone().arrayBuffer()).byteLength);
}

export async function inspectOfflinePack(cacheStorage = globalThis.caches) {
  if (!cacheStorage) return { supported: false, ready: false, bytes: 0 };
  const cache = await cacheStorage.open(OFFLINE_CACHE_NAME);
  let bytes = 0, complete = 0;
  for (const resource of OFFLINE_RESOURCES) {
    if (await validResponse(await cache.match(resource.url), resource)) { bytes += resource.bytes; complete++; }
  }
  return { supported: true, ready: complete === OFFLINE_RESOURCES.length, bytes };
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
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.set('content-length', String(current));
    headers.set('x-surfare-bytes', String(current));
    await cache.put(resource.url, new Response(new Blob(chunks), { status: 200, headers }));
    loaded += current;
    onProgress({ loaded, total: OFFLINE_PACK_BYTES });
  }
  return inspectOfflinePack(cacheStorage);
}
