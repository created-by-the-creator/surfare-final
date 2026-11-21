// Shared validation and fusion for contextual model results. No provider credentials here.
export const semanticLevels = ['Low risk', 'Suspicious', 'High risk', 'Insufficient evidence'];
export const semanticKinds = [
  'violence',
  'extortion',
  'blackmail',
  'intimidation',
  'harassment',
  'secret',
  'advance-fee',
  'investment',
  'job-fee',
  'remote',
  'personal',
  'scam',
  'other',
];
const phrases = {
  violence: 'texts that show violence',
  extortion: 'a demand for money with pressure',
  blackmail: 'a threat to share private information',
  intimidation: 'an attempt to scare you',
  harassment: 'repeated messages that bother or target you',
  secret: 'a request to keep something secret',
  'advance-fee': 'a request for money first',
  investment: 'a push toward an investment that may not be real',
  'job-fee': 'a request to pay for a job or task',
  remote: 'a request for access to your device or account',
  personal: 'a request for private information',
  scam: 'a possible trick to get money or information',
  other: 'something that does not look right',
};
const messages = {
  violence: 'The message contains texts that show violence.',
  extortion: 'The message asks for money or something else and pressures you.',
  blackmail: 'The message threatens to share private information.',
  intimidation: 'The message tries to scare you.',
  harassment: 'The message keeps bothering or targeting you.',
  secret: 'The message asks you to keep something secret.',
  'advance-fee': 'The message asks for money first.',
  investment: 'The message pushes an investment that may not be real.',
  'job-fee': 'The message asks you to pay to get a job or task.',
  remote: 'The message asks for access to your device or account.',
  personal: 'The message asks for private information.',
  scam: 'The message looks like a trick to get money or information.',
  other: 'Something in the message does not look right.',
};
const bounded = (s, n) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;

function joinLabels(labels) {
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

function groundedSummary(indicators) {
  if (!indicators.length) return "I didn't notice any strong warning signs in the message.";
  const labels = [...new Set(indicators.map((indicator) => indicator.phrase))].slice(0, 3);
  return `I noticed ${joinLabels(labels)} in the message.`;
}

function groundedRecommendation(level) {
  if (level === 'High risk')
    return "Don't engage or send money or codes. Block and report the sender, then contact the organization through its official app or number.";
  if (level === 'Suspicious')
    return "Pause before clicking, paying, or sharing anything. Confirm the request through an official app or a contact you already trust.";
  if (level === 'Low risk')
    return 'Nothing jumped out, but stay careful. If the request is unexpected, confirm it through an official app or a number you already trust.';
  return "Share more of the message or the full link, or treat it as unsafe. Don't click, pay, or share codes until you've confirmed it with the sender.";
}

export function validateSemanticResult(value, text) {
  if (
    !value ||
    !semanticLevels.includes(value.level) ||
    !bounded(value.summary, 1000) ||
    !bounded(value.recommendation, 1000) ||
    !Array.isArray(value.findings) ||
    value.findings.length > 8
  )
    throw Error('Invalid contextual assessment.');
  const indicators = value.findings.map((f) => {
    if (
      !semanticKinds.includes(f.kind) ||
      !['Suspicious', 'High risk'].includes(f.level) ||
      !bounded(f.quote, 700) ||
      !bounded(f.explanation, 1000)
    )
      throw Error('Invalid contextual finding.');
    const start = text.indexOf(f.quote);
    if (start < 0) throw Error('The contextual evidence was not found in the submitted text.');
    return {
      id: f.kind,
      kind: f.kind,
      phrase: phrases[f.kind],
      title: messages[f.kind],
      message: `${messages[f.kind]} The words “${f.quote}” stood out.`,
      weight: f.level === 'High risk' ? 6 : 2,
      category: ['violence', 'extortion', 'blackmail', 'intimidation', 'harassment'].includes(
        f.kind,
      )
        ? 'personal safety'
        : 'scam',
      source: 'contextual AI',
      evidence: [{ start, end: start + f.quote.length, text: f.quote }],
    };
  });
  if (['High risk', 'Suspicious'].includes(value.level) && !indicators.length)
    throw Error('Missing evidence for the contextual verdict.');
  if (value.level === 'Low risk' && indicators.length)
    throw Error('Conflicting contextual verdict.');
  if (indicators.some((i) => i.weight === 6) && value.level !== 'High risk')
    throw Error('High-risk evidence cannot be downgraded.');
  return {
    level: value.level,
    summary: groundedSummary(indicators),
    recommendation: groundedRecommendation(value.level),
    indicators,
  };
}

export function applySemanticAssessment(local, response) {
  if (response?.status !== 'completed')
    return { ...local, semanticStatus: response?.status || 'not_checked' };
  let contextual;
  try {
    contextual = validateSemanticResult(response.analysis, local.sourceText || '');
  } catch {
    return { ...local, semanticStatus: 'unavailable' };
  }
  const rank = (level) =>
    ({ 'Insufficient evidence': 0, 'Low risk': 1, Suspicious: 2, 'High risk': 3 })[level] || 0;
  const weakOnly =
    local.level === 'Suspicious' &&
    local.indicators.length > 0 &&
    local.indicators.every(
      (i) => i.weight <= 2 && !['personal safety', 'link'].includes(i.category),
    );
  const resolvedWeak = weakOnly && contextual.level === 'Low risk' && !local.urls.length;
  const keepLocal = !resolvedWeak && rank(local.level) > rank(contextual.level);
  const conflict = keepLocal && contextual.level === 'Low risk';
  const merged = {
    ...local,
    level: keepLocal ? local.level : contextual.level,
    summary: keepLocal ? local.summary : contextual.summary,
    recommendation: keepLocal ? local.recommendation : contextual.recommendation,
    indicators: [...contextual.indicators, ...(resolvedWeak ? [] : local.indicators)],
    reviewedLocalIndicators: resolvedWeak ? local.indicators : [],
    semanticStatus: 'completed',
    semanticConflict: conflict,
    limitations: [
      ...local.limitations,
      'Contextual AI can misunderstand wording, sarcasm or missing context. Its assessment does not verify identity or guarantee safety.',
    ],
  };
  if (resolvedWeak)
    merged.limitations.unshift(
      'Contextual AI interpreted the weak local wording hints as benign. Those hints were not proof of fraud; this interpretation can still be wrong.',
    );
  if (conflict)
    merged.limitations.unshift(
      'The contextual model and local warnings disagree. The stronger warning is retained for review.',
    );
  if ((local.uncertainExtraction || local.unsupportedQr) && merged.level === 'Low risk')
    return {
      ...merged,
      level: 'Insufficient evidence',
      summary: local.summary,
      recommendation: local.recommendation,
    };
  return merged;
}
