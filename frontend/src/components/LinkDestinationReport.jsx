import { useEffect, useRef, useState } from 'react';
import { requestLinkDestination } from '../engine/link-destination.js';
import { getSignalLabel } from '../engine/signal-display.js';
import './LinkDestinationReport.css';

export default function LinkDestinationReport({ result, isOnline, onResolved, t }) {
  const [pending, setPending] = useState('');
  const [reports, setReports] = useState({});
  const active = useRef(null);
  useEffect(() => () => active.current?.abort(), []);
  const check = async url => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setPending(url);
    const report = await requestLinkDestination(url, controller.signal);
    if (controller.signal.aborted) return;
    setReports(previous => ({ ...previous, [url]: report }));
    setPending(''); onResolved?.(report);
  };
  const qr = result.destinationContext === 'qr';
  return <section className="link-destination-report" aria-label={t(qr ? 'qr.title' : 'destination.title')}>
    <h3>{t(qr ? 'qr.title' : 'destination.title')}</h3>
    {result.linkPayloads.map((item, index) => {
      if (item.type !== 'url') return <p key={index}>{t(`qr.payload.${item.type}`)}</p>;
      const report = result.linkDestinations?.[item.url] || reports[item.url];
      const warning = report && ['High risk', 'Suspicious'].includes(report.riskLevel);
      const destination = report?.status === 'resolved' && report.finalDestination
        ? new URL(report.finalDestination).hostname : item.domain;
      const title = pending === item.url ? 'qr.checking' : item.blocked ? 'qr.simple.blockedTitle'
        : !report ? qr ? 'qr.simple.ready' : 'destination.ready' : warning ? 'qr.simple.warning'
          : report.status === 'resolved' ? 'qr.simple.checked' : 'qr.unresolved';
      const next = item.blocked ? 'qr.simple.blocked' : !report ? 'qr.simple.before'
        : warning ? 'qr.simple.avoid' : report.status === 'resolved' ? 'qr.simple.confirm' : 'qr.simple.tryLater';
      return <div className="qr-link-report" key={item.url} aria-busy={pending === item.url}>
        <div className="qr-simple-result" role="status">
          <strong className="qr-takeaway">{t(title)}</strong>
          <p className="qr-website"><span>{t(report?.status === 'resolved' ? 'qr.simple.destination' : 'qr.simple.startsAt')}</span>
            <b>{destination}</b></p>
          <p>{t(next)}</p>
          {report?.status === 'unresolved' && report.priorWarningChain?.length > 0 && <p>{t('qr.simple.earlierWarning')}</p>}
        </div>
        {!item.blocked && <div className="qr-check-action">
          {!report && <p className="qr-sharing-note">{t('qr.simple.sharing')}</p>}
          <button className="result-secondary-button" type="button" disabled={!isOnline || Boolean(pending)}
            onClick={() => check(item.url)}>{t(pending === item.url ? 'qr.checking' : report ? 'qr.retry' : 'qr.check')}</button>
          {!isOnline && <p role="status">{t('qr.offline')}</p>}
        </div>}
        <details className="qr-check-details">
          <summary>{t('qr.simple.details')}</summary>
          <div className="qr-details-body">
            <p className="qr-url-type">{t(item.urlType === 'shortened' ? 'qr.shortened' : 'qr.web')}
              {report?.status === 'resolved' && ` - ${t(report.redirectCount ? 'qr.redirected' : 'qr.direct')}`}</p>
            <p><strong>{t(qr ? 'qr.original' : 'destination.original')}</strong><code>{item.originalValue}</code></p>
            <p>{t('qr.domain')}: <code>{item.domain}</code></p>
            <p>{t(qr ? 'qr.privacy' : 'destination.privacy')}</p>
            {item.blocked && <p>{t('qr.reason.blocked_target')}</p>}
            {report && <div className="qr-resolution">
              <strong>{t(report.status === 'resolved' ? 'qr.resolved' : 'qr.unresolved')}</strong>
              {report.reason && <p>{t(`qr.reason.${report.reason}`)}</p>}
              <p>{t('qr.redirectCount')}: {report.redirectCount}</p>
              <ol className="qr-hop-list">{report.chain.map((row, hop) => <li key={`${hop}-${row.url}`}>
                <code>{row.url}</code><span>{t('qr.domain')}: {row.domain}</span>
                <span>{row.visited ? `HTTP ${row.httpStatus}` : t('qr.notVisited')}</span>
                {row.indicators.length > 0 && <ul>{row.indicators.map((indicator, i) => <li key={`${indicator.id}-${i}`}>
                  {getSignalLabel(indicator, t)}
                  {indicator.evidence?.map((e, j) => <code key={j}>{e.text}</code>)}
                </li>)}</ul>}
              </li>)}</ol>
              {report.priorWarningChain?.length > 0 && <details className="qr-prior-warning"><summary>{t('qr.priorWarning')}</summary>
                {report.priorWarningChain.map(row => <div key={row.url}><code>{row.url}</code>
                  <ul>{row.indicators.map((indicator, i) => <li key={i}>{getSignalLabel(indicator, t)}</li>)}</ul></div>)}
              </details>}
              {report.finalDestination && <p><strong>{t('qr.final')}</strong><code>{report.finalDestination}</code></p>}
              <p>{t('qr.limitation')}</p>
            </div>}
          </div>
        </details>
      </div>;
    })}
  </section>;
}
