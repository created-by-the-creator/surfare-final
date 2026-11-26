import { bitmapCanvas, ocrCanvas, preprocessCanvas, rotateCanvas } from '../../../backend/lib/image-tools.js';
import { recognizeImage } from '../../../backend/lib/ocr.js';

const WORKER_OPTIONS = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
  langPath: '/tessdata',
  gzip: true,
  workerBlobURL: false,
};

function readPixels(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('canvas_unavailable');
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function scanQrCodes(canvas) {
  let worker;
  try {
    worker = new Worker(new URL('./qr-reader.worker.js', import.meta.url), { type: 'module' });
  } catch { /* Some browsers disable module workers. */ }
  async function read(source, scanRegions) {
    if (worker) {
      try {
        const pixels = readPixels(source);
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('qr_timeout')), 8000);
          worker.onmessage = ({ data }) => {
            clearTimeout(timer);
            data.failed ? reject(Error('qr_failed')) : resolve(data.values);
          };
          worker.onerror = worker.onmessageerror = error => { clearTimeout(timer); reject(error); };
          worker.postMessage({ pixels, scanRegions }, [pixels.data.buffer]);
        });
      } catch {
        worker.terminate();
        worker = null;
      }
    }
    const { decodeQrValues } = await import('./qr.js');
    return decodeQrValues(readPixels(source), scanRegions);
  }
  try {
    const needsSample = Math.max(canvas.width, canvas.height) > 1400;
    if (!needsSample) return await read(canvas, true);
    const sample = rotateCanvas(canvas, 0, 1400);
    const small = await read(sample, true);
    const full = await read(canvas, !small.length);
    return [...new Set([...small, ...full])].slice(0, 8);
  } finally {
    worker?.terminate();
  }
}

async function readImageText(canvas) {
  let worker;
  try {
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker('eng+fil', undefined, WORKER_OPTIONS);
    const source = ocrCanvas(canvas);
    const data = await recognizeImage(worker, source, {
      checkOrientation: true,
      prepareRotation: (turn, full) => rotateCanvas(source, turn, full ? Infinity : 1400),
      prepareRetry: preprocessCanvas,
    });
    const text = data.text.trim();
    const ocrConfidence = Number.isFinite(data.confidence) ? data.confidence : null;
    const uncertainExtraction = !text || ocrConfidence === null || ocrConfidence < 65;
    return { text, ocrConfidence, uncertainExtraction };
  } catch {
    // A missing offline OCR pack must not discard a successfully decoded QR.
    return { text: '', ocrConfidence: null, uncertainExtraction: true };
  } finally {
    await worker?.terminate();
  }
}

export async function inspectImage(file, { includeOcr = true } = {}) {
  const bitmap = await createImageBitmap(file);
  let canvas, width, height;
  try {
    ({ width, height } = bitmap);
    canvas = bitmapCanvas(bitmap);
  } finally {
    bitmap.close();
  }
  const qrValues = await scanQrCodes(canvas);
  const reading = includeOcr
    ? await readImageText(canvas)
    : { text: '', ocrConfidence: null, uncertainExtraction: false };
  return { ...reading, qrValue: qrValues[0] || '', qrValues, width, height };
}
