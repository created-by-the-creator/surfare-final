import { getDisplaySignals, getSignalEvidenceItems, getSignalLabel } from '../engine/signal-display.js';
import { getSurfyResultMessage } from './templates.js';
import { imageOriginSummary } from '../engine/image-ai.js';
import { imageMetadataDetails } from '../engine/image-metadata-display.js';
import { apiFetch } from '../api/fetch.js';

export function buildSurfyContext(result, t) {
  if (!result || result.errorKey || result.privateQr) return null;
  return {
    level: result.level,
    checkedText: String(result.checkedText || '').slice(0, 12000),
    findings: getDisplaySignals(result).slice(0, 8).map((signal) => ({
      reason: getSignalLabel(signal, t).slice(0, 600),
      evidence: getSignalEvidenceItems(signal)[0].text.slice(0, 700),
    })),
    explanation: [getSurfyResultMessage(result, t),
      result.imageOrigin?.source === 'sightengine' && imageOriginSummary(result.imageOrigin, t),
      result.imageOrigin?.source === 'sightengine' && t(result.imageOrigin.limitationKey),
      result.imageMetadata?.summaryKey && t(result.imageMetadata.summaryKey),
      ...imageMetadataDetails(result.imageMetadata, t),
    ].filter(Boolean).join('\n\n').slice(0, 4000),
  };
}

export async function requestSurfyReply({ question, result, language, history, t, signal }) {
  if (result?.privateQr) throw Error('local_only');
  const response = await apiFetch('/api/surfy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true, question, language, result: buildSurfyContext(result, t),
      history: history.slice(history.findLastIndex(item => item.role === 'divider') + 1)
        .filter((item) => ['user', 'surfy'].includes(item.role)).slice(-8)
        .map((item) => ({ role: item.role === 'surfy' ? 'assistant' : 'user', content: item.text.slice(0, 1000) })),
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(28000)]),
  });
  if (!response.ok) throw Error('surfy_unavailable');
  const data = await response.json();
  if (data.status !== 'completed' || typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 3000) throw Error('surfy_unavailable');
  return data.answer.trim();
}
