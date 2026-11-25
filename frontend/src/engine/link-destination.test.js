import { expect, it, vi } from 'vitest';
import { analyzeInput } from './analyze.js';
import { mergeLinkResolution, requestLinkDestination, linkReportLines } from './link-destination.js';

const url = 'https://bit.ly/fictional-test';
const base = { level: 'unknown', score: 0, checkedText: url, signals: [], linkPayloads: [{ type: 'url', url, originalValue: url }] };
const report = { originalUrl: url, status: 'resolved', finalDestination: 'https://example.com/', redirectCount: 1,
  riskLevel: 'Insufficient evidence', chain: [
    { url, domain: 'bit.ly', level: 'Insufficient evidence', indicators: [], visited: true, httpStatus: 302 },
    { url: 'https://example.com/', domain: 'example.com', level: 'Insufficient evidence', indicators: [], visited: true, httpStatus: 200 },
  ] };

it('checking a decoded short QR link automatically resolves its destination', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(report));
  try {
    const result = await analyzeInput('qr', { qrValue: url }, { onlineLookup: true, ai: false });
    expect(result.linkPayloads[0]).toMatchObject({ type: 'url', urlType: 'shortened' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/qr-resolve');
    expect(result.linkDestinations[url].finalDestination).toBe(report.finalDestination);
  } finally { fetcher.mockRestore(); }
});

it.each(['WIFI:T:WPA;S:demo;P:secret;;', 'otpauth://totp/test?secret=abc', 'https://public.com/?token=secret', 'http://127.0.0.1/'])('private QR %s stays local even when AI is selected', async value => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  try {
    const result = await analyzeInput('qr', { qrValue: value }, { onlineLookup: true, ai: true });
    expect(result.privateQr).toBe(true); expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
});

it('sends only the chosen address and explicit consent to the redirect service', async () => {
  const fetcher = vi.fn(async () => Response.json(report));
  const response = await requestLinkDestination(url, undefined, fetcher);
  expect(response).toEqual(report);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/qr-resolve');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ url, consent: true });
});

it('a warning in the destination raises the verdict without rewriting the QR or inventing its highlights', () => {
  const result = mergeLinkResolution(base, { ...report, riskLevel: 'High risk', score: 8 });
  expect(result.level).toBe('high'); expect(result.score).toBe(8);
  expect(result.checkedText).toBe(url); expect(result.signals).toEqual([]); expect(result.destinationWarning).toBe(true);
  expect(linkReportLines(result, key => key).join('\n')).toContain(report.finalDestination);
});

it('no warning and an unresolved destination cannot become a low-risk QR result', () => {
  expect(mergeLinkResolution(base, report).level).toBe('unknown');
  const high = { ...base, level: 'high', score: 8 };
  expect(mergeLinkResolution(high, { ...report, status: 'unresolved', reason: 'timeout' }).level).toBe('high');
  expect(mergeLinkResolution(base, { ...report, originalUrl: 'https://unrelated.test/' })).toBe(base);
});

it('a failed resolver response retains an explicit inability to verify', async () => {
  const result = await requestLinkDestination(url, undefined, async () => Response.json({ reason: 'service_unavailable' }, { status: 503 }));
  expect(result).toMatchObject({ originalUrl: url, status: 'unresolved', reason: 'service_unavailable' });
});

it('a failed retry cannot erase a warning from the earlier recorded destination', () => {
  const earlier = mergeLinkResolution(base, { ...report, riskLevel: 'High risk', score: 8,
    chain: [...report.chain, { url: 'https://unsafe.example/', level: 'High risk', indicators: [{ id: 'dataset-url-match', title: 'Listed URL' }] }] });
  const retried = mergeLinkResolution(earlier, { ...report, status: 'unresolved', finalDestination: null, riskLevel: 'Insufficient evidence', reason: 'timeout' });
  expect(retried.level).toBe('high');
  expect(retried.linkDestinations[url].status).toBe('unresolved');
  expect(retried.linkDestinations[url].priorWarningChain[0].url).toBe('https://unsafe.example/');
});


it.each(['text', 'links', 'qr'])('automatically reveals a short Surfare link in %s without a format-only suspicious verdict', async kind => {
  const surfare = { ...report, finalDestination: 'https://surfare.vercel.app/',
    chain: [report.chain[0], { ...report.chain[1], url: 'https://surfare.vercel.app/', domain: 'surfare.vercel.app' }] };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(surfare));
  try {
    const inputs = kind === 'links' ? { url } : kind === 'qr' ? { qrValue: url } : { message: 'Our project website is at ' + url };
    const result = await analyzeInput(kind, inputs, { onlineLookup: true, ai: false });
    expect(result.level).toBe('unknown');
    expect(result.signals.some(signal => ['shortener', 'reported-gambling-link', 'dataset-url-match'].includes(signal.id))).toBe(false);
    expect(result.linkDestinations[url].finalDestination).toBe('https://surfare.vercel.app/');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.aiReview.status).toBe('not_checked');
  } finally { fetcher.mockRestore(); }
});

it('a harmless destination does not clear a request for an OTP in the original message', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(report));
  try {
    const result = await analyzeInput('text', { message: 'Send your OTP now or your account will be blocked. ' + url }, { onlineLookup: true });
    expect(result.level).toBe('high');
    expect(result.signals.some(signal => signal.id === 'otp_request')).toBe(true);
    expect(result.signals.some(signal => signal.id === 'shortener')).toBe(false);
  } finally { fetcher.mockRestore(); }
});

it('a listed destination raises an otherwise ordinary message to high risk', async () => {
  const malicious = { ...report, finalDestination: 'https://0-0sc.com/', riskLevel: 'High risk', score: 5,
    chain: [report.chain[0], { ...report.chain[1], url: 'https://0-0sc.com/', domain: '0-0sc.com', level: 'High risk',
      indicators: [{ id: 'dataset-url-match', title: 'Known phishing link', weight: 5 }] }] };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(malicious));
  try {
    const result = await analyzeInput('text', { message: 'Our project website is at ' + url }, { onlineLookup: true });
    expect(result.level).toBe('high'); expect(result.destinationWarning).toBe(true);
    expect(result.linkDestinations[url].chain[1].domain).toBe('0-0sc.com');
  } finally { fetcher.mockRestore(); }
});

it('failure to resolve a short link stays unverified and never becomes low risk', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network unavailable'));
  try {
    const result = await analyzeInput('links', { url }, { onlineLookup: true });
    expect(result.level).toBe('unknown');
    expect(result.linkDestinations[url]).toMatchObject({ status: 'unresolved', reason: 'network' });
  } finally { fetcher.mockRestore(); }
});

it('AI warning evidence is preserved after destination checks finish', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => Response.json(path === '/api/qr-resolve' ? report : {
    level: 'High risk', score: 6, aiReview: { status: 'completed', provider: 'openrouter' },
    indicators: [{ id: 'personal', weight: 6, source: 'contextual AI', title: 'Private information request', evidence: [{ text: 'Send your OTP' }] }],
  }));
  try {
    const result = await analyzeInput('text', { message: 'Send your OTP now. ' + url }, { onlineLookup: true, ai: true });
    expect(result.level).toBe('high');
    expect(result.signals.some(signal => signal.id === 'personal')).toBe(true);
    expect(result.aiReview.status).toBe('completed');
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/qr-resolve', '/api/detect']);
  } finally { fetcher.mockRestore(); }
});
