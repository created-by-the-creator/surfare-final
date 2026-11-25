import { apiFetch } from '../api/fetch.js';
import { levelForIndicators, scoreForIndicators } from '../../../backend/lib/pattern-detection.js';

const levels = { 'High risk': 'high', Suspicious: 'suspicious', 'Low risk': 'unknown', 'Insufficient evidence': 'unknown' };
const rank = { low: 0, unknown: 0, suspicious: 1, high: 2 };
export async function requestLinkDestination(url, signal, fetcher = apiFetch) {
  try {
    const response = await fetcher('/api/qr-resolve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, consent: true }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(16000)]) : AbortSignal.timeout(16000),
    });
    const data = await response.json();
    if (response.ok && ['resolved', 'unresolved'].includes(data.status) && data.originalUrl === url &&
      Array.isArray(data.chain) && data.chain.length > 0 && data.chain.length <= 7 && data.chain[0].url === url &&
      (data.status !== 'resolved' || data.finalDestination === data.chain.at(-1).url && data.chain.at(-1).visited === true &&
        data.chain.at(-1).httpStatus >= 200 && data.chain.at(-1).httpStatus < 300) && data.chain.every(row => {
        try { return ['http:', 'https:'].includes(new URL(row.url).protocol) && row.url.length <= 2048 &&
          Array.isArray(row.indicators) && Object.hasOwn(levels, row.level); } catch { return false; }
      })) return data;
    return { originalUrl: url, status: 'unresolved', reason: data.reason || 'service_unavailable', chain: [], redirectCount: 0, riskLevel: 'Insufficient evidence' };
  } catch (error) {
    return { originalUrl: url, status: 'unresolved', reason: ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network',
      chain: [], redirectCount: 0, riskLevel: 'Insufficient evidence' };
  }
}

export function mergeLinkResolution(result, resolution) {
  if (!result?.linkPayloads?.some(item => item.type === 'url' && item.url === resolution.originalUrl)) return result;
  const previous = result.linkDestinations?.[resolution.originalUrl];
  if (resolution.status === 'unresolved' && (rank[levels[previous?.riskLevel]] || 0) > (rank[levels[resolution.riskLevel]] || 0)) {
    resolution = { ...resolution, riskLevel: previous.riskLevel, score: previous.score,
      priorWarningChain: previous.priorWarningChain || previous.chain.filter(row => (rank[levels[row.level]] || 0) > 0) };
  }
  const linkDestinations = { ...result.linkDestinations, [resolution.originalUrl]: resolution };
  const baseLevel = result.destinationBaseLevel || result.level;
  const baseSignals = result.destinationBaseSignals || result.signals || [];
  const shortened = result.linkPayloads.filter(item => item.type === 'url' && item.urlType === 'shortened');
  const allAttempted = shortened.length > 0 && shortened.every(item => linkDestinations[item.url]);
  const signals = allAttempted ? baseSignals.filter(signal => !['shortener', 'url_shortener'].includes(signal.id)) : baseSignals;
  const removedFormatWarning = signals.length !== baseSignals.length;
  let level = removedFormatWarning ? levels[levelForIndicators(signals, { sufficient: false })] : baseLevel;
  let score = removedFormatWarning ? scoreForIndicators(signals) : result.destinationBaseScore ?? result.score;
  for (const report of Object.values(linkDestinations)) {
    const destinationLevel = levels[report.riskLevel] || 'unknown';
    if ((rank[destinationLevel] || 0) > (rank[level] || 0)) level = destinationLevel;
    score = Math.max(Number(score) || 0, Number(report.score) || 0);
  }
  const resolved = Object.values(linkDestinations).find(report => report.status === 'resolved');
  const linkInfo = result.linkInfo ? { ...result.linkInfo } : null;
  if (linkInfo) {
    delete linkInfo.resolvedHost;
    if (resolved) linkInfo.resolvedHost = new URL(resolved.finalDestination).hostname;
  }
  return { ...result, level, score, signals, destinationBaseSignals: baseSignals,
    ...(linkInfo ? { linkInfo } : {}),
    ...(removedFormatWarning && !signals.length ? { semanticConflict: false } : {}),
    destinationBaseLevel: baseLevel, destinationBaseScore: result.destinationBaseScore ?? result.score,
    linkDestinations, destinationWarning: Object.values(linkDestinations).some(report => (rank[levels[report.riskLevel]] || 0) > 0) };
}

export async function automaticallyResolveLinks(result) {
  const links = result.linkPayloads?.filter(item => item.type === 'url' && !item.blocked &&
    (item.urlType === 'shortened' || result.destinationContext === 'links')) || [];
  if (!links.length) return result;
  const deadline = AbortSignal.timeout(20000);
  const reports = new Array(links.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, links.length) }, async () => {
    while (next < links.length) {
      const index = next++;
      reports[index] = await requestLinkDestination(links[index].url, deadline);
    }
  }));
  return reports.reduce(mergeLinkResolution, result);
}

export function linkReportLines(result, t) {
  const lines = [];
  for (const item of result?.linkPayloads || []) {
    if (item.type !== 'url') continue;
    lines.push(t(result.destinationContext === 'qr' ? 'qr.original' : 'destination.original'), item.originalValue);
    const report = result.linkDestinations?.[item.url];
    if (!report) { lines.push(t('qr.unchecked')); continue; }
    lines.push(t(report.status === 'resolved' ? 'qr.resolved' : 'qr.unresolved'));
    if (report.reason) lines.push(t(`qr.reason.${report.reason}`));
    lines.push(`${t('qr.redirectCount')}: ${report.redirectCount}`);
    for (const row of report.chain) {
      lines.push(`${row.url} (${row.domain})`, t(`result.${levels[row.level] || 'unknown'}`));
      for (const indicator of row.indicators) lines.push(`${indicator.title}: ${indicator.evidence?.map(e => e.text).filter(Boolean).join(', ') || row.url}`);
    }
    if (report.priorWarningChain?.length) {
      lines.push(t('qr.priorWarning'));
      for (const row of report.priorWarningChain) {
        lines.push(row.url);
        for (const indicator of row.indicators) lines.push(`${indicator.title}: ${indicator.evidence?.map(e => e.text).filter(Boolean).join(', ') || row.url}`);
      }
    }
    if (report.finalDestination) lines.push(`${t('qr.final')}: ${report.finalDestination}`);
    lines.push(t('qr.limitation'));
  }
  return lines;
}
