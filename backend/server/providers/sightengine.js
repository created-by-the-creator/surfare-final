import { classifyAiGeneratedScore } from '../../lib/sightengine-assessment.js';

export const SIGHTENGINE_ENDPOINT = 'https://api.sightengine.com/1.0/check.json';
const credential = (value) => typeof value === 'string' && value.trim().length > 0 && !/^(?:your[_ -]|replace|example)/i.test(value.trim());

export function sightengineConfiguration(env = {}) {
  return {
    configured: credential(env.SIGHTENGINE_API_USER) && credential(env.SIGHTENGINE_API_SECRET),
    provider: 'Sightengine', providerId: 'sightengine', model: 'genai',
  };
}

export async function detectAiImage(image, env, fetcher = fetch) {
  if (!sightengineConfiguration(env).configured) return { status: 'unavailable', reason: 'not_configured' };
  try {
    const bytes = Uint8Array.from(atob(image.slice('data:image/jpeg;base64,'.length)), (character) => character.charCodeAt(0));
    const form = new FormData();
    form.set('media', new Blob([bytes], { type: 'image/jpeg' }), 'image.jpg');
    form.set('models', 'genai');
    form.set('api_user', env.SIGHTENGINE_API_USER.trim());
    form.set('api_secret', env.SIGHTENGINE_API_SECRET.trim());
    const response = await fetcher(SIGHTENGINE_ENDPOINT, {
      method: 'POST', body: form, signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.status !== 'success') {
      const type = data?.error?.type;
      const reason = type === 'credentials_error' || [401, 403].includes(response.status) ? 'credentials'
        : type === 'usage_limit' || [402, 429].includes(response.status) ? 'quota'
          : type === 'media_error' || type === 'argument_error' ? 'unsupported_image' : 'provider_error';
      return { status: 'unavailable', reason };
    }
    const aiGeneratedScore = data?.type?.ai_generated;
    const band = classifyAiGeneratedScore(aiGeneratedScore);
    // Never forward filenames, media URLs, account details or provider error text.
    return { status: 'completed', detection: { aiGeneratedScore, band } };
  } catch (error) {
    return { status: 'unavailable', reason: ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'provider_error' };
  }
}
