import { semanticConfiguration } from './semantic.js';
import { geminiImageConfigurations, generateGeminiStructured } from '../providers/gemini.js';
import { generateStructured } from '../providers/structured.js';
import { agentRouterConfiguration, generateAgentRouterStructured } from '../providers/agent-router.js';

export function aiProviders(env) {
  return [agentRouterConfiguration(env), semanticConfiguration(env), ...geminiImageConfigurations(env)]
    .filter((item) => item.configured).slice(0, 3);
}

function generatorFor(config) {
  if (config.providerId === 'gemini') return generateGeminiStructured;
  if (config.providerId === 'agentrouter') return generateAgentRouterStructured;
  return generateStructured;
}

export async function generateWithBackup({ env, validate, ...options }) {
  for (const config of aiProviders(env)) {
    try {
      const generate = generatorFor(config);
      const response = await generate({ ...options, config, env, retryTransient: config.providerId === 'gemini' });
      if (!response.ok) {
        console.warn('AI provider unavailable', config.providerId, response.http || 'invalid_response');
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
