import { apiFetch } from '../api/fetch.js';
import { buildRecoveryPlan } from './plan.js';

export function localGuideAnswer({ question, situations, provider, country, t }) {
  const lower = question.toLowerCase();
  if (!situations.includes('danger') && /contact|support|hotline|where|official|saan|suporta|tulong/.test(lower)) return t('recovery.chat.localContact');
  let step = /\b(password|otp|pin|code|account|login|kode|pinasok)\b/.test(lower) ? 'account'
    : /\b(money|paid|payment|refund|sent|pera|bayad|transfer)\b/.test(lower) ? 'payment'
      : /\b(download|install|device|app|malware)\b/.test(lower) ? 'device'
        : /\b(threat|blackmail|banta)\b/.test(lower) ? 'threat' : null;
  if (situations.includes('danger')) step = 'safety';
  if (!step) step = buildRecoveryPlan({ situations, provider, country }).steps[0];
  return step ? `${t(`recovery.step.${step}.title`).replace(/[.!?]$/, '')}.\n\n${t(`recovery.step.${step}.body`)}` : t('recovery.chat.clarify');
}

export async function askGuide(context, signal, fetcher = apiFetch) {
  const response = await fetcher('/api/recovery-guide', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, question: context.question,
      language: context.language, providerName: context.providerName, country: context.country, situations: context.situations,
      history: context.history.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 1000) })) }) });
  const data = await response.json();
  if (!response.ok || data.status !== 'completed' || !data.answer) throw Error('unavailable');
  return data;
}
