import textModel from './models/taglish-intent-model.json' with { type: 'json' };
import urlModel from './models/url-risk-model.json' with { type: 'json' };
import { smsFeatures } from './sms-features.js';
import { urlLexicalFeatures } from './url-lexical-features.js';
import { normalizeEvidence, evidenceMatches } from './text-evidence.js';
import { scoreFeatures } from './model-scoring.js';

function classify(model, features, minFeatures, minCoverage, evidence) {
  return {
    ...scoreFeatures({ ...model, minFeatures, minCoverage }, features),
    threshold: model.threshold,
    evidence: [],
    ...(evidence ? { evidence } : {}),
  };
}

export function classifyTaglishIntent(text) {
  const { features } = smsFeatures(text);
  const evidence = features
    .filter(
      (feature) =>
        feature.startsWith('w:')
        && !['w:urltoken', 'w:numbertoken'].includes(feature)
        && (textModel.weights[feature] || 0) > 1.5,
    )
    .sort((a, b) => textModel.weights[b] - textModel.weights[a])
    .slice(0, 6)
    .flatMap((feature) =>
      evidenceMatches(normalizeEvidence(text), new RegExp(`\\b${feature.slice(2)}\\b`, 'i')),
    );
  return classify(
    textModel,
    features,
    textModel.minFeatures,
    textModel.minCoverage,
    evidence,
  );
}

export function classifyUrlRisk(raw) {
  const extracted = urlLexicalFeatures(raw);
  if (!extracted)
    return classify(urlModel, [], urlModel.minFeatures, urlModel.minCoverage);
  const evidence = extracted.words
    .filter((word) => (urlModel.weights[`w:${word}`] || 0) > 1)
    .sort((a, b) => (urlModel.weights[`w:${b}`] || 0) - (urlModel.weights[`w:${a}`] || 0))
    .slice(0, 6)
    .map((text) => ({ text }));
  return classify(
    urlModel,
    extracted.features,
    urlModel.minFeatures,
    urlModel.minCoverage,
    evidence,
  );
}

export function assessDatasetModels(text, urls = []) {
  const url = urls.map((value) => classifyUrlRisk(value)).find((result) => result.flagged) || null;
  return { text: classifyTaglishIntent(text), url };
}
