const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const FREE_GEMINI_IMAGE_MODELS = ['gemini-4-hydrogen', 'gemini-3.5-flash-lite'];
const DEFAULT_GEMINI_IMAGE_MODEL = FREE_GEMINI_IMAGE_MODELS[0];
const IMAGE_DATA_PREFIX = 'data:image/jpeg;base64,';
const hasKey = (value) =>
  typeof value === 'string' && value.trim().length > 15 && !/replace|your.*key/i.test(value.trim());

function toGeminiSchema(schema) {
  const result = { type: String(schema.type || 'object').toUpperCase() };
  if (schema.description) result.description = schema.description;
  if (Array.isArray(schema.enum)) result.enum = schema.enum.map((value) => String(value));
  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
    );
  }
  if (Array.isArray(schema.required)) result.required = schema.required;
  if (schema.items) result.items = toGeminiSchema(schema.items);
  return result;
}

export function geminiImageConfigurations(env) {
  if (!hasKey(env.GEMINI_API_KEY)) return [];
  const requested = typeof env.GEMINI_IMAGE_MODEL === 'string' ? env.GEMINI_IMAGE_MODEL.trim() : '';
  if (requested && !FREE_GEMINI_IMAGE_MODELS.includes(requested)) return [];
  const models = requested
    ? [requested, ...FREE_GEMINI_IMAGE_MODELS.filter((model) => model !== requested)]
    : FREE_GEMINI_IMAGE_MODELS;
  return models.map((model) => ({
    configured: true,
    providerId: 'gemini',
    provider: 'Gemini (optional free-tier backup)',
    model,
    freeOnly: true,
  }));
}

export function geminiImageConfiguration(env) {
  return (
    geminiImageConfigurations(env)[0] || {
      configured: false,
      providerId: 'gemini',
      provider: 'Gemini (optional free-tier backup)',
      model: DEFAULT_GEMINI_IMAGE_MODEL,
      freeOnly: true,
    }
  );
}

export async function generateGeminiStructured({
  config,
  env,
  instruction,
  input,
  schema,
  image,
  maxTokens = 3072,
  timeoutMs = 25000,
  retryTransient = false,
  fetcher = fetch,
}) {
  const url = `${GEMINI_ENDPOINT}${encodeURIComponent(config.model)}:generateContent`;
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY.trim(),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [
        {
          role: 'user',
          parts: [
            ...(image ? [{
              inlineData: {
                mimeType: 'image/jpeg',
                data: image.slice(IMAGE_DATA_PREFIX.length),
              },
            }] : []),
            { text: input },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(schema),
        maxOutputTokens: maxTokens,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  };
  let response = await fetcher(url, options);
  // Retry temporary server errors once, sharing the original total time budget.
  if (retryTransient && [408, 502, 503, 504].includes(response.status)) {
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 250));
    options.signal.throwIfAborted();
    response = await fetcher(url, options);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body?.error?.message === 'string' ? body.error.message : '';
    return {
      ok: false,
      http: response.status,
      upstreamStatus: typeof body?.error?.status === 'string' ? body.error.status : '',
      keyIssue: /api[\s_-]*key/i.test(message),
    };
  }
  const data = await response.json();
  if (data.error) return { ok: false, http: 502, incomplete: true };
  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason || candidate?.finish_reason;
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS')
    return { ok: false, http: 502, incomplete: true };
  const text = (candidate?.content?.parts || [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  if (!text) return { ok: false, http: 502, incomplete: true };
  return { ok: true, value: JSON.parse(text), model: config.model };
}
