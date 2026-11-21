import {
  formatEvidenceList,
  getDisplaySignals,
  getSignalEvidenceItems,
  getSignalLabel,
} from '../engine/signal-display.js';

export const SURFY_QUESTION_KEYS = [
  'ask.why',
  'ask.whyClean',
  'ask.next',
  'ask.offline',
  'ask.photo',
  'ask.uncertain',
  'ask.link',
];

const QUESTION_MATCHERS = [
  { key: 'ask.whyClean', words: ['wasn', 'weren', 'clean', 'unflagged', 'not flagged', 'not mark'] },
  { key: 'ask.why', words: ['why', 'flag', 'flagged', 'warning', 'reason', 'bakit', 'dahilan', 'mark', 'suspicious'] },
  { key: 'ask.next', words: ['what', 'do', 'now', 'should', 'next', 'action', 'gagawin', 'fix'] },
  { key: 'ask.link', words: ['link', 'safe', 'open', 'click', 'bukas', 'ligtas'] },
  { key: 'ask.offline', words: ['offline', 'internet', 'online', 'connection', 'walang net'] },
  { key: 'ask.photo', words: ['photo', 'picture', 'image', 'keep', 'save', 'sine-save', 'larawan'] },
  { key: 'ask.uncertain', words: ['sure', 'certain', 'unsure', 'uncertain', 'doubt', 'sigurado'] },
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

export function getSuggestedQuestionKeys({ result, activeTab } = {}) {
  const whyKey = !result || isFlaggedResult(result) ? 'ask.why' : 'ask.whyClean';
  const keys = [whyKey, 'ask.next'];

  if (hasCheckedUrl(result)) keys.push('ask.link');
  keys.push('ask.offline', 'ask.uncertain');
  if (activeTab === 'image' || activeTab === 'qr') keys.push('ask.photo');

  return keys;
}

export function getSurfyAnswer(question, result, t) {
  const key = findQuestionKey(question, t);
  if (!key) return t('ask.fallback');
  if (!result && (key === 'ask.why' || key === 'ask.whyClean' || key === 'ask.next')) return t('ask.noResult');

  if (key === 'ask.why' || key === 'ask.whyClean') {
    const signals = getDisplaySignals(result);
    const hasOnlineMatch = (Array.isArray(result?.signals) ? result.signals : [])
      .some((signal) => signal?.id === 'online_match');

    if (!isFlaggedResult(result)) {
      if (hasOnlineMatch) return t('ask.why.onlyOnline');
      if (result?.level === 'low' && result?.onlineNoKnownThreat) return t('ask.why.cleanUrl');
      if (result?.level === 'low') return t('ask.why.cleanOffline');
      return t('ask.why.none');
    }
    if (!signals.length) {
      return hasOnlineMatch
        ? t('ask.why.onlyOnline')
        : t('ask.why.flaggedNoSignals', { level: t(`result.${result.level}`) });
    }

    const reasons = signals.slice(0, 4).map((signal) => {
      const evidence = formatEvidenceList(getSignalEvidenceItems(signal), t, 1);
      return t('ask.why.item', {
        reason: getSignalLabel(signal, t),
        evidence: evidence ? ` ${evidence}` : '',
      });
    });
    return `${t('ask.why.flaggedIntro', { level: t(`result.${result.level}`) })} ${reasons.join(' ')} ${t('ask.why.outro')}`
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (key === 'ask.next') {
    const level = ['low', 'suspicious', 'high'].includes(result?.level) ? result.level : 'unknown';
    return t(`ask.next.${level}`);
  }
  if (key === 'ask.link') {
    if (!hasCheckedUrl(result)) return t('ask.link.noLink');
    return result?.level === 'low' ? t('ask.link.low') : t('ask.link.caution');
  }
  if (key === 'ask.offline') return t('ask.offline.answer');
  if (key === 'ask.photo') return t('ask.photo.answer');
  return t('ask.next.unknown');
}
