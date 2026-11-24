import { validateImageFile } from '../../frontend/src/engine/fileValidation.js';
const MAX_BYTES = 8 * 1024 * 1024;
export function imageOriginPattern(src) {
  const url = new URL(src);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('image_unavailable');
  return `${url.origin}/*`;
}

export async function loadContextImage(src, fetcher = fetch) {
  imageOriginPattern(src);
  const response = await fetcher(src, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw Error('image_unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('file_too_large');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const blob = new Blob(chunks);
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const type = header[0] === 255 && header[1] === 216 ? 'image/jpeg' : header[0] === 137 && header[1] === 80 ? 'image/png' : 'image/webp';
  const file = new File([blob], `selected-image.${{ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type]}`, { type });
  await validateImageFile(file);
  return file;
}
