import {
  formatEvidenceList,
  getDisplaySignals,
  getSignalEvidenceItems,
  getSignalLabel,
  getSignalExplanation,
} from '../engine/signal-display.js';
import { imageMetadataDetails } from '../engine/image-metadata-display.js';
import { hasImageAiClues, imageOriginSummary } from '../engine/image-ai.js';
import { localOutcome } from '../engine/result-presentation.js';

export const SURFY_QUESTION_KEYS = [
  'ask.why',
  'ask.whyClean',
  'ask.next',
  'ask.offline',
  'ask.photo',
  'ask.uncertain',
  'ask.link',
  'ask.aiImage',
  'ask.imageMeaning',
  'ask.imageScore',
  'ask.imageFile',
  'ask.imageLimits',
];

const QUESTION_MATCHERS = [
  { key: 'ask.imageScore', words: ['score', 'percentage', 'puntos'] },
  { key: 'ask.whyClean', words: ['wasn', 'weren', 'clean', 'unflagged', 'not flagged', 'not mark'] },
  { key: 'ask.why', words: ['why', 'flag', 'flagged', 'warning', 'reason', 'bakit', 'dahilan', 'mark', 'suspicious', 'explain', 'explanation', 'result', 'results', 'tag', 'tags', 'highlight', 'highlighted', 'ipaliwanag', 'paliwanag', 'scam', 'legit'] },
  { key: 'ask.next', words: ['what', 'do', 'now', 'should', 'next', 'action', 'gagawin', 'fix'] },
  { key: 'ask.link', words: ['link', 'safe', 'open', 'click', 'bukas', 'ligtas'] },
  { key: 'ask.offline', words: ['offline', 'internet', 'online', 'connection', 'walang net'] },
  { key: 'ask.photo', words: ['photo', 'picture', 'image', 'keep', 'save', 'sine-save', 'larawan'] },
  { key: 'ask.uncertain', words: ['sure', 'certain', 'unsure', 'uncertain', 'doubt', 'sigurado'] },
  {
    key: 'ask.aiImage',
    words: [
      'ai',
      'generated',
      'manipulated',
      'origin',
      'edited',
      'visual',
      'metadata',
      'file details',
      'exif',
      'provenance',
      'c2pa',
    ],
  },
];

function normalizeQuestion(question) {
  return question.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function findQuestionKey(question, t) {
  const normalized = normalizeQuestion(question);
  const exact = SURFY_QUESTION_KEYS.find((key) => normalizeQuestion(t(key)) === normalized);
  if (exact) return exact;
  const searchable = ` ${normalized} `;
  const best = QUESTION_MATCHERS
    .map(({ key, words }) => ({
      key,
      score: words.reduce((score, word) => score + (searchable.includes(` ${normalizeQuestion(word)} `) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score)[0];
  return best?.score ? best.key : null;
}

function isFlaggedResult(result) {
  return result?.level === 'suspicious' || result?.level === 'high';
}

function hasCheckedUrl(result) {
  return /(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/i.test(String(result?.checkedText || ''));
}

const SIGNAL_TOPICS = [
  { ids: ['otp_request'], words: ['otp', 'one time password', 'secret code', 'verification code', 'secret codes'] },
  { ids: ['credential_request', 'personal'], words: ['password', 'login', 'account details', 'personal details', 'pin'] },
  { ids: ['urgency', 'pressure', 'reward-pressure'], words: ['urgency', 'urgent', 'act fast', 'act now', 'rush', 'madali', 'minamadali'] },
  { ids: ['money_demand', 'advance-fee', 'job-fee', 'investment', 'loan-fee', 'winnings-deposit', 'load-transfer'], words: ['money', 'payment', 'cash in', 'cash-in', 'pay', 'bayad', 'pera', 'investment', 'deposit'] },
  { ids: ['prize_lottery', 'job_scam', 'guaranteed-winnings', 'winnings-deposit', 'task-recruitment'], words: ['prize', 'winnings', 'giveaway', 'reward', 'premyo', 'panalo', 'job', 'task', 'ipapanalo'] },
  { ids: ['impersonation', 'brand-imitation-link', 'lookalike-link', 'lookalike_brand', 'brand_in_subdomain_not_domain'], words: ['impersonation', 'pretending', 'lookalike', 'nagpapanggap'] },
  { ids: ['threat_loss', 'blackmail', 'extortion', 'intimidation'], words: ['threat', 'blocked', 'suspended', 'blackmail', 'banta'] },
  { ids: ['secrecy', 'secret'], words: ['secrecy', 'keep secret', 'lihim'] },
];

const normalize = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const contains = (text, phrase) => (` ${normalize(text)} `).includes(` ${normalize(phrase)} `);

function requestedSignals(question, result, t) {
  const signals = getDisplaySignals(result);
  const quotes = [...question.matchAll(/[“"]([^”"]+)[”"]/g)].map((match) => normalize(match[1]));
  const exact = signals.filter((signal) => contains(question, getSignalLabel(signal, t))
    || getSignalEvidenceItems(signal).some(({ text }) => quotes.some((quote) => quote.length > 1 && normalize(text).includes(quote))));
  if (exact.length) return exact;
  const topics = SIGNAL_TOPICS.filter(({ words }) => words.some((word) => contains(question, word)));
  if (!topics.length) return null;
  return signals.filter((signal) => topics.some(({ ids }) => ids.includes(signal.id)));
}

function explainSignals(signals, t) {
  return signals.map((signal) => `- ${[
    getSignalLabel(signal, t), formatEvidenceList(getSignalEvidenceItems(signal), t, 1),
    getSignalExplanation(signal, t),
  ].filter(Boolean).join(' ')}`).join('\n');
}

export function getSuggestedSignalQuestions(result, t) {
  if (result?.imageMetadata || result?.imageOrigin) return [];
  const seen = [];
  return getDisplaySignals(result).flatMap((signal, index) => {
    const quote = getSignalEvidenceItems(signal)[0].text.slice(0, 60);
    const key = normalize(quote);
    if (!key || seen.some(previous => contains(previous, key) || contains(key, previous))) return [];
    seen.push(key);
    return [{ key: `signal-${signal.id}-${index}`, text: t('ask.explainQuote', { text: quote }) }];
  }).slice(0, 3);
}

export function getSurfyResultMessage(result, t) {
  const answer = getSurfyAnswer(t('ask.why'), result, t);
  return [answer,
    ...(result?.matchedUrls || []).map(url => t('ask.addressMatch', { url })),
    result?.mediaInfo?.uncertainExtraction && t('result.ocrUncertain'),
    result?.unsupportedQr && t('result.qrUnsupported'),
    result?.semanticConflict && t('result.conflictingReviews'),
    result?.onlineUnavailable && t('result.reputationIncomplete'),
    ['pending', 'completed', 'unavailable'].includes(result?.aiReview?.status) && t(`ask.review.${result.aiReview.status}`),
  ].filter(Boolean).join('\n\n');
}

function imageReviewAnswer(result, t) {
  const metadata = result?.imageMetadata;
  const origin = result?.imageOrigin;
  if (origin?.source === 'sightengine') {
    return [t(origin.labelKey), t(origin.summaryKey),
      hasImageAiClues({ imageMetadata: metadata }) && t('result.imageSimple.fileAi'),
    ].filter(Boolean).join('\n\n');
  }
  if (metadata && origin) {
    const overview = t('ask.imageReview.answer', {
      metadata: t(metadata.labelKey),
      visual: t(origin.labelKey),
    });
    return [result.summaryKey && t(result.summaryKey), overview, metadata.summaryKey ? t(metadata.summaryKey) : '', imageMetadataDetails(metadata, t).map(note => `- ${note}`).join('\n'), imageOriginSummary(origin, t), origin.source === 'sightengine' && t(origin.limitationKey), (origin.observations || []).slice(0, 4).map(note => `- ${note}`).join('\n'), origin.nonClues?.length ? `${t('result.imageOrigin.nonClueTitle')}\n${origin.nonClues.map(note => `- ${note}`).join('\n')}` : '', result.imageVisualNoteKey ? t(result.imageVisualNoteKey) : ''].filter(Boolean).join('\n\n');
  }
  if (metadata) return [t('ask.imageMetadata.answer', { label: t(metadata.labelKey) }), metadata.summaryKey ? t(metadata.summaryKey) : '', imageMetadataDetails(metadata, t).map(note => `- ${note}`).join('\n'), result.imageVisualNoteKey ? t(result.imageVisualNoteKey) : ''].filter(Boolean).join('\n\n');
  if (origin) return [t('ask.aiImage.answer', { label: t(origin.labelKey) }), imageOriginSummary(origin, t), origin.source === 'sightengine' && t(origin.limitationKey), (origin.observations || []).slice(0, 2).map(note => `- ${note}`).join('\n')].filter(Boolean).join('\n\n');
  return t('ask.aiImage.noResult');
}

export function getSuggestedQuestionKeys({ result, activeTab } = {}) {
  if (result?.imageMetadata || result?.imageOrigin) {
    return ['ask.imageMeaning', 'ask.imageLimits', 'ask.next', 'ask.imageScore', 'ask.imageFile'];
  }
  const whyKey = result?.level === 'unknown' && !localOutcome(result) ? 'ask.uncertain' : !result || isFlaggedResult(result) ? 'ask.why' : 'ask.whyClean';
  const keys = [whyKey, 'ask.next'];

  if (hasCheckedUrl(result)) keys.push('ask.link');
  if (result?.imageMetadata || result?.imageOrigin) keys.push('ask.aiImage');
  keys.push('ask.offline', 'ask.uncertain');
  if (activeTab === 'image' || activeTab === 'qr') keys.push('ask.photo');

  return [...new Set(keys)];
}

export function getSurfyAnswer(question, result, t) {
  const key = findQuestionKey(question, t);
  if (key === 'ask.imageMeaning') return imageReviewAnswer(result, t);
  if (key === 'ask.imageLimits') return t('ask.imageLimits.answer');
  if (key === 'ask.imageFile') {
    if (!result?.imageMetadata) return t('ask.aiImage.noResult');
    return [t(result.imageMetadata.summaryKey || result.imageMetadata.labelKey),
      imageMetadataDetails(result.imageMetadata, t).map(note => `- ${note}`).join('\n'),
    ].filter(Boolean).join('\n\n');
  }
  if (key === 'ask.imageScore') {
    return result?.imageOrigin?.source === 'sightengine'
      ? `${t('result.sightengine.score', { score: result.imageOrigin.score.toFixed(3) })} ${t('ask.imageScore.answer')}`
      : t('ask.imageScore.unavailable');
  }
  const specific = requestedSignals(question, result, t);
  // Service/privacy questions should not be mistaken for a warning topic.
  if (!['ask.offline', 'ask.photo', 'ask.link', 'ask.aiImage', 'ask.uncertain'].includes(key) && specific !== null) {
    if (!result) return t('ask.noResult');
    if (result.imageMetadata || result.imageOrigin) return imageReviewAnswer(result, t);
    return specific.length ? explainSignals(specific, t) : t('ask.signalNotFound');
  }
  if (!key) return t('ask.fallback');
  if (!result && (key === 'ask.why' || key === 'ask.whyClean' || key === 'ask.next')) return t('ask.noResult');

  if (key === 'ask.why' || key === 'ask.whyClean') {
    if (result?.imageMetadata || result?.imageOrigin) return imageReviewAnswer(result, t);
    const signals = getDisplaySignals(result);
    const hasOnlineMatch = (Array.isArray(result?.signals) ? result.signals : [])
      .some((signal) => signal?.id === 'online_match');

    if (result?.level === 'unknown') {
      const outcome = localOutcome(result);
      return [t(outcome ? `result.${outcome}.summary` : 'ask.uncertain.answer'), explainSignals(signals.slice(0, 2), t)].filter(Boolean).join('\n\n');
    }
    if (!isFlaggedResult(result)) {
      if (hasOnlineMatch) return t('ask.why.onlyOnline');
      if (result?.level === 'low' && result?.aiReview?.status === 'completed') {
        return [t('ask.why.reviewedLow'), result.onlineNoKnownThreat && t('result.summary.cleanUrl')].filter(Boolean).join(' ');
      }
      if (result?.level === 'low' && result?.onlineNoKnownThreat) return t('ask.why.cleanUrl');
      if (result?.level === 'low') return t('ask.why.cleanOffline');
      return t('ask.why.none');
    }
    if (!signals.length) {
      return hasOnlineMatch
        ? t('ask.why.onlyOnline')
        : t('ask.why.flaggedNoSignals', { level: t(`result.${result.level}`) });
    }

    const reasons = [explainSignals(signals.slice(0, 4), t)];
    if (hasOnlineMatch) reasons.push(t('signal.online_match'));
    return [t('ask.why.flaggedIntro', { level: t(`result.${result.level}`) }), reasons.join('\n\n'), t('ask.why.outro')].join('\n\n');
  }
  if (key === 'ask.next') {
    if (result?.imageMetadata || result?.imageOrigin) {
      return t(hasImageAiClues(result) ? 'ask.next.aiImageClues' : 'ask.next.aiImageNone');
    }
    if (localOutcome(result)) return `${t('result.nextPointLocalVerify')} ${t('result.nextPointLocalContext')}`;
    const level = ['low', 'suspicious', 'high'].includes(result?.level) ? result.level : 'unknown';
    return t(`ask.next.${level}`);
  }
  if (key === 'ask.link') {
    if (!hasCheckedUrl(result)) return t('ask.link.noLink');
    return result?.level === 'low' ? t('ask.link.low') : t('ask.link.caution');
  }
  if (key === 'ask.offline') return t('ask.offline.answer');
  if (key === 'ask.photo') return t('ask.photo.answer');
  if (key === 'ask.aiImage') return imageReviewAnswer(result, t);
  if (key === 'ask.uncertain') {
    if (result?.imageOrigin || result?.imageMetadata) return imageReviewAnswer(result, t);
    if (result?.unsupportedQr) return t('result.qrUnsupported');
    if (result?.mediaInfo?.uncertainExtraction) return t('result.ocrUncertain');
    if (localOutcome(result)) return t(`result.${localOutcome(result)}.summary`);
    return t('ask.uncertain.answer');
  }
  return t('ask.next.unknown');
}
