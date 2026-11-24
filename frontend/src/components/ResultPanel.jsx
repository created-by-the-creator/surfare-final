import { useEffect, useId, useRef, useState } from 'react';
import {
  Download,
  HelpCircle,
  Check,
  ChevronDown,
  FileText,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { ASSETS } from '../assets.js';
import { imageMetadataDetails } from '../engine/image-metadata-display.js';
import { hasImageAiClues, imageOriginSummary } from '../engine/image-ai.js';
import { localOutcome } from '../engine/result-presentation.js';
import { linkDescription } from '../engine/link-description.js';
import {
  getDisplaySignals,
  getSignalEvidenceItems,
  getSignalLabel,
  getSignalExplanation,
} from '../engine/signal-display.js';

const LEVEL_KEYS = {
  low: 'low',
  suspicious: 'suspicious',
  high: 'high',
  unknown: 'unknown',
};

function warningSummary(result, t) {
  const warningCount = getDisplaySignals(result).length;
  if (!warningCount)
    return result?.onlineNoKnownThreat
      ? t('result.summary.cleanUrl')
      : t('result.summary.none');
  const type = result.summaryKey === 'summary_online' ? 'online' : 'local';
  const number = warningCount === 1 ? 'one' : 'many';
  return t(`result.summary.${type}.${number}`, { count: warningCount });
}

function saveReport(result, t, includeContent) {
  const level = LEVEL_KEYS[result.level] ?? 'unknown';
  const signals = getDisplaySignals(result);
  const lines = [
    t('report.title'),
    t('report.result', { level: t(result.aiImageOnly ? result.summaryKey : localOutcome(result) ? `result.${localOutcome(result)}.title` : `result.${level}`) }),
    ...(result.aiImageOnly ? [
      result.imageMetadata?.summaryKey && t(result.imageMetadata.summaryKey),
      ...imageMetadataDetails(result.imageMetadata, t), imageOriginSummary(result.imageOrigin, t),
      result.imageOrigin?.limitationKey && t(result.imageOrigin.limitationKey),
      ...(result.imageOrigin?.observations || []), result.imageVisualNoteKey && t(result.imageVisualNoteKey),
      ...(result.imageOrigin?.nonClues?.length ? [t('result.imageOrigin.nonClueTitle'), ...result.imageOrigin.nonClues] : []),
    ].filter(Boolean) : [result.usedOnline && !signals.length ? t('result.summary.onlineOnly') : warningSummary(result, t)]),
    ...(result.matchedUrls || []).map(url => t('ask.addressMatch', { url })),
    '',
    t('report.warningSigns'),
    ...(signals.length
      ? signals.map((signal) => {
          const evidence = getSignalEvidenceItems(signal)
            .map((item) => item.text)
            .join(', ');
          return `- ${getSignalLabel(signal, t)}${evidence ? ` (${evidence})` : ''}`;
        })
      : [`- ${t('report.noWarnings')}`]),
    '',
    t('report.safeNextStep'),
    result.aiImageOnly ? t(hasImageAiClues(result) ? 'ask.next.aiImageClues' : 'ask.next.aiImageNone') : t(`result.advice.${level}`),
    '',
    t('report.created', { date: new Date().toLocaleString() }),
  ];
  if (includeContent && result.checkedText) {
    lines.push('', t('report.checkedContent'), result.checkedText);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'surfare-check-report.txt';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildHighlightSegments(text, result) {
  const source = String(text || '');
  const evidenceRanges = [];
  const signals = getDisplaySignals(result);

  function addEvidence(signal, evidence) {
    if (typeof evidence !== 'string' || evidence.length < 2) return;
    const needle = evidence.trim();
    if (!needle) return;
    const lowerSource = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    let start = 0;
    while (start <= source.length) {
      const index = lowerSource.indexOf(lowerNeedle, start);
      if (index < 0) break;
      evidenceRanges.push({ start: index, end: index + needle.length, signal });
      start = index + needle.length;
    }
  }

  signals.forEach((signal) => {
    const items = getSignalEvidenceItems(signal);
    if (!items.length) return;
    items.forEach((item) => {
      const offsetMatches =
        Number.isInteger(item.start) &&
        Number.isInteger(item.end) &&
        item.start >= 0 &&
        item.end > item.start &&
        item.end <= source.length &&
        source.slice(item.start, item.end).toLowerCase() === item.text.toLowerCase();
      if (offsetMatches) {
        evidenceRanges.push({ start: item.start, end: item.end, signal });
      } else {
        addEvidence(signal, item.text);
      }
    });
  });
  if (result?.matchedPhrase && !evidenceRanges.length) {
    addEvidence({ id: 'matched_phrase', title: 'Matched phrase' }, result.matchedPhrase);
  }

  if (!evidenceRanges.length) {
    return source ? [{ text: source, signals: [] }] : [];
  }

  evidenceRanges.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  evidenceRanges.forEach((range) => {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      if (!previous.signals.some((signal) => signal.id === range.signal.id)) {
        previous.signals.push(range.signal);
      }
      return;
    }
    merged.push({ start: range.start, end: range.end, signals: [range.signal] });
  });

  const segments = [];
  let cursor = 0;
  merged.forEach((range) => {
    if (range.start > cursor) {
      segments.push({ text: source.slice(cursor, range.start), signals: [] });
    }
    segments.push({
      text: source.slice(range.start, range.end),
      signals: range.signals,
    });
    cursor = range.end;
  });
  if (cursor < source.length) segments.push({ text: source.slice(cursor), signals: [] });
  return segments;
}

export default function ResultPanel({ status, result, errorKey, isOnline = true, t, onReset, onReviewText, onAskAboutResult, isAskOpen = false }) {
  const [includeContent, setIncludeContent] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [selectedSignals, setSelectedSignals] = useState([]);
  const titleId = useId();
  const reportPopoverId = useId();
  const reportPopoverRef = useRef(null);
  const previousStatus = useRef(status);
  const level = result ? (LEVEL_KEYS[result.level] ?? 'unknown') : 'low';
  const showResult = status === 'result' && result;
  const displaySignals = getDisplaySignals(result);
  const warningCount = displaySignals.length;
  const onlineOnly = Boolean(
    showResult && !warningCount && result?.signals?.some((signal) => signal.id === 'online_match'),
  );
  const onlineClean = Boolean(showResult && !warningCount && result?.onlineNoKnownThreat);
  const isUnknown = Boolean(showResult && level === 'unknown');
  const linkNeedsVerification = Boolean(isUnknown && result.linkInfo && !warningCount && !result.onlineNoKnownThreat);
  const unconfirmedContext = isUnknown && result.aiReview?.status !== 'completed' &&
    !result.unsupportedQr && !result.mediaInfo?.uncertainExtraction;
  const enoughText = (result?.checkedText?.trim().split(/\s+/).filter(Boolean).length || 0) >= 4;
  const noWarningToShow = Boolean(unconfirmedContext && !warningCount && enoughText);
  const weakSignalsToShow = Boolean(unconfirmedContext && warningCount);
  const isMetadataReview = Boolean(showResult && result?.imageMetadata);
  const isOriginReview = Boolean(showResult && result?.imageOrigin);
  const isImageReview = isMetadataReview || isOriginReview;
  const isSightengineReview = isOriginReview && result.imageOrigin.source === 'sightengine';
  const outcome = localOutcome(result);
  const metadataLabel = isMetadataReview ? t(result.imageMetadata.labelKey) : '';
  const originLabel = isOriginReview ? t(result.imageOrigin.labelKey) : '';
  const hasAiClues = hasImageAiClues(result);
  const nextTitleKey = isImageReview
    ? 'result.nextTitleAi'
    : level === 'low'
      ? 'result.nextTitleLow'
      : 'result.nextTitle';
  const safetyThreat = displaySignals.some(signal => ['violence', 'extortion', 'blackmail', 'intimidation', 'harassment'].includes(signal.id));
  const nextPointKeys = isImageReview
    ? hasAiClues ? ['result.nextPointAiClues1', 'result.nextPointAiClues2'] : ['result.nextPointAiNone2', 'result.nextPointAiNone3']
    : safetyThreat ? ['check.nextSafety']
    : ({
        low: ['result.nextPointLow1', 'result.nextPointLow2'],
        suspicious: ['result.nextPointSuspicious1', 'result.nextPointSuspicious2'],
        high: ['result.nextPointHigh1', 'result.nextPointHigh2', 'result.nextPointHigh3'],
        unknown: result?.linkInfo ? ['linkInfo.next', 'result.nextPointLow2'] : outcome ? ['result.nextPointLocalVerify', 'result.nextPointLocalContext'] : result?.mediaInfo?.uncertainExtraction
          ? ['result.nextPointUnknownImage', 'result.nextPointUnknownVerify']
          : ['result.nextPointUnknownMore', 'result.nextPointUnknownVerify'],
      })[level];

  useEffect(() => {
    if (status === 'result' && ['analyzing', 'reviewing'].includes(previousStatus.current)) {
      const title = document.getElementById(titleId);
      title?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 1100px)').matches) title?.closest('.result-panel')?.scrollIntoView({ block: 'start' });
    }
    previousStatus.current = status;
  }, [status, titleId]);

  useEffect(() => {
    setIncludeContent(false);
    setIsReportOpen(false);
    setSelectedSignals([]);
  }, [result]);

  useEffect(() => {
    if (!isReportOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!reportPopoverRef.current?.contains(event.target)) setIsReportOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsReportOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isReportOpen]);

  const stateTitle = showResult
    ? isImageReview
      ? t(result.summaryKey || 'result.imageOrigin.unclear')
      : t(linkNeedsVerification ? 'linkInfo.unverifiedTitle' : outcome ? `result.${outcome}.title` : `result.${level}`)
    : status === 'analyzing'
      ? t('result.loading')
      : status === 'error'
        ? t('result.error')
        : t('result.ready');
  const summary = showResult
    ? linkNeedsVerification ? t('linkInfo.unverifiedSummary') : isSightengineReview
      ? t(result.imageOrigin.summaryKey)
      : isImageReview && result.imageVisualNoteKey && !isOriginReview
        ? t(result.imageVisualNoteKey)
      : isMetadataReview && isOriginReview
      ? t('result.imageReview.summaryVisual', { visual: originLabel })
      : isImageReview
        ? isOriginReview
          ? t('result.imageReview.summaryVisual', { visual: originLabel })
          : t('result.imageReview.summaryFileOnly', { file: metadataLabel })
        : isUnknown
      ? t(outcome ? `result.${outcome}.summary` : weakSignalsToShow ? 'result.unknown.withSignals' : 'result.unknown.subtitle')
      : onlineOnly
        ? t('result.summary.onlineOnly')
        : warningCount
          ? warningSummary(result, t)
          : onlineClean
            ? t('result.summary.cleanUrl')
            : t('result.summary.none')
    : status === 'error'
      ? t(errorKey || 'error.analysis')
      : status === 'analyzing'
        ? t('result.loading')
        : t('result.ready.subtitle');
  const meterLabel = showResult
    ? isUnknown
      ? t('result.meter.unknown')
      : t(`result.meter.${level}`)
    : t('result.ready');

  if (status === 'analyzing' || status === 'reviewing') {
    const reviewing = status === 'reviewing';
    return (
      <div className="result-column">
        <section className="result-panel check-progress" aria-labelledby={titleId}>
          <div className="result-cap"><h2>{t('check.inProgress')}</h2></div>
          <div className="check-progress-body" role="status">
            <span className="progress-icon"><LoaderCircle aria-hidden="true" /></span>
            <h3 id={titleId}>{t(reviewing ? result?.aiImageOnly ? 'result.sightengine.pending' : 'check.progress.ai' : 'result.loading')}</h3>
            <p>{t(reviewing ? 'check.progress.wait' : 'check.progress.local')}</p>
            {reviewing && <div className="progress-finished"><Check aria-hidden="true" />{t('check.progress.finished')}</div>}
            {reviewing && result?.aiImageOnly && result.imageMetadata && (
              <section className="image-local-progress" aria-label={t('result.imageMetadata.title')}>
                <strong>{t('result.sightengine.localComplete')}</strong>
                <p>{t(result.imageMetadata.summaryKey || result.imageMetadata.labelKey)}</p>
                {imageMetadataDetails(result.imageMetadata, t).length > 0 && <ul>{imageMetadataDetails(result.imageMetadata, t).map(note => <li key={note}>{note}</li>)}</ul>}
              </section>
            )}
            {reviewing && result?.level === 'high' && <p className="progress-caution">{t('check.progress.caution')}</p>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="result-column">
      <section
        className={`result-panel result-${showResult ? level : status === 'edited' ? 'idle' : status}`}
        aria-labelledby={titleId}
        aria-live="polite"
        aria-busy={['analyzing', 'reviewing'].includes(status)}
      >
        <div className="result-content">
          <div className="result-cap"><h2>{t('result.title')}</h2></div>
          <div className="result-body">
            <div className={`result-heading ${showResult ? `result-heading-${level}` : 'result-heading-idle'}`}>
              {showResult ? (
                <div className={`result-state-tile tile-${level}`}>
                  {level === 'low' && <ShieldCheck aria-hidden="true" />}
                  {level === 'suspicious' && <img src={ASSETS.iconWarning} alt="" />}
                  {level === 'high' && <img src={ASSETS.iconAlert} alt="" />}
                  {level === 'unknown' && <HelpCircle aria-hidden="true" />}
                </div>
              ) : (
                <span className="result-ready-icon" aria-hidden="true"><ShieldCheck /></span>
              )}
              <div className="result-title-copy">
                <h3 id={titleId} className="result-state-title" tabIndex={-1}>{stateTitle}</h3>
                <p className="result-prompt">{summary}</p>
              </div>
            </div>

            {showResult && result.linkInfo && <section className="result-link-info" aria-label={t('linkInfo.title')}>
              <span>{t(`linkInfo.type.${result.linkInfo.type}`)}</span>
              <p>{linkDescription(result.linkInfo, t)}</p>
              {result.linkInfo.embeddedHosts.length > 0 && <p className="link-info-forward">{t('linkInfo.embedded', { host: result.linkInfo.embeddedHosts.join(', ') })}</p>}
              <small>{t('linkInfo.addressOnly')}</small>
            </section>}

            {showResult && !isUnknown && (
              <div className={`risk-meter-wrap meter-position-${level}`}>
                <div
                  className="risk-meter has-risk-result"
                  role="img"
                  aria-label={`${t('result.riskLevel')}: ${meterLabel}`}
                >
                  <span className="meter-segment meter-segment-low" />
                  <span className="meter-segment meter-segment-suspicious" />
                  <span className="meter-segment meter-segment-high" />
                  <span className="meter-indicator" aria-hidden="true" />
                </div>
                <div className="risk-meter-labels" aria-hidden="true">
                  <span className={level === 'low' ? 'is-active' : ''}>{t('result.meter.low')}</span>
                  <span className={level === 'suspicious' ? 'is-active' : ''}>{t('result.meter.suspicious')}</span>
                  <span className={level === 'high' ? 'is-active' : ''}>{t('result.meter.high')}</span>
                </div>
              </div>
            )}
            {showResult && result.imageVisualNoteKey && !isImageReview && (
              <p className="image-origin-status" role="status">
                {t(result.imageVisualNoteKey)}
              </p>
            )}
            {showResult && result.aiReview?.status === 'unavailable' && (
              <p className="image-origin-status" role="status">{t(`ask.review.${result.aiReview.status}`)}</p>
            )}
            {showResult && !isOnline && (
              <p className="image-origin-status" role="status">{t('result.offlineNotice')}</p>
            )}
            {showResult && result.mediaInfo?.text && !isImageReview && (
              <div className="image-origin-status">
                {result.mediaInfo.uncertainExtraction && <p>{t('result.ocrUncertain')}</p>}
                {status === 'result' && <button type="button" className="result-secondary-button" onClick={onReviewText}>
                  {t('result.reviewText')}
                </button>}
              </div>
            )}
            {showResult && result.unsupportedQr && <p className="image-origin-status">{t('result.qrUnsupported')}</p>}
            {showResult && result.semanticConflict && <p className="image-origin-status">{t('result.conflictingReviews')}</p>}
            {showResult && result.onlineUnavailable && <p className="image-origin-status">{t('result.reputationIncomplete')}</p>}
            {showResult && result.matchedUrls?.map(url => <p className="image-origin-status" key={url}>{t('ask.addressMatch', { url })}</p>)}
            {isOriginReview && hasImageAiClues({ imageMetadata: result.imageMetadata }) && (
              <p className="image-file-clue">{t('result.imageSimple.fileAi')}</p>
            )}
                {showResult && !isImageReview && (
                  <details className="checked-reading">
                    <summary>
                      <FileText aria-hidden="true" /><span>{t('result.viewChecked')}</span><ChevronDown aria-hidden="true" />
                    </summary>
                    <div className="checked-reading-body">
                      {warningCount > 0 && <p className="checked-hint">{t('check.highlightHint')}</p>}
                      <div className="checked-reading-text">
                        {buildHighlightSegments(result.checkedText || t('result.insufficient'), result).map((segment, index) =>
                          segment.signals.length ? (
                            <button
                              type="button"
                              className="checked-highlight"
                              key={`${segment.text}-${index}`}
                              onClick={() => setSelectedSignals(segment.signals)}
                              aria-label={`${t('result.whyFlagged')}: ${segment.text}`}
                            >
                              {segment.text}
                            </button>
                          ) : (
                            <span key={`${segment.text}-${index}`}>{segment.text}</span>
                          ),
                        )}
                      </div>
                        {selectedSignals.length > 0 && (
                          <div className="highlight-explanation" role="region" aria-label={t('result.whyFlagged')}>
                            <strong>{t('result.whyFlagged')}</strong>

                            <p>{[...new Set(selectedSignals.map(signal => getSignalLabel(signal, t)))].join(' ')}</p>
                            {[...new Set(selectedSignals.map(signal => getSignalExplanation(signal, t)).filter(Boolean))]
                              .map(help => <p key={help}>{help}</p>)}
                          </div>
                        )}
                      </div>
                  </details>
                )}

            {isImageReview && <details className="image-check-details" key={`${result.imageVisualStatus}-${result.summaryKey}`}>
              <summary><FileText size={18} aria-hidden="true" />{t('result.imageSimple.details')}<ChevronDown size={17} aria-hidden="true" /></summary>
              <div className="image-check-details-body">
            {isOriginReview && (
              <section className="image-origin-report" role="region" aria-label={t(result.imageOrigin.source === 'sightengine' ? 'result.sightengine.title' : 'result.imageOrigin.title')}>
                <div className="image-report-head">
                  <strong>{t(result.imageOrigin.source === 'sightengine' ? 'result.sightengine.title' : 'result.imageOrigin.title')}</strong>
                  <span>{t(result.imageOrigin.labelKey)}</span>
                </div>
                {imageOriginSummary(result.imageOrigin, t) && <p>{imageOriginSummary(result.imageOrigin, t)}</p>}
                {result.imageOrigin.source === 'sightengine' && (
                  <div className="sightengine-score">
                    <label htmlFor={`${titleId}-ai-score`}>{t('result.sightengine.scoreLabel')}</label>
                    <meter id={`${titleId}-ai-score`} min="0" max="1" value={result.imageOrigin.score}>{result.imageOrigin.score.toFixed(3)}</meter>
                    <p>{t('result.sightengine.scoreHelp')}</p>
                  </div>
                )}
                {result.imageOrigin.reviewDisagreement && <p className="image-origin-limitation">{t('result.imageReview.disagree')}</p>}
                {result.imageOrigin.source !== 'sightengine' && <div className="image-evidence">
                  <h4>{t('result.imageOrigin.evidenceTitle')}</h4>
                  {result.imageOrigin.observations.length > 0 ? (
                    <ul>
                      {result.imageOrigin.observations.map((observation, index) => (
                        <li key={`${observation}-${index}`}>
                          {observation}
                          {result.imageOrigin.ambiguousObservations?.includes(observation) && <span className="image-observation-note">{t('result.imageOrigin.ambiguousNote')}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t('result.imageOrigin.noObservations')}</p>
                  )}
                </div>}
                {result.imageOrigin.nonClues?.length > 0 && (
                  <div className="image-evidence image-non-clues">
                    <h4>{t('result.imageOrigin.nonClueTitle')}</h4>
                    <ul>
                      {result.imageOrigin.nonClues.map((note, index) => (
                        <li key={`${note}-${index}`}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="image-origin-limitation">{t(result.imageOrigin.limitationKey)}</p>
              </section>
            )}

            {isMetadataReview && (
              <section className="image-origin-report image-metadata-report" role="region" aria-label={t('result.imageMetadata.title')}>
                <div className="image-report-head">
                  <strong>{t('result.imageMetadata.title')}</strong>
                </div>
                <p>{t(result.imageMetadata.summaryKey)}</p>
                {imageMetadataDetails(result.imageMetadata, t).length > 0 && (
                  <ul>{imageMetadataDetails(result.imageMetadata, t).map((detail) => <li key={detail}>{detail}</li>)}</ul>
                )}
                <p className="image-origin-limitation">{t(result.imageMetadata.limitationKey)}</p>
              </section>
            )}
              </div>
            </details>}

            {showResult && (
              <div className={`result-details ${isUnknown ? 'result-details-unknown' : ''}`}>
                {!isImageReview && warningCount > 0 && (
                  <section className="result-reasons" aria-label={t('report.warningSigns')}>
                    <h4>{t('report.warningSigns')}</h4>
                    <ul>{displaySignals.slice(0, 3).map((signal, index) => (
                      <li key={`${signal.id}-${index}`}>
                        <strong>{getSignalLabel(signal, t)}</strong>
                        <span>{getSignalEvidenceItems(signal)[0].text}</span>
                      </li>
                    ))}</ul>
                  </section>
                )}
                {isImageReview ? <p className="image-simple-next">{t('result.imageSimple.next')}</p> : <section className="result-next">
                  <h3><ListChecks aria-hidden="true" />{t(nextTitleKey)}</h3>
                  <ul>{nextPointKeys.map(key => (
                    <li key={key}>{t(key)}</li>
                  ))}</ul>
                </section>}
              </div>
            )}
          </div>

          <footer className="result-footer">
            <span className="result-team"><ShieldCheck aria-hidden="true" />{t('result.team')}</span>
            {showResult && <div className="report-control" ref={reportPopoverRef}>
              {isReportOpen && showResult && (
                <div className="result-save-popover" id={reportPopoverId} role="dialog" aria-label={t('result.saveReport')}>
                  <label>
                    <input
                      type="checkbox"
                      checked={includeContent}
                      onChange={(event) => setIncludeContent(event.target.checked)}
                    />
                    {t('result.includeContent')}
                  </label>
                  <button type="button" onClick={() => {
                    saveReport(result, t, includeContent);
                    setIsReportOpen(false);
                  }}>
                    <Download aria-hidden="true" />
                    {t('result.download')}
                  </button>
                </div>
              )}
              <button
                className="result-save-button"
                type="button"
                disabled={!showResult}
                aria-expanded={isReportOpen}
                aria-controls={reportPopoverId}
                onClick={() => setIsReportOpen((open) => !open)}
              >
                <Download aria-hidden="true" />
                {t('result.saveReport')}
              </button>
            </div>}
          </footer>
            {showResult && onAskAboutResult && (
              <div className="result-surfy-help">
                <p>{t('result.askHelp')}</p>
                <button className="result-ask-button" type="button" onClick={onAskAboutResult} aria-expanded={isAskOpen} aria-controls={isAskOpen ? 'ask-surfy' : undefined}>
                  <MessageSquareText size={20} aria-hidden="true" />{t('check.askAboutResult')}
                </button>
              </div>
            )}

        </div>
      </section>
    </div>
  );
}
