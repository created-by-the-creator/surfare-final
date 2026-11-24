import { describe, expect, it, vi } from 'vitest';
import { inspectImageMetadata } from './image-metadata.js';

const encoder = new TextEncoder();

function fileFrom(bytes) {
  return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

function pngChunk(type, data) {
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index);
  bytes.set(data, 8);
  return bytes;
}

function png(...chunks) {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array([...signature, ...chunks.flatMap((chunk) => [...chunk])]);
}

function textChunk(key, value) {
  return pngChunk('tEXt', encoder.encode(`${key}\0${value}`));
}

function endChunk() {
  return pngChunk('IEND', new Uint8Array());
}

function jpeg(...segments) {
  return new Uint8Array([0xff, 0xd8, ...segments.flatMap((segment) => [...segment]), 0xff, 0xd9]);
}

function jpegSegment(marker, data) {
  const bytes = new Uint8Array(4 + data.length);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0xff;
  bytes[1] = marker;
  view.setUint16(2, data.length + 2);
  bytes.set(data, 4);
  return bytes;
}

function exifSoftware(value) {
  const encoded = encoder.encode(`${value}\0`);
  const bytes = new Uint8Array(32 + encoded.length);
  const view = new DataView(bytes.buffer);
  bytes.set(encoder.encode('Exif\0\0'), 0);
  bytes.set(encoder.encode('II'), 6);
  view.setUint16(8, 42, true);
  view.setUint32(10, 8, true);
  view.setUint16(14, 1, true);
  view.setUint16(16, 0x0131, true);
  view.setUint16(18, 2, true);
  view.setUint32(20, encoded.length, true);
  view.setUint32(24, 26, true);
  view.setUint32(28, 0, true);
  bytes.set(encoded, 32);
  return bytes;
}

function webpC2pa(text) {
  const data = encoder.encode(text);
  const chunk = new Uint8Array(8 + data.length);
  const view = new DataView(chunk.buffer);
  chunk.set(encoder.encode('C2PA'), 0);
  view.setUint32(4, data.length, true);
  chunk.set(data, 8);
  const bytes = new Uint8Array(12 + chunk.length);
  bytes.set(encoder.encode('RIFF'), 0);
  bytes.set(encoder.encode('WEBP'), 8);
  new DataView(bytes.buffer).setUint32(4, 4 + chunk.length, true);
  bytes.set(chunk, 12);
  return bytes;
}

describe('local image metadata inspection', () => {
  it('finds Stable Diffusion parameters, seed, and editor-only software separately', async () => {
    const result = await inspectImageMetadata(
      fileFrom(
        png(
          textChunk('parameters', 'Steps: 20, Sampler: Euler a, Seed: 12345'),
          textChunk('Software', 'Adobe Photoshop 2024'),
          endChunk(),
        ),
      ),
    );

    expect(result.findings).toContain('generation-settings');
    expect(result.findings).toContain('generation-parameter');
    expect(result.findings).not.toContain('ai-tool');
    expect(result.notes).toContain('editorOnly');
    expect(result.labelKey).toBe('result.imageMetadata.label.generation');
    expect(result.fields).toBeUndefined();
  });

  it('treats an AI tool name as a clue, not proof', async () => {
    const result = await inspectImageMetadata(
      fileFrom(png(textChunk('Software', 'Stable Diffusion'), endChunk())),
    );

    expect(result.findings).toContain('ai-tool');
    expect(result.labelKey).toBe('result.imageMetadata.label.tool');
    expect(result.confidenceKey).toBe('result.imageMetadata.confidence.medium');
  });

  it('reads an explicit AI declaration from JPEG XMP', async () => {
    const xmp = encoder.encode(
      'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta digitalSourceType="trainedAlgorithmicMedia"/>',
    );
    const result = await inspectImageMetadata(fileFrom(jpeg(jpegSegment(0xe1, xmp))));

    expect(result.findings).toContain('ai-declaration');
    expect(result.labelKey).toBe('result.imageMetadata.label.declaration');
    expect(result.confidenceKey).toBe('result.imageMetadata.confidence.strong');
  });

  it('reads AI software from EXIF', async () => {
    const result = await inspectImageMetadata(fileFrom(jpeg(jpegSegment(0xe1, exifSoftware('Stable Diffusion')))));

    expect(result.findings).toContain('ai-tool');
    expect(result.fields).toBeUndefined();
  });

  it('reports a provenance marker without claiming its signature is valid', async () => {
    const result = await inspectImageMetadata(fileFrom(webpC2pa('digitalSourceType: trainedAlgorithmicMedia')));

    expect(result.credentials).toBe(true);
    expect(result.notes).toContain('c2paUnverified');
    expect(result.labelKey).toBe('result.imageMetadata.label.declaration');
    expect(result.fields).toBeUndefined();
  });

  it('records a checked source note without exposing raw values', async () => {
    const sourceFile = { ...fileFrom(webpC2pa('source')), type: 'image/webp' };
    const verifyCredentials = vi.fn(async () => ({ status: 'verified' }));
    const result = await inspectImageMetadata(sourceFile, { verifyCredentials });

    expect(verifyCredentials).toHaveBeenCalledWith(sourceFile);
    expect(result.findings).toContain('credentials-verified');
    expect(result.notes).not.toContain('c2paUnverified');
    expect(result.labelKey).toBe('result.imageMetadata.label.credentialsVerified');
    expect(result.fields).toBeUndefined();
  });

  it('reports a source note that did not pass its check', async () => {
    const sourceFile = { ...fileFrom(webpC2pa('source')), type: 'image/webp' };
    const result = await inspectImageMetadata(sourceFile, {
      verifyCredentials: async () => ({ status: 'invalid', checks: ['file-mismatch', 'unsupported-private-value'] }),
    });

    expect(result.findings).toContain('credentials-invalid');
    expect(result.labelKey).toBe('result.imageMetadata.label.credentialsInvalid');
    expect(result.credentialChecks).toEqual(['file-mismatch']);
  });

  it('reports a source note that could not be checked', async () => {
    const sourceFile = { ...fileFrom(webpC2pa('source')), type: 'image/webp' };
    const result = await inspectImageMetadata(sourceFile, {
      verifyCredentials: async () => ({ status: 'timeout' }),
    });

    expect(result.findings).not.toContain('credentials-verified');
    expect(result.notes).toContain('credentialsUnchecked');
    expect(result.notes).not.toContain('c2paUnverified');
  });

  it('stays unconfirmed when no AI metadata is present', async () => {
    const result = await inspectImageMetadata(
      fileFrom(png(textChunk('Software', 'Adobe Photoshop 2024'), endChunk())),
    );

    expect(result.status).toBe('unconfirmed');
    expect(result.findings).toEqual([]);
    expect(result.labelKey).toBe('result.imageMetadata.label.none');
    expect(result.notes).toContain('editorOnly');
  });
});
