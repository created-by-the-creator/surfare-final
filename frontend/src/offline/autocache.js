const STORAGE_KEY = 'surfare:offline-pack-autocache';
const RETRY_AFTER_MS = 60 * 60 * 1000;

export function readAutoCacheState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : {};
    return {
      attemptedAt: Number(value.attemptedAt) || 0,
      completed: Boolean(value.completed),
      skipped: Boolean(value.skipped),
    };
  } catch {
    return { attemptedAt: 0, completed: false, skipped: false };
  }
}

function writeAutoCacheState(state, storage = globalThis.localStorage) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Private browsing can block storage. */ }
}

export function shouldAutoCache(now = Date.now(), state = readAutoCacheState()) {
  if (state.completed || state.skipped) return false;
  return !state.attemptedAt || now - state.attemptedAt >= RETRY_AFTER_MS;
}

export function markAutoCacheAttempt(now = Date.now(), storage) {
  writeAutoCacheState({ ...readAutoCacheState(storage), attemptedAt: now }, storage);
}

export function markAutoCacheDone(storage) {
  writeAutoCacheState({ ...readAutoCacheState(storage), attemptedAt: Date.now(), completed: true, skipped: false }, storage);
}

export function markAutoCacheSkipped(storage) {
  writeAutoCacheState({ ...readAutoCacheState(storage), completed: false, skipped: true }, storage);
}

// Let the service worker finish caching the app shell before downloading the OCR pack.
export async function waitForAppShell({ timeoutMs = 5000 } = {}) {
  if (!globalThis.navigator || !('serviceWorker' in navigator)) return;
  let timer;
  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } catch { /* A missing worker must not block the offline pack. */ }
  finally { clearTimeout(timer); }
}
