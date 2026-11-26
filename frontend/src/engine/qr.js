import jsQR from 'jsqr';

const MAX_CODES = 8;
const options = { inversionAttempts: 'attemptBoth' };

function eraseCode(image, location) {
  // Clear the decoded quadrilateral so another pass can find the next code.
  // Only the private QR scan buffer is modified, never the image used for OCR.
  const corners = [location.topLeftCorner, location.topRightCorner, location.bottomRightCorner, location.bottomLeftCorner];
  const top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))));
  const bottom = Math.min(image.height, Math.ceil(Math.max(...corners.map((p) => p.y))));
  for (let y = top; y < bottom; y++) {
    const x = [];
    const row = y + 0.5;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      if ((a.y > row) !== (b.y > row)) x.push(a.x + (b.x - a.x) * (row - a.y) / (b.y - a.y));
    }
    if (x.length < 2) continue;
    const start = y * image.width + Math.max(0, Math.floor(Math.min(...x)));
    const end = y * image.width + Math.min(image.width, Math.ceil(Math.max(...x)));
    image.data.fill(255, start * 4, end * 4);
  }
}

function scan(image, values) {
  for (let attempt = 0; attempt < MAX_CODES && values.size < MAX_CODES; attempt++) {
    const code = jsQR(image.data, image.width, image.height, options);
    if (!code?.data) return;
    values.add(code.data);
    eraseCode(image, code.location);
  }
}

export function decodeQrValues(image, scanRegions = true) {
  const values = new Set();
  scan(image, values);
  // Nearby codes can cause the whole-image locator to mix two sets of finder
  // patterns. Try overlapping quadrants when the initial scan is ambiguous.
  if (values.size === 0 && scanRegions && Math.min(image.width, image.height) >= 240) {
    const width = Math.ceil(image.width * 0.6), height = Math.ceil(image.height * 0.6);
    const crop = new Uint8ClampedArray(width * height * 4);
    for (const y of [0, image.height - height]) {
      for (const x of [0, image.width - width]) {
        for (let row = 0; row < height; row++) {
          const start = ((y + row) * image.width + x) * 4;
          crop.set(image.data.subarray(start, start + width * 4), row * width * 4);
        }
        scan({ width, height, data: crop }, values);
      }
    }
  }
  // Small codes and tightly cropped screenshots may lack the clear border
  // needed by the locator. Add one and enlarge pixels without blurring edges.
  if (!values.size) {
    const scale = Math.min(image.width, image.height) < 400 ? 3 : 1;
    const padding = 32;
    const width = image.width * scale + padding * 2;
    const height = image.height * scale + padding * 2;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const source = (y * image.width + x) * 4;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const target = ((padding + y * scale + dy) * width + padding + x * scale + dx) * 4;
            data.set(image.data.subarray(source, source + 4), target);
          }
        }
      }
    }
    scan({ width, height, data }, values);
  }
  return [...values];
}
