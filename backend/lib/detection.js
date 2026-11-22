import { assessDatasets } from './dataset-assessment.js';
import { assessUrlReferences } from './url-reference-datasets.js';
import { analyzePatterns } from './pattern-detection.js';
export { analyzeUrl, levelForIndicators, scoreForIndicators } from './pattern-detection.js';
export { extractUrls, normalizeUrl } from './url-input.js';

function datasetUrlEvidence(urls, matchedUrl) {
  return urls.find((item) => item.url === matchedUrl)?.evidence || [];
}

function referenceUrlEvidence(urls, matches) {
  const items = [];
  const seen = new Set();
  for (const match of Array.isArray(matches) ? matches : []) {
    for (const item of datasetUrlEvidence(urls, match?.url)) {
      const key = `${item.start}:${item.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items.slice(0, 3);
}

function dedupeEvidence(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = `${item?.start}:${item?.end}:${item?.text}`;
    if (seen.has(key) || !item?.text) return false;
    seen.add(key);
    return true;
  });
}

function addReferenceIndicators(text, urls, add) {
  const datasetMatch = assessDatasets(text, urls.map((u) => u.url));
  const references = assessUrlReferences(text, urls);
  const phishingEvidence = dedupeEvidence([
    ...(datasetMatch?.risk === 'high' && datasetMatch.kind === 'url'
      ? datasetUrlEvidence(urls, datasetMatch.url)
      : []),
    ...referenceUrlEvidence(urls, references.phishing),
  ]);
  if (phishingEvidence.length)
    add(
      'dataset-url-match',
      'Known phishing or scam link',
      'A destination in the supplied link is listed as a phishing or scam site.',
      5,
      phishingEvidence,
      'dataset',
    );
  if (datasetMatch?.risk === 'high' && datasetMatch.kind === 'text')
    add(
      'dataset-text-match',
      'Known suspicious message',
      'This message closely matches a scam message we have seen before.',
      5,
      [{ start: 0, end: text.length, text }],
      'dataset',
    );
  const gamblingEvidence = referenceUrlEvidence(urls, references.gambling);
  if (gamblingEvidence.length)
    add(
      'reported-gambling-link',
      'Reported gambling link',
      'The Philippine gaming regulator has publicly warned about this web address.',
      5,
      gamblingEvidence,
      'link',
    );
  const reviewedGamblingEvidence = referenceUrlEvidence(urls, references.reviewedGambling);
  if (reviewedGamblingEvidence.length)
    add(
      'watchlisted-gambling-link',
      'Reported gambling site',
      'This web address was reported for review and is not in the Philippine gaming regulator’s published list of registered gambling sites. That does not prove it is illegal; confirm it through the regulator or the operator’s own channel.',
      2,
      reviewedGamblingEvidence,
      'link',
    );
  const unlistedGamblingEvidence = referenceUrlEvidence(urls, references.unlistedGambling);
  if (unlistedGamblingEvidence.length)
    add(
      'unlisted-gambling-link',
      'Gambling site not on PAGCOR list',
      'This web address is not in the Philippine gaming regulator’s published list of registered gambling sites. That does not prove it is unsafe; confirm it through the regulator or the operator’s own channel.',
      2,
      unlistedGamblingEvidence,
      'link',
    );
  const fakeRegulatorEvidence = referenceUrlEvidence(urls, references.fakeRegulator);
  if (fakeRegulatorEvidence.length)
    add(
      'fake-regulator-link',
      'Fake regulator link',
      'This web address claims to check gaming licences but is not connected to the Philippine gaming regulator.',
      5,
      fakeRegulatorEvidence,
      'link',
    );
  const lenderEvidence = dedupeEvidence(references.lenders.flatMap((match) => match.evidence));
  if (lenderEvidence.length)
    add(
      'stopped-lender',
      'Loan service ordered to stop',
      'The Philippine securities regulator has ordered this loan service to stop operating.',
      5,
      lenderEvidence,
      'scam',
    );
}

export function analyze(text, explicitUrls = []) {
  return analyzePatterns(text, explicitUrls, addReferenceIndicators);
}
