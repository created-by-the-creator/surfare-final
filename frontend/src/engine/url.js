import { parse } from 'tldts';
import { assessUrlReferences } from './reference-data.js';

const BRANDS = [
  'gcash',
  'maya',
  'bpi',
  'bdo',
  'metrobank',
  'landbank',
  'shopee',
  'lazada',
  'facebook',
  'google',
];

const OFFICIAL_BRAND_DOMAINS = {
  gcash: ['gcash.com'],
  bdo: ['bdo.com.ph'],
  bpi: ['bpi.com.ph'],
  paypal: ['paypal.com'],
  maya: ['maya.ph', 'paymaya.com'],
  facebook: ['facebook.com', 'fb.com'],
  google: ['google.com'],
  microsoft: ['microsoft.com', 'live.com', 'office.com'],
  shopee: ['shopee.ph'],
  lazada: ['lazada.com.ph'],
};
const OFFICIAL_DOMAINS = new Set(Object.values(OFFICIAL_BRAND_DOMAINS).flat());

const SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly',
  'shorturl.at', 'rb.gy', 'rebrand.ly',
];
const RISKY_TLDS = ['zip', 'xyz', 'top', 'click', 'work', 'support', 'rest', 'country'];

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] =
        left[i - 1] === right[j - 1]
          ? previous
          : 1 + Math.min(previous, row[j - 1], row[j]);
      previous = current;
    }
  }
  return row[right.length];
}

function pushSignal(signals, id, evidence, weight = 2, severity = 2) {
  signals.push({ id, evidence, weight, severity });
}

const REFERENCE_SIGNALS = [
  ['phishing', 'dataset-url-match', 5, 3],
  ['gambling', 'reported-gambling-link', 5, 3],
  ['reviewedGambling', 'watchlisted-gambling-link', 2, 2],
  ['unlistedGambling', 'unlisted-gambling-link', 2, 2],
  ['fakeRegulator', 'fake-regulator-link', 5, 3],
];

function addReferenceSignals(signals, text, normalized, host) {
  const references = assessUrlReferences(text, [{ url: normalized, host }]);
  const added = new Set();
  for (const [key, id, weight, severity] of REFERENCE_SIGNALS) {
    if (added.has(id)) continue;
    const match = references[key]?.[0];
    if (!match) continue;
    added.add(id);
    pushSignal(signals, id, match.host || normalized, weight, severity);
  }
  const lender = references.lenders?.[0]?.evidence?.[0]?.text;
  if (lender) pushSignal(signals, 'stopped-lender', lender, 5, 3);
}

export function normalizeUrl(value) {
  const trimmed = value.trim();
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function analyzeUrl(value) {
  const signals = [];
  const normalized = normalizeUrl(value);
  let url;

  try {
    url = new URL(normalized);
  } catch {
    return {
      normalized,
      signals: [{ id: 'invalid_url', severity: 1, weight: 0, evidence: value }],
    };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    pushSignal(signals, 'data_or_javascript_scheme', url.protocol, 8, 3);
    return { normalized, signals, hostname: url.hostname, domain: url.hostname };
  }

  const parsed = parse(url.hostname);
  const domain = (parsed.domain ?? url.hostname).toLowerCase();
  const subdomain = (parsed.subdomain ?? '').toLowerCase();
  const registrableLabel = domain.split('.')[0];

  if (url.protocol !== 'https:') pushSignal(signals, 'no_https', url.protocol, 1, 1);
  if (parsed.isIp) pushSignal(signals, 'ip_host', url.hostname, 3, 3);
  if ((parsed.subdomain ?? '').split('.').filter(Boolean).length > 3) {
    pushSignal(signals, 'excessive_subdomains', url.hostname, 2, 2);
  }
  if (SHORTENERS.some((shortener) => url.hostname === shortener || url.hostname.endsWith(`.${shortener}`))) {
    pushSignal(signals, 'url_shortener', url.hostname, 2, 2);
  }
  if (/xn--/i.test(url.hostname)) pushSignal(signals, 'punycode_or_homoglyph', url.hostname, 3, 3);
  const officialDomain = OFFICIAL_DOMAINS.has(domain);
  if (
    !officialDomain &&
    subdomain.split('.').some((label) => BRANDS.some((brand) => label.includes(brand)))
  ) {
    pushSignal(signals, 'brand_in_subdomain_not_domain', url.hostname, 3, 3);
  }
  if (
    !officialDomain &&
    BRANDS.some(
      (brand) =>
        brand.length >= 4 &&
        editDistance(registrableLabel, brand) === 1 &&
        registrableLabel !== brand,
    )
  ) {
    pushSignal(signals, 'lookalike_brand', domain, 3, 3);
  }
  if (parsed.publicSuffix && RISKY_TLDS.includes(parsed.publicSuffix.toLowerCase())) {
    pushSignal(signals, 'risky_tld', `.${parsed.publicSuffix}`, 2, 2);
  }
  if (url.username || url.password || value.includes('@')) {
    pushSignal(signals, 'at_symbol', value, 2, 2);
  }
  if (value.length > 180 || /%[0-9a-f]{2}/i.test(value)) {
    pushSignal(signals, 'long_or_encoded_url', value.slice(0, 100), 2, 2);
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    pushSignal(signals, 'non_standard_port', url.port, 2, 2);
  }
  if (/[?&](?:url|redirect|next|return)=/i.test(url.search)) {
    pushSignal(signals, 'redirect_param', url.search, 2, 2);
  }
  addReferenceSignals(signals, value, normalized, url.hostname);

  return { normalized, signals, hostname: url.hostname, domain };
}

export { BRANDS };
