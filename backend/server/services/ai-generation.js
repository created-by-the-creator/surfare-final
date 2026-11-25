import { semanticConfiguration } from './semantic.js';
import { geminiImageConfigurations, generateGeminiStructured } from '../providers/gemini.js';
import { generateStructured } from '../providers/structured.js';

// Chat, detector double-checks and Lifeguard share the same fixed provider order.
export function aiProviders(env) {
  return [semanticConfiguration(env), ...geminiImageConfigurations(env)]
    .filter((item) => item.configured).slice(0, 3);
}

function generatorFor(config) {
  if (config.providerId === 'gemini') return generateGeminiStructured;
  return generateStructured;
}

export async function generateWithBackup({ env, validate, ...options }) {
  const providers = aiProviders(env);
  // The budget covers the whole fallback chain, not each model separately.
  // Reserve time for backups before the browser abandons the request.
  const deadline = Date.now() + (options.timeoutMs ?? 25000);
  for (const [index, config] of providers.entries()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const timeoutMs = Math.max(1, Math.floor(remaining / (providers.length - index)));
    try {
      const generate = generatorFor(config);
      const response = await generate({ ...options, timeoutMs, config, env,
        retryTransient: ['openrouter', 'gemini'].includes(config.providerId) });
      if (!response.ok) {
        console.warn('AI provider unavailable', config.providerId, response.http || 'invalid_response', response.reason || 'provider_error');
        continue;
      }
      if (validate) validate(response.value);
      return { status: 'completed', value: response.value, provider: config.providerId, model: response.model };
    } catch (error) {
      console.warn('AI request did not complete', config.providerId, error?.cause?.code || error?.name || 'invalid_response');
    }
  }
  return { status: 'unavailable' };
}
