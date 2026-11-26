import { fetchWithRetry } from './fetch-retry.js';

export async function generateStructured({
  config,
  env,
  instruction,
  input,
  schema,
  name = 'message_safety',
  image,
  maxTokens = 3072,
  timeoutMs = 25000,
  signal,
  retryTransient = false,
  fetcher = fetch,
}) {
  const payload = {
    model: config.model,
    messages: [
      { role: 'system', content: instruction },
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
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    max_tokens: maxTokens,
    provider: {
      require_parameters: true,
      sort: 'latency',
      max_price: { prompt: 0, completion: 0, request: 0, image: 0 },
    },
  };
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.OPENROUTER_API_KEY.trim(),
    },
    body: JSON.stringify(payload),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
  };
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  let response = await fetchWithRetry(endpoint, options, { fetcher, retryTransient });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // An intermittent upstream relay rejection can arrive as HTTP 400.
    // Retry that exact error once, not other invalid requests or quota errors.
    const relayFailure = response.status === 400 && error.error?.message === 'Request path cannot be relayed';
    if (retryTransient && relayFailure) {
      await new Promise(resolve => setTimeout(resolve, 250));
      options.signal.throwIfAborted();
      response = await fetcher(endpoint, options);
    }
  }
  if (!response.ok) return { ok: false, http: response.status, retryAfter: response.headers.get('retry-after') };
  const data = await response.json();
  const candidate = data.choices?.[0];
  if (data.error || candidate?.finish_reason !== 'stop' || candidate?.message?.refusal)
    return { ok: false, http: 502, incomplete: true };
  const content = candidate.message?.content;
  return {
    ok: true,
    value: JSON.parse(content),
    model: typeof data.model === 'string' ? data.model : config.model,
  };
}
