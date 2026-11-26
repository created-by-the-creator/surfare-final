import { assessUrlReferences } from './reference-data.js';
import { matchesKnownPhishingUrl } from './phishing-urls.js';

function referenceUrlEvidence(urls, matches) {
  const items = [];
  const seen = new Set();
  for (const match of Array.isArray(matches) ? matches : []) {
    for (const item of urls.find((entry) => entry.url === match?.url)?.evidence || []) {
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

// Same indicator contract as backend/lib/detection.js. Exact dataset entries
// stay server-side; the reference host/name lists are safe to bundle.
export function addBrowserReferenceIndicators(text, urls, add) {
  const references = assessUrlReferences(text, urls);

  const exactUrls=urls.filter(item=>matchesKnownPhishingUrl(item.url));
  const phishingEvidence = referenceUrlEvidence(urls, [...references.phishing,...exactUrls]);
  if (phishingEvidence.length) {
    add(
      'dataset-url-match',
      'Known phishing or scam link',
      'A destination in the supplied link is listed as a phishing or scam site.',
      5,
      phishingEvidence,
      'dataset',
    );
  }

  const gamblingEvidence = referenceUrlEvidence(urls, references.gambling);
  if (gamblingEvidence.length) {
    add(
      'reported-gambling-link',
      'Reported gambling link',
      'The Philippine gaming regulator has publicly warned about this web address.',
      5,
      gamblingEvidence,
      'link',
    );
  }

  const reviewedGamblingEvidence = referenceUrlEvidence(urls, references.reviewedGambling);
  if (reviewedGamblingEvidence.length) {
    add(
      'watchlisted-gambling-link',
      'Reported gambling site',
      'This web address was reported for review and is not in the Philippine gaming regulator’s published list of registered gambling sites. That does not prove it is illegal; confirm it through the regulator or the operator’s own channel.',
      2,
      reviewedGamblingEvidence,
      'link',
    );
  }

  const unlistedGamblingEvidence = referenceUrlEvidence(urls, references.unlistedGambling);
  if (unlistedGamblingEvidence.length) {
    add(
      'unlisted-gambling-link',
      'Gambling site not on PAGCOR list',
      'This web address is not in the Philippine gaming regulator’s published list of registered gambling sites. That does not prove it is unsafe; confirm it through the regulator or the operator’s own channel.',
      2,
      unlistedGamblingEvidence,
      'link',
    );
  }

  const fakeRegulatorEvidence = referenceUrlEvidence(urls, references.fakeRegulator);
  if (fakeRegulatorEvidence.length) {
    add(
      'fake-regulator-link',
      'Fake regulator link',
      'This web address claims to check gaming licences but is not connected to the Philippine gaming regulator.',
      5,
      fakeRegulatorEvidence,
      'link',
    );
  }

  const lenderEvidence = dedupeEvidence(references.lenders.flatMap((match) => match.evidence));
  if (lenderEvidence.length) {
    add(
      'stopped-lender',
      'Loan service ordered to stop',
      'The Philippine securities regulator has ordered this loan service to stop operating.',
      5,
      lenderEvidence,
      'scam',
    );
  }

  return false;
}
