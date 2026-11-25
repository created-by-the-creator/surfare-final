import { normalizeUrl, redirectDestinations } from '../../../backend/lib/url-input.js';
import { SOCIAL_PLATFORMS } from '../../../backend/lib/known-platform-domains.js';
import { isShortLinkHost } from '../../../backend/lib/short-links.js';

// Domain identity hints only. These matches never affect the risk verdict.
// Government names checked against their own sites; see docs/link-descriptions.md.
const SITES = [
  { domain: 'gov.ph', name: 'GOV.PH — National Government Portal', type: 'government', exact: true },
  { domain: 'ngp.e.gov.ph', name: 'GOV.PH — National Government Portal', type: 'government', exact: true },
  { domain: 'bir.gov.ph', name: 'Bureau of Internal Revenue (BIR)', type: 'government' },
  { domain: 'sss.gov.ph', name: 'Social Security System (SSS)', type: 'government' },
  { domain: 'gcash.com', name: 'GCash', type: 'wallet' },
  { domain: 'maya.ph', name: 'Maya', type: 'wallet' },
  { domain: 'paymaya.com', name: 'Maya', type: 'wallet' },
  { domain: 'bpi.com.ph', name: 'BPI', type: 'bank' },
  { domain: 'bdo.com.ph', name: 'BDO', type: 'bank' },
  { domain: 'paypal.com', name: 'PayPal', type: 'wallet' },
  { domain: 'shopee.ph', name: 'Shopee', type: 'shopping' },
  { domain: 'lazada.com.ph', name: 'Lazada', type: 'shopping' },
];
const matches = (host, domain) => host === domain || host.endsWith(`.${domain}`);

export function describeLink(value) {
  try {
    const url = normalizeUrl(String(value || ''));
    if (url.href.length > 2048 || /\s/.test(String(value).trim())) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const bare = host.replace(/^www\./, '');
    const site = SITES.find(site => site.exact ? bare === site.domain : matches(host, site.domain));
    const social = !site && SOCIAL_PLATFORMS.find(site => matches(host, new URL(site.url).hostname.replace(/^www\./, '')));
    const shortened = isShortLinkHost(bare);
    const type = shortened ? 'shortened' : site?.type || (social ? 'social'
      : /(?:^|\.)gov(?:\.ph|\.uk|\.au)?$/.test(host) ? 'government'
      : /(?:^|\.)(?:edu|edu\.ph|ac\.uk)$/.test(host) ? 'education'
      : /\.(?:pdf|docx?|xlsx?|zip|exe|apk)$/i.test(url.pathname) ? 'file' : 'website');
    return {
      host: url.host.toLowerCase(), name: site?.name || social?.name || '', type, shortened,
      // Only show hosts from explicit query parameters. Never imply that they were followed.
      embeddedHosts: [...new Set(redirectDestinations(url).flatMap(target => {
        const parsed = new URL(target);
        return ['http:', 'https:'].includes(parsed.protocol) ? [parsed.host.toLowerCase()] : [];
      }))].slice(0, 2),
      basis: 'address-only',
    };
  } catch { return null; }
}

export function linkDescription(info, t) {
  if (!info) return '';
  if (info.resolvedHost) return t('destination.foundHost', { host: info.resolvedHost });
  return t(info.shortened ? 'linkInfo.hidden' : info.name ? 'linkInfo.named' : 'linkInfo.address', { name: info.name, host: info.host });
}
