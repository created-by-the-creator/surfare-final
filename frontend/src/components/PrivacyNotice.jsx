import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, X } from 'lucide-react';
import { usePrivacyNotice } from '../privacy/PrivacyContext.jsx';
import './PrivacyNotice.css';

const SECTIONS = ['purpose', 'sharing', 'ai', 'retention', 'security', 'rights', 'terms'];
const REFERENCES = [
  ['Republic Act No. 10173', 'https://privacy.gov.ph/data-privacy-act/'],
  ['National Privacy Commission', 'https://privacy.gov.ph/data-subject-rights/'],
  ['OpenRouter', 'https://openrouter.ai/privacy'],
  ['Sightengine', 'https://sightengine.com/policies/privacy'],
  ['Google', 'https://policies.google.com/privacy'],
  ['EmailJS', 'https://www.emailjs.com/legal/privacy-policy/'],
];

export default function PrivacyNotice({ t, reduced }) {
  const { hasAcknowledged, finishNotice, resetAcknowledgment } = usePrivacyNotice();
  const [checked, setChecked] = useState(false);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const [progress, setProgress] = useState(0);
  const [closing, setClosing] = useState(null);
  const dialogRef = useRef(null);
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const id = useId();
  const canContinue = hasReachedEnd && checked && !closing;
  const operator = import.meta.env.VITE_PRIVACY_OPERATOR?.trim();
  const email = import.meta.env.VITE_PRIVACY_EMAIL?.trim();

  const updateScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = Math.max(0, element.scrollHeight - element.clientHeight);
    setProgress(distance <= 1 ? 100 : Math.min(100, element.scrollTop / distance * 100));
    if (distance <= 1 || element.scrollTop >= distance - 3) setHasReachedEnd(true);
  }, []);

  useEffect(() => {
    updateScroll();
    const observer = new ResizeObserver(updateScroll);
    observer.observe(scrollRef.current);
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [updateScroll]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector('h2')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!closing) return undefined;
    const timer = window.setTimeout(() => {
      if (closing === 'reset') resetAcknowledgment();
      else finishNotice(closing === 'accept');
    }, reduced ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [closing, reduced, finishNotice, resetAcknowledgment]);

  const dismiss = () => { if (!closing) setClosing('decline'); };

  return (
    <dialog className={`privacy-notice${closing ? ' is-closing' : ''}`} ref={dialogRef}
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"], a[href]')]
          .filter(element => element.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}>
        <form className="notice-main" onSubmit={(event) => {
          event.preventDefault();
          if (canContinue) setClosing('accept');
        }}>
          <header className="notice-header">
            <div className="notice-topline">
              <span className="notice-wordmark">Surfare<span aria-hidden="true">.</span></span>
              <button className="notice-close" type="button" onClick={dismiss} aria-label={t('notice.notNow')} disabled={Boolean(closing)}><X size={19} /></button>
            </div>
            <p className="notice-eyebrow">{t('notice.eyebrow')}</p>
            <h2 id={`${id}-title`} tabIndex={-1}>{t('notice.title')}</h2>
            <p className="notice-description" id={`${id}-description`}>{t('notice.description')}</p>
          </header>
          <div className="notice-reading-track" aria-hidden="true"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>

          <div className="notice-scroll" ref={scrollRef} onScroll={updateScroll} tabIndex={0} role="region" aria-label={t('notice.readPolicy')}>
            <div ref={contentRef} className="notice-content">
            <p className="notice-choice-callout">{t('notice.separateChoices')}</p>

              <div className="notice-policy-body">
                <p className="notice-updated">{t('notice.updated')}</p>
                {SECTIONS.map((section) => (
                  <section key={section}><h3>{t(`notice.policy.${section}.title`)}</h3><p>{t(`notice.policy.${section}.body`)}</p></section>
                ))}
                {(operator || email) && <section><h3>{t('notice.contact')}</h3>
                  {operator && <p>{operator}</p>}
                  {email && <a href={`mailto:${encodeURIComponent(email)}`}>{email}</a>}
                </section>}
                <nav className="notice-references" aria-label={t('notice.references')}>
                  <h3>{t('notice.references')}</h3>
                  {REFERENCES.map(([label, url]) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">{label}</a>)}
                </nav>
                {hasAcknowledged && <button className="notice-reset" type="button" onClick={() => setClosing('reset')} disabled={Boolean(closing)}>{t('notice.reset')}</button>}
              </div>
              <p className="notice-end-marker">{t('notice.endOfNotice')}</p>
            </div>
          </div>

          <footer className="notice-actions">
            <p className={`notice-scroll-hint${hasReachedEnd ? ' is-complete' : ''}`} id={`${id}-scroll-hint`} aria-live="polite">
              {hasReachedEnd ? <Check size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
              {t(hasReachedEnd ? 'notice.reachedEnd' : 'notice.scrollToContinue')}
            </p>
            <label className={`notice-final-ack${!hasReachedEnd ? ' is-locked' : ''}`}>
              <span className="notice-checkbox"><input type="checkbox" checked={checked} required
                disabled={!hasReachedEnd || Boolean(closing)} aria-describedby={`${id}-scroll-hint`}
                onChange={(event) => { if (hasReachedEnd) setChecked(event.target.checked); }} />
                <Check size={13} aria-hidden="true" /></span>
              <span>{t('notice.singleAcknowledgment')}</span>
            </label>
            <div className="notice-action-row">
              <button className="notice-decline" type="button" onClick={dismiss} disabled={Boolean(closing)}>{t('notice.notNow')}</button>
              <button className="notice-accept" type="submit" disabled={!canContinue} aria-describedby={`${id}-hint`}>
                {t('notice.agree')}<ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            <p className="notice-action-hint" id={`${id}-hint`} aria-live="polite">{t(checked && hasReachedEnd ? 'notice.ready' : 'notice.required')}</p>
          </footer>
        </form>
    </dialog>
  );
}
