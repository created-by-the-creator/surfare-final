import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentRouterConfiguration,
  generateAgentRouterStructured,
} from '../server/providers/agent-router.js';
import { aiProviders, generateWithBackup } from '../server/services/ai-generation.js';
import { imageCheck } from '../server/services/image.js';
import { surfyChat } from '../server/services/surfy.js';

const env = {
  AGENT_ROUTER_API_KEY: 'test-agent-router-key-not-real',
  AGENT_ROUTER_MODEL: 'gpt-5.5',
  OPENROUTER_API_KEY: 'test-openrouter-key-not-real',
};

test('Agent Router needs both a key and an explicit model ID', () => {
  assert.equal(agentRouterConfiguration({}).configured, false);
  assert.equal(agentRouterConfiguration({ AGENT_ROUTER_MODEL: 'gpt-5.5' }).configured, false);
  assert.equal(agentRouterConfiguration({ AGENT_ROUTER_API_KEY: env.AGENT_ROUTER_API_KEY }).configured, false);
  const config = agentRouterConfiguration(env);
  assert.equal(config.configured, true);
  assert.equal(config.providerId, 'agentrouter');
  assert.equal(config.endpoint, 'https://agentrouter.org/v1/chat/completions');
});

test('AgentRouter-documented environment variable names are accepted', () => {
  const config = agentRouterConfiguration({
    AGENTROUTER_API_KEY: env.AGENT_ROUTER_API_KEY,
    AGENTROUTER_MODEL: 'gpt-5.5',
    AGENTROUTER_BASE_URL: 'https://agentrouter.org/v1/',
  });
  assert.equal(config.configured, true);
  assert.equal(config.endpoint, 'https://agentrouter.org/v1/chat/completions');
});

test('Agent Router base URL is normalized to a chat-completions endpoint', () => {
  assert.equal(
    agentRouterConfiguration({ ...env, AGENT_ROUTER_BASE_URL: 'https://gateway.example/api/' }).endpoint,
    'https://gateway.example/api/v1/chat/completions',
  );
  assert.equal(
    agentRouterConfiguration({ ...env, AGENT_ROUTER_BASE_URL: 'https://gateway.example/v1' }).endpoint,
    'https://gateway.example/v1/chat/completions',
  );
  assert.equal(
    agentRouterConfiguration({ ...env, AGENT_ROUTER_BASE_URL: 'https://gateway.example/v1/chat/completions' }).endpoint,
    'https://gateway.example/v1/chat/completions',
  );
  assert.equal(agentRouterConfiguration({ ...env, AGENT_ROUTER_BASE_URL: 'ftp://gateway.example' }).configured, false);
});

test('Agent Router payload stays OpenAI-compatible without OpenRouter routing fields', async () => {
  let request;
  const fetcher = async (url, options) => {
    request = { url, options };
    return Response.json({
      model: 'gpt-5.5',
      choices: [{ finish_reason: 'stop', message: { content: '```json\n{"level":"Low risk"}\n```' } }],
    });
  };
  const generated = await generateAgentRouterStructured({
    config: agentRouterConfiguration(env),
    env,
    instruction: 'Assess the message.',
    input: 'Hello there',
    schema: { type: 'object', properties: { level: { type: 'string' } }, required: ['level'] },
    fetcher,
  });
  assert.equal(generated.ok, true);
  assert.deepEqual(generated.value, { level: 'Low risk' });
  assert.equal(request.url, 'https://agentrouter.org/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer ' + env.AGENT_ROUTER_API_KEY);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model, 'gpt-5.5');
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.equal(payload.provider, undefined);
  assert.equal(payload.reasoning, undefined);
  assert.match(payload.messages[0].content, /schema/);
});

test('Agent Router is the primary AI provider with OpenRouter and Gemini as backups', () => {
  const configs = aiProviders({ ...env, GEMINI_API_KEY: 'test-gemini-key-not-real' });
  assert.deepEqual(configs.map((item) => item.providerId), ['agentrouter', 'openrouter', 'gemini']);
  assert.deepEqual(aiProviders(env).map((item) => item.providerId), ['agentrouter', 'openrouter']);
});

test('Surfy uses Agent Router as its first AI provider', async () => {
  const urls = [];
  let payload;
  const response = await surfyChat(
    new Request('https://surfare.test/api/surfy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consent: true,
        language: 'en',
        question: 'How can I protect my GCash account?',
        history: [],
        result: null,
      }),
    }),
    env,
    async (url, options) => {
      urls.push(url);
      payload = JSON.parse(options.body);
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: 'Use the official app.' }) } }],
      });
    },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.provider, 'agentrouter');
  assert.match(body.answer, /official app/);
  assert.deepEqual(urls, ['https://agentrouter.org/v1/chat/completions']);
  assert.equal(payload.model, 'gpt-5.5');
  assert.equal(payload.provider, undefined);
});

test('a configured Agent Router vision model becomes the primary image provider', async () => {
  const response = await imageCheck(
    new Request('https://surfare.example/api/image-assess'),
    { ...env, AGENT_ROUTER_IMAGE_MODEL: 'vision-model' },
  );
  const config = await response.json();
  assert.equal(config.providerId, 'agentrouter');
  assert.equal(config.model, 'vision-model');
  assert.equal(config.freeOnly, false);
  assert.equal(config.backupConfigured, true);
});

test('a failed Agent Router call falls back to the next configured provider', async () => {
  const urls = [];
  const generated = await generateWithBackup({
    env,
    instruction: 'Return JSON.',
    schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
    input: 'Hello',
    validate: (value) => { if (!value?.answer) throw Error('Invalid'); },
    fetcher: async (url, options) => {
      urls.push(url);
      if (url.includes('agentrouter.org')) return new Response('', { status: 429 });
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: 'Backed up.' }) } }],
      });
    },
  });
  assert.equal(generated.status, 'completed');
  assert.equal(generated.provider, 'openrouter');
  assert.equal(generated.value.answer, 'Backed up.');
  assert.deepEqual(urls, [
    'https://agentrouter.org/v1/chat/completions',
    'https://openrouter.ai/api/v1/chat/completions',
  ]);
});
