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
            <p><strong>{t(qr ? 'qr.original' : 'destination.original')}</strong><code>{item.originalValue}</code></p>
            {report?.finalDestination && report.finalDestination !== item.originalValue &&
              <p><strong>{t('qr.final')}</strong><code>{report.finalDestination}</code></p>}
            {report && <div className="qr-resolution">
              {report.reason && <p>{t(`qr.reason.${report.reason}`)}</p>}
              {(() => {
                const warnings = [...new Map([
                  ...report.chain.flatMap(row => row.indicators),
                  ...(report.priorWarningChain || []).flatMap(row => row.indicators),
                ].map(indicator => [indicator.id, indicator])).values()];
                return warnings.length > 0 && <ul className="qr-warning-list">{warnings.slice(0, 3).map(indicator => {
                  const key = `signal.${indicator.id}.short`;
                  const short = t(key);
                  return <li key={indicator.id}>{short && short !== key && short !== t('fallback.missing')
                    ? short : getSignalLabel(indicator, t)}</li>;
                })}</ul>;
              })()}
              <p>{t('qr.limitation')}</p>
            </div>}

          </div>
        </details>
      </div>;
    })}
  </section>;
}
