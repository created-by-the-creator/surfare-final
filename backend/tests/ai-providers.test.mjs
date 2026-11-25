import test from 'node:test';
import assert from 'node:assert/strict';
import { aiProviders } from '../server/services/ai-generation.js';
import { imageCheck } from '../server/services/image.js';

test('AI services select OpenRouter first and configured Gemini backups only', () => {
  const env = { OPENROUTER_API_KEY: 'test-openrouter-key-not-real', GEMINI_API_KEY: 'test-gemini-key-not-real' };
  assert.deepEqual(aiProviders(env).map(item => item.providerId), ['openrouter', 'gemini', 'gemini']);
  assert.deepEqual(aiProviders({ OPENROUTER_API_KEY: env.OPENROUTER_API_KEY }).map(item => item.providerId), ['openrouter']);
  assert.deepEqual(aiProviders({}), []);
});

test('legacy visual review keeps its reviewed OpenRouter model and free-only routing', async () => {
  const response = await imageCheck(new Request('https://surfare.example/api/image-assess'), {
    OPENROUTER_API_KEY: 'test-openrouter-key-not-real',
  });
  const config = await response.json();
  assert.equal(config.providerId, 'openrouter');
  assert.equal(config.model, 'nvidia/nemotron-3.5-super-vl:free');
  assert.equal(config.freeOnly, true);
});
