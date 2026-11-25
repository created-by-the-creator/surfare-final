import { assessContent } from '../../lib/content-assessment.js';
import { applySemanticAssessment, validateSemanticResult } from '../../lib/semantic-assessment.js';
import { combineAssessment } from '../../lib/assessment.js';
import { semanticInstruction, semanticSchema } from './semantic.js';
import { generateWithBackup } from './ai-generation.js';
import { isPrivateQrPayload } from '../../lib/qr-payload.js';
import { describeQrPayload } from '../../lib/qr-links.js';

export async function detect(request, env = {}, fetcher = fetch) {
  const json = (body, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const apiUrl = new URL(request.url);
      const localOrigin =
        originUrl.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(originUrl.hostname) &&
        ['localhost', '127.0.0.1'].includes(apiUrl.hostname);
      if (!localOrigin && origin !== apiUrl.origin) {
        return json({ error: 'Origin rejected.' }, 403);
      }
    } catch {
      return json({ error: 'Origin rejected.' }, 403);
    }
  }
  try {
    const raw = await request.text();
    if (raw.length > 30000) return json({ error: 'Input is too large.' }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 12000 ||
      (input.kind !== undefined && !['message', 'link', 'image', 'qr'].includes(input.kind)) ||
      (input.uncertain !== undefined && typeof input.uncertain !== 'boolean') ||
      (input.online !== undefined && typeof input.online !== 'boolean') ||
      (input.ai !== undefined && typeof input.ai !== 'boolean') ||
      (input.ai === true && input.consent !== true) ||
      (input.urls !== undefined && (!Array.isArray(input.urls) || input.urls.length > 10 ||
        input.urls.some(url => typeof url !== 'string' || url.length > 2048))))
      return json({ error: 'Provide text up to 12,000 characters and a supported input type.' }, 400);

    // Ignore legacy online flags and client-supplied verification results.
    // Double-checks use only OpenRouter/Gemini; URLs are never looked up.
    const privateQr = isPrivateQrPayload(input.text) || input.urls?.some(isPrivateQrPayload) ||
      ['qr', 'image'].includes(input.kind) && [input.text, ...(input.urls || [])].some(value => describeQrPayload(value).blocked);
    const aiPromise = input.ai === true && !privateQr ? generateWithBackup({
      env, instruction: semanticInstruction, schema: semanticSchema, fetcher,
      input: JSON.stringify({ inputType: input.kind || 'message', submittedText: input.text }),
      timeoutMs: 40000,
      validate: (value) => validateSemanticResult(value, input.text),
    }) : Promise.resolve({ status: 'not_checked' });
    const ai = await aiPromise;
    const local = assessContent({
        text: input.text,
        kind: input.kind,
        urls: input.urls,
        uncertain: input.uncertain,
      });
    const contextual = applySemanticAssessment(local, { status: ai.status, analysis: ai.value });
    return json({
      ...combineAssessment(contextual),
      aiReview: { status: contextual.semanticStatus, ...(ai.provider ? { provider: ai.provider, model: ai.model } : {}) },
    });
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
}
