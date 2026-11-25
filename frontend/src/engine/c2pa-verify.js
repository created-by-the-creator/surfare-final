import { credentialChecks } from './credential-checks.js';

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const clients = new WeakMap();

async function loadRuntime() {
  const sdk = await import('@contentauth/c2pa-web');
  const { default: wasmSrc } = await import('@contentauth/c2pa-web/resources/c2pa.wasm?url');
  return {
    createC2pa: sdk.createC2pa,
    Reader: sdk.Reader,
    Context: sdk.Context,
    wasmSrc,
  };
}

function getClient(loadSdk) {
  if (!clients.has(loadSdk)) {
    const pending = loadSdk()
      .then(async (runtime) => {
        const c2pa = await runtime.createC2pa({ wasmSrc: runtime.wasmSrc });
        return { c2pa, Reader: runtime.Reader, Context: runtime.Context };
      })
      .catch((error) => {
        clients.delete(loadSdk);
        throw error;
      });
    clients.set(loadSdk, pending);
  }
  return clients.get(loadSdk);
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Source-note check timed out.');
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function validationStatus(store) {
  const active = store?.validation_results?.activeManifest;
  const failures = Array.isArray(active?.failure) ? active.failure : [];
  if (store?.validation_state === 'Invalid' || failures.length > 0) return 'invalid';
  if (store?.validation_state === 'Trusted') return 'verified';
  if (store?.validation_state === 'Valid') return 'valid';
  return 'unchecked';
}

// Local Content Credentials validation. Only fixed status codes leave here;
// no manifest fields, issuer text or raw values are returned to the app.
export async function verifyContentCredentials(file, options = {}) {
  const { loadSdk = loadRuntime, timeoutMs = 25000 } = options;
  const type = typeof file?.type === 'string' ? file.type : '';
  if (!SUPPORTED_TYPES.has(type) || typeof file?.arrayBuffer !== 'function')
    return { status: 'unsupported' };

  let reader;
  try {
    return await withTimeout(
      (async () => {
        const client = await getClient(loadSdk);
        const context = new client.Context({ verify: { verifyTrust: true } });
        const created = await client.Reader.fromBlob(client.c2pa, type, file, context);
        if (!created) return { status: 'none' };
        reader = created;
        const store = await reader.manifestStore();
        const checks = credentialChecks(store);
        return { status: validationStatus(store), ...(checks.length ? { checks } : {}) };
      })(),
      timeoutMs,
    );
  } catch (error) {
    return { status: error?.name === 'TimeoutError' ? 'timeout' : 'unchecked' };
  } finally {
    if (reader) {
      try {
        await reader.free();
      } catch {
        // A failed cleanup must not replace the verification result.
      }
    }
  }
}
