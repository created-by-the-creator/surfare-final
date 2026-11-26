import { semanticConfiguration } from './semantic.js';
import { geminiImageConfigurations, generateGeminiStructured } from '../providers/gemini.js';
import { generateStructured } from '../providers/structured.js';

// Keep routing state local to this server process, credential pair and transport.
// A changed key or isolated test transport must not inherit another key's limits.
const routing = new WeakMap();
const modelKey = config => `${config.providerId}:${config.model}`;
function routingState(fetcher, env) {
  if (!routing.has(fetcher)) routing.set(fetcher, new Map());
  const states = routing.get(fetcher);
  const key = JSON.stringify([env.OPENROUTER_API_KEY || '', env.GEMINI_API_KEY || '']);
  if (!states.has(key)) {
    if (states.size >= 64) states.delete(states.keys().next().value);
    states.set(key, { preferred: null, cooldowns: new Map() });
  }
  return states.get(key);
}
function cooling(state, config) {
  const key = modelKey(config);
  const until = state.cooldowns.get(key) || 0;
  if (until > Date.now()) return true;
  state.cooldowns.delete(key);
  return false;
}
function rateLimit(state, config, retryAfter) {
  const seconds = retryAfter && Number(retryAfter);
  const delay = retryAfter && Number.isFinite(seconds) ? seconds * 1000
    : retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
  state.cooldowns.set(modelKey(config), Date.now() + Math.max(1000, Math.min(86400000, Number.isFinite(delay) ? delay : 60000)));
}

// Initial provider order; runtime routing reuses a healthy provider and skips cooldowns.
export function aiProviders(env) {
  return [semanticConfiguration(env), ...geminiImageConfigurations(env)]
    .filter((item) => item.configured).slice(0, 3);
}

function generatorFor(config) {
  if (config.providerId === 'gemini') return generateGeminiStructured;
  return generateStructured;
}

export async function generateWithBackup({ env, validate, hedgeAfterMs, fetcher = fetch, ...options }) {
  const state = routingState(fetcher, env);
  let providers = aiProviders(env).filter(config => !cooling(state, config));
  const preferred = providers.find(config => modelKey(config) === state.preferred);
  if (preferred) providers = [preferred, ...providers.filter(config => config.providerId !== preferred.providerId),
    ...providers.filter(config => config.providerId === preferred.providerId && config !== preferred)];
  const remember = result => {
    if (result.status === 'completed') state.preferred = `${result.provider}:${result.model}`;
    return result;
  };
  // The budget covers the whole fallback chain, not each model separately.
  // Reserve time for backups before the browser abandons the request.
  const deadline = Date.now() + (options.timeoutMs ?? 25000);
  if (!Number.isFinite(hedgeAfterMs) || providers.length < 2) {
    return remember(await generateFromProviders({ providers, deadline, env, validate, state, fetcher, ...options }));
  }

  // A slow primary should not hold up a healthy backup. Try the other
  // provider while retaining validated, allowlisted model choices.
  // All attempts retain the same evidence validation and overall deadline.
  const controller = new AbortController();
  const shared = { ...options, env, validate, deadline, state, fetcher, signal: controller.signal, preservePending: true };
  const primary = generateFromProviders({ ...shared, providers: providers.slice(0, 1) });
  const backups = providers.slice(1).sort((a, b) =>
    Number(a.providerId === providers[0].providerId) - Number(b.providerId === providers[0].providerId)
    || Number(b.model === 'gemini-3.5-flash-lite') - Number(a.model === 'gemini-3.5-flash-lite'));
  let timer;
  const backup = (async () => {
    const early = await Promise.race([
      primary,
      new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, hedgeAfterMs)); }),
    ]);
    clearTimeout(timer);
    // A completed primary needs no second request. A failed primary can
    // start its backup immediately without waiting for the delay.
    if (early?.status === 'completed') return early;
    return generateFromProviders({ ...shared, providers: backups });
  })();
  try {
    return remember(await Promise.any([primary, backup].map(async pending => {
      const result = await pending;
      if (result.status !== 'completed') throw Error('AI provider unavailable');
      return result;
    })));
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function generateFromProviders({ providers, deadline, env, validate, state, signal, preservePending = false, ...options }) {
  for (const [index, config] of providers.entries()) {
    if (cooling(state, config)) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0 || signal?.aborted) break;
    // The primary needs more time than the lightweight backups. Keep a
    // reserved share for every backup without cutting the primary off early.
    const weight = index === 0 ? 2 : 1;
    // Concurrent detector requests already have a backup in flight. Let a
    // healthy request use the whole remaining budget instead of cutting it
    // short just to reserve time for another provider.
    const providerDeadline = preservePending ? deadline
      : Date.now() + Math.floor(remaining * weight / (providers.length - index - 1 + weight));
    for (let attempt = 0; attempt < 2; attempt++) {
      const timeoutMs = providerDeadline - Date.now();
      if (timeoutMs <= 0 || signal?.aborted) break;
      let validating = false;
      try {
        const generate = generatorFor(config);
        const response = await generate({ ...options, timeoutMs, signal, config, env,
          retryTransient: ['openrouter', 'gemini'].includes(config.providerId) });
        if (!response.ok) {
          if (response.http === 429) rateLimit(state, config, response.retryAfter);
          console.warn('AI provider unavailable', config.providerId, response.http || 'invalid_response', response.reason || 'provider_error');
          // A truncated/refused response can succeed on another model. Do not
          // retry quota or access errors against the same provider.
          break;
        }
        if (validate) {
          validating = true;
          validate(response.value);
        }
        return { status: 'completed', value: response.value, provider: config.providerId, model: response.model };
      } catch (error) {
        if (signal?.aborted) break;
        console.warn('AI request did not complete', config.providerId, error?.cause?.code || error?.name || 'invalid_response');
        // Retry malformed JSON or failed evidence validation once. Never
        // accept fabricated evidence just to report a completed review.
        if (!validating && error?.name !== 'SyntaxError') break;
      }
    }
  }
  return { status: 'unavailable' };
}
