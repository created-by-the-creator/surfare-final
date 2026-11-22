import { decodeQrValues } from './qr.js';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ values: decodeQrValues(data.pixels, data.scanRegions) });
  } catch {
    self.postMessage({ failed: true });
  }
};
