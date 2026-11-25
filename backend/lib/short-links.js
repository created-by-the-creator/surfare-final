// A shared host identifies a shortening service, not the safety of its individual links.
const hosts = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'cutt.ly', 'rb.gy', 'shorturl.at', 'qrco.de', 'rebrand.ly', 'youtu.be']);
export function isShortLinkHost(host) {
  return hosts.has(String(host || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, ''));
}
