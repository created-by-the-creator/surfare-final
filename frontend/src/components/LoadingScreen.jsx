import AnimatedMascot from './AnimatedMascot.jsx';
import { Check, Link2, ScanText, ShieldCheck, Sparkles } from 'lucide-react';
import { ASSETS } from '../assets.js';
import './LoadingScreen.css';

const STEP_ICONS = [ScanText, ShieldCheck, Sparkles];

export default function LoadingScreen({ status, result, t, titleId, detailOverride, hideLocalResult, children }) {
  const reviewing = status === 'reviewing';
  const destinationPending = Boolean(result?.destinationPending);
  const stage = reviewing ? 3 : destinationPending ? 2 : 1;

  const stepKeys = [
    'check.status.stepReading',
    destinationPending ? 'check.status.link' : 'check.status.stepSignals',
    'check.status.stepDouble',
  ];
  const focusKeys = stage === 1
    ? ['check.status.detailReading', 'check.status.detailSignals']
    : stage === 2
      ? ['destination.checkingBody', 'check.status.detailLinks']
      : ['check.status.detailDouble', 'check.status.detailFinish'];

  const title = destinationPending && !reviewing ? t('destination.checking')
    : reviewing ? t('check.progress.ai') : t('check.status.reading');
  const detail = detailOverride ?? (destinationPending && !reviewing
    ? t('destination.checkingBody')
    : reviewing ? t('check.progress.wait') : t('check.progress.local'));

  return (
    <div className={`loading-page check-progress progress-stage-${stage}`}>
      <div className="loading-page-inner">
        <section className="loading-main" role="status" aria-labelledby={titleId}>
          <div className="loading-avatar" aria-hidden="true">
            <span className="loading-ring" />
            <AnimatedMascot src={ASSETS.surfyMagnify} alt="" />
          </div>
          <p className="loading-eyebrow">{t('check.inProgress')}</p>
          <h2 id={titleId} tabIndex={-1}>{title}</h2>
          <p className="loading-detail">{detail}</p>

          <div
            className="loading-track"
            role="progressbar"
            aria-label={t('check.inProgress')}
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={stage}
          >
            <span />
          </div>

          <ol className="loading-steps">
            {stepKeys.map((key, index) => {
              const step = index + 1;
              const done = step < stage;
              const active = step === stage;
              const Icon = STEP_ICONS[index];
              return (
                <li key={key} className={`loading-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
                  <span className="loading-step-mark" aria-hidden="true">{done ? <Check size={14} /> : <Icon size={14} />}</span>
                  <span>{t(key)}</span>
                </li>
              );
            })}
          </ol>

          {reviewing && (
            <div className="loading-complete"><Check aria-hidden="true" size={16} />{t('check.progress.finished')}</div>
          )}
          {reviewing && result?.aiImageOnly && result.imageMetadata && (
            <p className="loading-note">{t('result.sightengine.localComplete')}</p>
          )}
          {reviewing && result?.level === 'high' && <p className="loading-caution">{t('check.progress.caution')}</p>}
        </section>

        <aside className="loading-info" aria-label={t('check.status.infoTitle')}>
          <p className="loading-info-eyebrow">{t('check.status.now')}</p>
          <h3>{t('check.status.infoTitle')}</h3>
          <ul>
            {focusKeys.map((key) => <li key={key}>{t(key)}</li>)}
          </ul>
          <p className="loading-info-hint">{t('check.status.hint')}</p>
          <p className="loading-info-safety"><ShieldCheck aria-hidden="true" size={17} />{t('check.status.tip')}</p>
          {destinationPending && <p className="loading-info-link"><Link2 aria-hidden="true" size={16} />{t('check.status.linkNote')}</p>}
        </aside>
      </div>
      {children && <div className={`loading-local-result${hideLocalResult ? ' is-hidden' : ''}`}>{children}</div>}
    </div>
  );
}
