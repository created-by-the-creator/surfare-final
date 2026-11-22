// Shared by training, evaluation and browser inference.
export function scoreFeatures(model, features) {
  const list = [...new Set(features || [])];
  const known = list.filter((feature) => Object.hasOwn(model.weights, feature));
  const coverage = list.length ? known.length / list.length : 0;
  const eligible = list.length >= model.minFeatures && coverage >= model.minCoverage;
  let contribution = 0;
  if (model.featureTransform === 'binary-tfidf-l2') {
    const norm = Math.sqrt(known.reduce((sum, feature) => sum + model.idf[feature] ** 2, 0));
    if (norm) contribution = known.reduce((sum, feature) => sum + model.weights[feature] * model.idf[feature] / norm, 0);
  } else {
    contribution = known.reduce((sum, feature) => sum + model.weights[feature], 0);
  }
  const score = model.intercept + contribution;
  return { score, coverage, abstained: !eligible, flagged: eligible && score >= model.threshold };
}
