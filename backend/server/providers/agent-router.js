// Generic OpenAI-compatible chat-completions provider for Agent Router.
// No provider-specific fields (such as OpenRouter's price routing) are sent.
const DEFAULT_BASE_URL = 'https://agentrouter.org/v1';
const KEY_ENV_NAMES = ['AGENT_ROUTER_API_KEY', 'AGENTROUTER_API_KEY'];
const hasKey = (value) =>
  typeof value === 'string' && value.trim().length > 15 && !/replace|your.*key/i.test(value.trim());

function firstValue(env, names) {
  for (const name of names) {
    const value = env?.[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function completionsEndpoint(value) {
  const raw = String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return '';
  if (url.pathname.endsWith('/chat/completions')) return raw;
  const base = url.pathname.endsWith('/v1') ? raw : raw + '/v1';
  return base + '/chat/completions';
}

export function agentRouterConfiguration(env = {}) {
  const apiKey = firstValue(env, KEY_ENV_NAMES);
  const model = firstValue(env, ['AGENT_ROUTER_MODEL', 'AGENTROUTER_MODEL']);
  const endpoint = completionsEndpoint(
    firstValue(env, ['AGENT_ROUTER_BASE_URL', 'AGENTROUTER_BASE_URL']) || DEFAULT_BASE_URL,
  );
  const configured = hasKey(apiKey) && !!model && !!endpoint;
  return {
    configured,
    providerId: 'agentrouter',
    provider: 'Agent Router',
    model,
    endpoint,
    freeOnly: false,
  };
}

function parseContent(content) {
  if (typeof content !== 'string') throw Error('Missing provider content.');
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(trimmed);
}

export async function generateAgentRouterStructured({
  config,
  env,
  instruction,
  input,
  schema,
  name = 'message_safety',
  image,
  maxTokens = 3072,
  timeoutMs = 25000,
  fetcher = fetch,
}) {
  const payload = {
    model: config.model,
    messages: [
      {
        role: 'system',
        content: `${instruction}\n\nReturn only a JSON object that matches this schema:\n${JSON.stringify(schema)}`,
      },
      {
        role: 'user',
        content: image
          ? [
              { type: 'text', text: input },
              { type: 'image_url', image_url: { url: image, detail: 'auto' } },
            ]
          : input,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
  };
  const response = await fetcher(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + firstValue(env, KEY_ENV_NAMES),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return { ok: false, http: response.status };
  const data = await response.json();
  const candidate = data.choices?.[0];
  if (data.error || candidate?.finish_reason !== 'stop' || candidate?.message?.refusal)
    return { ok: false, http: 502, incomplete: true };
  return {
    ok: true,
    value: parseContent(candidate.message?.content),
    model: typeof data.model === 'string' ? data.model : config.model,
    schemaName: name,
  };
}
