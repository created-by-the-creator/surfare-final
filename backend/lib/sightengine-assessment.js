// Conservative application bands, not measured accuracy or authenticity probabilities.
export const SIGHTENGINE_LOW_SIGNAL = 0.2;
export const SIGHTENGINE_HIGH_SIGNAL = 0.8;

export function classifyAiGeneratedScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)
    throw Error('Invalid AI-generation score.');
  return score >= SIGHTENGINE_HIGH_SIGNAL ? 'high'
    : score <= SIGHTENGINE_LOW_SIGNAL ? 'low' : 'uncertain';
}
