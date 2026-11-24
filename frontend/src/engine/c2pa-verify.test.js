import { describe, expect, it, vi } from 'vitest';
import { verifyContentCredentials } from './c2pa-verify.js';

const file = { type: 'image/jpeg', arrayBuffer: async () => new ArrayBuffer(8) };

function fakeSdk(store, { noReader = false, fails = false } = {}) {
  const free = vi.fn(async () => {});
  const Context = vi.fn(function Context(settings) {
    this.settings = settings;
  });
  const Reader = {
    fromBlob: vi.fn(async () => {
      if (fails) throw new Error('bad content');
      if (noReader) return null;
      return { manifestStore: async () => store, free };
    }),
  };
  const createC2pa = vi.fn(async ({ wasmSrc }) => ({ wasmSrc }));
  const loadSdk = async () => ({ createC2pa, Reader, Context, wasmSrc: 'test.wasm' });
  return { loadSdk, createC2pa, Reader, Context, free };
}

describe('local Content Credentials verification', () => {
  it('explains a file mismatch without exposing manifest text or signer details', async () => {
    const sdk = fakeSdk({ validation_state: 'Invalid', secret: 'private manifest data', validation_results: {
      activeManifest: { success: [{ code: 'claimSignature.validated' }], failure: [{ code: 'assertion.dataHash.mismatch', explanation: 'private manifest data' }] },
    } });
    const result = await verifyContentCredentials(file, { loadSdk: sdk.loadSdk });
    expect(result).toEqual({ status: 'invalid', checks: ['signature-valid', 'file-mismatch'] });
    expect(JSON.stringify(result)).not.toContain('private manifest data');
  });

  it('distinguishes an untrusted signer from a signature or file mismatch', async () => {
    const sdk = fakeSdk({ validation_state: 'Invalid', validation_results: {
      activeManifest: { failure: [{ code: 'signingCredential.untrusted' }] },
    } });
    expect(await verifyContentCredentials(file, { loadSdk: sdk.loadSdk })).toEqual({ status: 'invalid', checks: ['signer-untrusted'] });
  });

  it('reports a trusted source note and frees the reader', async () => {
    const sdk = fakeSdk({ validation_state: 'Trusted' });
    const result = await verifyContentCredentials(file, { loadSdk: sdk.loadSdk });
    expect(result).toEqual({ status: 'verified' });
    expect(sdk.createC2pa).toHaveBeenCalledWith({ wasmSrc: 'test.wasm' });
    expect(sdk.Reader.fromBlob).toHaveBeenCalledWith(
      { wasmSrc: 'test.wasm' },
      'image/jpeg',
      file,
      expect.any(sdk.Context),
    );
    expect(sdk.free).toHaveBeenCalledOnce();
  });

  it('reports a checked note with an unrecognized source', async () => {
    const sdk = fakeSdk({ validation_state: 'Valid' });
    expect(await verifyContentCredentials(file, { loadSdk: sdk.loadSdk })).toEqual({
      status: 'valid',
    });
  });

  it('reports failures from the validation result', async () => {
    const sdk = fakeSdk({
      validation_state: 'Invalid',
      validation_results: { activeManifest: { failure: [{ code: 'assertion.invalid' }] } },
    });
    expect(await verifyContentCredentials(file, { loadSdk: sdk.loadSdk })).toEqual({
      status: 'invalid',
      checks: ['manifest-invalid'],
    });
  });

  it('stays unchecked when no manifest or a broken manifest is found', async () => {
    const none = fakeSdk(null, { noReader: true });
    expect(await verifyContentCredentials(file, { loadSdk: none.loadSdk })).toEqual({
      status: 'none',
    });
    const broken = fakeSdk(null, { fails: true });
    expect(await verifyContentCredentials(file, { loadSdk: broken.loadSdk })).toEqual({
      status: 'unchecked',
    });
  });

  it('does not load the verifier for unsupported files', async () => {
    const sdk = fakeSdk({ validation_state: 'Trusted' });
    const result = await verifyContentCredentials(
      { type: 'text/plain', arrayBuffer: async () => new ArrayBuffer(0) },
      { loadSdk: sdk.loadSdk },
    );
    expect(result).toEqual({ status: 'unsupported' });
    expect(sdk.createC2pa).not.toHaveBeenCalled();
  });
});
