import { assessContent } from '../lib/content-assessment.js';
import { needsAiBackup } from '../lib/assessment-policy.js';
import { applySemanticAssessment } from '../lib/semantic-assessment.js';
import { combineAssessment } from '../lib/assessment.js';
import { isPrivateQrPayload } from '../lib/qr-payload.js';

/** Run local checks, then only the online services explicitly enabled by the caller.
 * Consent and service configuration belong to the calling application's UI.
 * Defaults make no network requests. baseUrl is a same-origin API prefix.
 */
export async function checkContent(
  input,
  { ai = false, provider, online = true, baseUrl = '/api', fetcher = globalThis.fetch } = {},
) {
  const local = assessContent(input);
  let semantic = { status: 'not_checked' }, verification = null;
  async function post(path, body, timeout) {
    try {
      const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
      });
      const data = await response.json();
      if (!['completed', 'unavailable', 'not_checked'].includes(data?.status)) throw Error();
      return data;
    } catch {
      return { status: 'unavailable', message: 'The online check could not complete. Local findings remain available.' };
    }
  }
  const tasks = [];
  if (!isPrivateQrPayload(input.text) && needsAiBackup(local, { enabled: ai === true, configured: !!provider, online })) {
    tasks.push(post('assess', {
      text: input.text, kind: input.kind || 'message', consent: true, provider,
    }, 28000).then(data => { semantic = data; }));
  }
  await Promise.all(tasks);
  return {
    assessment: combineAssessment(applySemanticAssessment(local, semantic), verification),
    local, semantic, verification,
  };
}
