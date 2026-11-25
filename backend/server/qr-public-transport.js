import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { isLocalQrHost, describeQrPayload } from '../lib/qr-links.js';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3ffe::', 16], ['3fff::', 20]]) blocked.addSubnet(network, prefix, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
export function isPublicQrAddress(address) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
const fail = code => Object.assign(new Error(code), { code });

export function validateQrTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('blocked_target'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
    url.href.length > 2048 || isLocalQrHost(host) || describeQrPayload(url.href).blocked || isIP(host) && !isPublicQrAddress(host)) throw fail('blocked_target');
  return url;
}

// Validate every DNS answer, then pin the connection to one approved address.
// No automatic redirects, cookies, authorization headers or response bodies.
export function createQrPublicTransport({ lookup = dnsLookup, requestHttp = httpRequest, requestHttps = httpsRequest } = {}) {
  return async (value, { method = 'HEAD', signal } = {}) => {
    const url = validateQrTarget(value), hostname = url.hostname.replace(/^\[|\]$/g, '');
    signal?.throwIfAborted();
    let onAbort;
    let records;
    try {
      records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }]
        : await Promise.race([
          lookup(hostname, { all: true, verbatim: true }),
          new Promise((_, reject) => { onAbort = () => reject(signal.reason); signal?.addEventListener('abort', onAbort, { once: true }); }),
        ]);
    } finally { if (onAbort) signal?.removeEventListener('abort', onAbort); }
    signal?.throwIfAborted();
    if (!records.length || records.some(record => !isPublicQrAddress(record.address))) throw fail('blocked_target');
    const address = records.find(record => record.family === 4) || records[0], send = url.protocol === 'https:' ? requestHttps : requestHttp;
    return new Promise((resolve, reject) => {
      const request = send(url, {
        method, signal, agent: false, family: address.family, autoSelectFamily: false,
        lookup: (_host, _options, done) => done(null, address.address, address.family),
        headers: { 'User-Agent': 'Surfare-QR-Redirect-Check/1.0', Accept: '*/*', ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}) },
      }, response => {
        const location = response.headers.location;
        resolve({ status: response.statusCode, location: typeof location === 'string' ? location : null });
        response.destroy();
      });
      request.setTimeout(3000, () => request.destroy(fail('timeout')));
      request.on('error', reject);
      request.end();
    });
  };
}
