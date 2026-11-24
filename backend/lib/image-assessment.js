import { validateSemanticResult } from './semantic-assessment.js';

export const imageOriginLabels = ['AI-like visual cues', 'No clear AI cues', 'Uncertain'];
export const imageOriginLikelihoods = ['Strong', 'Possible', 'No clear', 'Unclear'];
export function validateImageAssessment(value) {
  if (!value || typeof value.extractedText !== 'string' || value.extractedText.length > 12000)
    throw Error('Invalid image text.');
  validateSemanticResult(value.analysis, value.extractedText);
  const origin = value.origin;
  if (
    !origin ||
    !imageOriginLabels.includes(origin.label) ||
    !imageOriginLikelihoods.includes(origin.likelihood) ||
    typeof origin.summary !== 'string' ||
    !origin.summary.trim() ||
    origin.summary.length > 800 ||
    !Array.isArray(origin.observations) ||
    origin.observations.length > 4 ||
    origin.observations.some((s) => typeof s !== 'string' || !s.trim() || s.length > 400) ||
    (origin.ambiguousObservations !== undefined && (!Array.isArray(origin.ambiguousObservations) ||
      origin.ambiguousObservations.length > 4 || origin.ambiguousObservations.some((note) => !origin.observations.includes(note)))) ||
    (origin.nonClues !== undefined && !Array.isArray(origin.nonClues)) ||
    (Array.isArray(origin.nonClues) &&
      (origin.nonClues.length > 3 ||
        origin.nonClues.some((s) => typeof s !== 'string' || !s.trim() || s.length > 300)))
  )
    throw Error('Invalid visual-origin review.');
  if (['AI-like visual cues', 'Strong', 'Possible'].some((value) => value === origin.label || value === origin.likelihood) && !origin.observations.length)
    throw Error('Missing visual observations.');
  if (!value.extractedText.trim() && value.analysis.level !== 'Insufficient evidence')
    throw Error('No readable text cannot receive a text safety verdict.');
  return { ...value, origin: { ...origin, nonClues: origin.nonClues || [] } };
}
