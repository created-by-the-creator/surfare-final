import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, ChevronDown, Download, ExternalLink, LifeBuoy, MessageCircle, Phone, ShieldCheck, Wallet, X } from 'lucide-react';
import { ASSETS } from '../assets.js';
import { CONTACTS, CONTACTS_REVIEWED, SITUATIONS, buildRecoveryPlan, recoverySummary, toggleSituation } from '../recovery/plan.js';
import RecoveryChat from './RecoveryChat.jsx';
import './RecoveryHelp.css';

function ContactCard({ id, t }) {
  const contact = CONTACTS[id];
  return <article className={`recovery-contact${id === 'emergency' ? ' is-urgent' : ''}`}>
    <strong>{id === 'bank' ? t(contact.name) : contact.name}</strong>
    <p>{t(`recovery.contact.${contact.note}`)}</p>
    <div>
      {contact.tel && <a className="recovery-call" href={`tel:${contact.tel}`}><Phone size={17} aria-hidden="true" />{t('recovery.call')} {contact.phone}</a>}
      <a href={contact.url} target="_blank" rel="noopener noreferrer">{t(id === 'bank' ? 'recovery.findProvider' : 'recovery.officialHelp')}<ExternalLink size={15} aria-hidden="true" /></a>
    </div>
  </article>;
}

const START_CHOICES = [['paid', Wallet], ['shared', ShieldCheck], ['unsure', LifeBuoy]];
const MORE_CHOICES = ['clicked', 'downloaded', 'threatened'];

export function RecoveryDialog({ onClose, t, lang = 'en', isOnline = navigator.onLine }) {
  const id = useId();
  const dialogRef = useRef(null), headingRef = useRef(null), chatTrigger = useRef(null);
  const previousChat = useRef(false);
  const [situations, setSituations] = useState([]), [country, setCountry] = useState('PH');
  const [providerName, setProviderName] = useState(''), [countryName, setCountryName] = useState('');
  const [screen, setScreen] = useState('choose'), [completed, setCompleted] = useState([]);
  const [index, setIndex] = useState(0), [chatOpen, setChatOpen] = useState(false);
  const provider = /\bgcash\b/i.test(providerName) ? 'gcash' : /\bmaya\b/i.test(providerName) ? 'maya'
    : /bank|\bbpi\b|\bbdo\b|\brcbc\b|\bpnb\b|\bub\b|\bsecurity\b|\bcimb\b|\bgotyme\b|\btonik\b/i.test(providerName) ? 'bank' : providerName.trim() ? 'account' : 'unknown';
  const plan = buildRecoveryPlan({ situations, provider, country });
  const stepIndex = Math.min(index, Math.max(0, plan.steps.length - 1));
  const step = plan.steps[stepIndex];
  const done = completed.filter(item => plan.steps.includes(item)).length;
  const paymentContact = ['gcash', 'maya'].includes(provider) ? provider : 'bank';

  useEffect(() => {
    const dialog = dialogRef.current, previous = document.activeElement, overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    dialogRef.current?.scrollTo({ top: 0 });
    if (chatOpen) dialogRef.current?.querySelector('.ask-brand h2')?.focus({ preventScroll: true });
    else if (previousChat.current) chatTrigger.current?.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
    previousChat.current = chatOpen;
  }, [screen, chatOpen, step]);

  const start = situation => { setSituations([situation]); setCompleted([]); setIndex(0); setScreen('plan'); };
  const advance = complete => {
    if (complete) setCompleted(current => current.includes(step) ? current : [...current, step]);
    if (stepIndex + 1 < plan.steps.length) setIndex(stepIndex + 1);
    else setScreen('done');
  };
  const download = () => {
    const body = recoverySummary({ situations, provider, providerName, country, countryName, completed, plan, t });
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'surfy-lifeguard-checklist.txt'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return createPortal(<dialog ref={dialogRef} className={`recovery-dialog${chatOpen ? ' is-chat' : ''}`} aria-labelledby={`${id}-label`} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="recovery-header"><span id={`${id}-label`}><LifeBuoy size={21} aria-hidden="true" />{t('recovery.label')}</span><button type="button" onClick={onClose} aria-label={t('recovery.close')}><X size={20} /></button></header>
    <div className="recovery-shell">
      <div className="recovery-body" hidden={chatOpen}>
        <div className="recovery-intro">
          <img src={ASSETS.surfyLifeguard} alt="" width="640" height="960" decoding="async" />
          <div><p className="recovery-eyebrow">{t('recovery.simple.eyebrow')}</p><h2 ref={screen === 'plan' ? null : headingRef} tabIndex={-1}>{t(screen === 'choose' ? 'recovery.simple.title' : screen === 'done' ? 'recovery.simple.doneTitle' : 'recovery.simple.guideTitle')}</h2><p>{t(screen === 'choose' ? 'recovery.simple.intro' : screen === 'done' ? 'recovery.simple.doneIntro' : 'recovery.simple.guideIntro')}</p></div>
        </div>
        {screen === 'choose' ? <>
          <div className="recovery-start-choices" role="group" aria-label={t('recovery.what')}>
            {START_CHOICES.map(([item, Icon]) => <button key={item} type="button" className="recovery-start-choice" onClick={() => start(item)}><Icon size={22} aria-hidden="true" /><span>{t(`recovery.simple.choice.${item}`)}</span></button>)}
          </div>
          <details className="recovery-disclosure recovery-other"><summary>{t('recovery.simple.other')}<ChevronDown size={17} aria-hidden="true" /></summary><div className="recovery-other-choices">{MORE_CHOICES.map(item => <button key={item} type="button" onClick={() => start(item)}>{t(`recovery.situation.${item}`)}</button>)}</div></details>
        </> : screen === 'plan' ? <>
          <div className="recovery-progress"><span>{t('recovery.simple.stepCount', { current: stepIndex + 1, total: plan.steps.length })}</span><progress value={stepIndex + 1} max={plan.steps.length} aria-label={t('recovery.simple.progress')} /></div>
          <section className="recovery-action-card" aria-labelledby={`${id}-action`}>
            <span className="recovery-action-label">{t(stepIndex === 0 ? 'recovery.simple.first' : 'recovery.simple.next')}</span>
            <h3 id={`${id}-action`} ref={headingRef} tabIndex={-1}>{t(`recovery.step.${step}.title`)}</h3>
            <p>{t(`recovery.simple.step.${step}`)}</p>
            {step === 'payment' && <p className="recovery-reassurance">{t('recovery.simple.trustedPerson')}</p>}
            {step === 'safety' && (country === 'PH' ? <ContactCard id="emergency" t={t} /> : <p className="recovery-outside">{t('recovery.outside')}</p>)}
            {['payment', 'account'].includes(step) && <details className="recovery-disclosure recovery-provider-help"><summary>{t('recovery.simple.findSupport')}<ChevronDown size={17} aria-hidden="true" /></summary>
              {country === 'PH' ? <>
                <p>{t('recovery.simple.whichProvider')}</p>
                <div className="recovery-provider-choices" role="group" aria-label={t('recovery.provider')}>{[['GCash', 'GCash'], ['Maya', 'Maya'], ['other', t('recovery.simple.otherProvider')]].map(([value, label]) => <button key={value} type="button" aria-pressed={providerName === value} onClick={() => setProviderName(value)}>{label}</button>)}</div>
                {providerName && (provider === 'account' ? <p>{t('recovery.simple.foreignSupport')}</p> : <ContactCard id={paymentContact} t={t} />)}
              </> : <p>{t('recovery.simple.foreignSupport')}</p>}
            </details>}
            {step === 'report' && country === 'PH' && plan.contacts.includes('cicc') && <details className="recovery-disclosure"><summary>{t('recovery.simple.reportingHelp')}<ChevronDown size={17} aria-hidden="true" /></summary><ContactCard id="cicc" t={t} /></details>}
            <div className="recovery-step-actions"><button className="recovery-primary" type="button" onClick={() => advance(true)}><Check size={19} aria-hidden="true" />{t('recovery.simple.doneAction')}</button><button className="recovery-later" type="button" onClick={() => advance(false)}>{t('recovery.simple.later')}</button></div>
          </section>
          {stepIndex > 0 && <button type="button" className="recovery-back" onClick={() => setIndex(stepIndex - 1)}>{t('recovery.simple.previous')}</button>}
          <details className="recovery-disclosure recovery-adjust"><summary>{t('recovery.simple.also')}<ChevronDown size={17} aria-hidden="true" /></summary><div className="recovery-extra-situations">{SITUATIONS.filter(item => !['danger', 'unsure'].includes(item)).map(item => <label key={item}><input type="checkbox" checked={situations.includes(item)} onChange={() => { setSituations(current => { const next = toggleSituation(current, item); return next.length ? next : ['unsure']; }); setIndex(0); }} /><span>{t(`recovery.situation.${item}`)}</span></label>)}</div><button type="button" className="recovery-text-button" onClick={() => setScreen('choose')}>{t('recovery.edit')}</button></details>
        </> : <section className="recovery-finish">
          <CheckCircle2 size={30} aria-hidden="true" /><p>{t('recovery.simple.completedCount', { done, total: plan.steps.length })}</p>
          <button type="button" className="recovery-primary" onClick={download}><Download size={18} aria-hidden="true" />{t('recovery.download')}</button>
          <details className="recovery-disclosure recovery-summary"><summary>{t('recovery.simple.review')}<ChevronDown size={17} aria-hidden="true" /></summary><ol>{plan.steps.map((item, i) => <li key={item}><span>{completed.includes(item) && <Check size={16} aria-label={t('recovery.completed')} />}{t(`recovery.step.${item}.title`)}</span><button type="button" onClick={() => { setIndex(i); setScreen('plan'); }}>{t('recovery.simple.revisit')}</button></li>)}</ol></details>
          <p className="recovery-limit">{t('recovery.limit')}</p>
          <button type="button" className="recovery-text-button" onClick={() => setScreen('choose')}>{t('recovery.edit')}</button>
        </section>}
        <div className="recovery-quiet-help"><button type="button" className="recovery-chat-jump" ref={chatTrigger} onClick={() => setChatOpen(true)} aria-expanded={chatOpen} aria-controls="lifeguard-surfy"><span className="recovery-chat-icon"><MessageCircle size={24} aria-hidden="true" /></span><span><strong>{t('recovery.simple.ask')}</strong><span>{t('recovery.chat.entryHint')}</span></span></button></div>
        <footer className="recovery-footer">
          <details className="recovery-disclosure recovery-settings"><summary>{t(country === 'PH' ? 'recovery.simple.region' : 'recovery.otherCountry')}<ChevronDown size={15} aria-hidden="true" /></summary><div className="recovery-context-fields">
            <label className="recovery-select" htmlFor={`${id}-country`}>{t('recovery.country')}<select id={`${id}-country`} value={country} onChange={event => setCountry(event.target.value)}><option value="PH">{t('recovery.ph')}</option><option value="other">{t('recovery.otherCountry')}</option></select></label>
            {country === 'other' && <label className="recovery-select">{t('recovery.countryName')}<input value={countryName} maxLength={80} onChange={event => setCountryName(event.target.value)} autoComplete="country-name" /></label>}
            <label className="recovery-select">{t('recovery.provider')}<input value={providerName} maxLength={100} placeholder={t('recovery.providerHint')} onChange={event => setProviderName(event.target.value)} /></label><p>{t('recovery.providerOptional')}</p>
          </div></details>
          <button type="button" className="recovery-danger" onClick={() => { setSituations(current => [...current.filter(item => !['danger', 'unsure'].includes(item)), 'danger']); setIndex(0); setScreen('plan'); }}>{t('recovery.simple.danger')}</button>
        </footer>
        <p className="recovery-local-note">{t('recovery.simple.local')}</p>
        {screen !== 'choose' && <p className="recovery-review">{t('recovery.reviewed')}: {CONTACTS_REVIEWED}</p>}
      </div>
      <RecoveryChat isOpen={chatOpen} onClose={() => setChatOpen(false)} t={t} lang={lang} isOnline={isOnline} situations={situations} provider={provider} providerName={providerName} country={country} countryName={countryName} />
    </div>
  </dialog>, document.body);
}

export default function RecoveryHelp({ isOpen, onOpen, onClose, t, lang, isOnline, compact = false }) {
  return <><section id="recovery" className={`recovery-launcher${compact ? ' is-compact' : ' page-container'}`} aria-label={t('recovery.label')}><LifeBuoy size={25} aria-hidden="true" /><div><h2>{t('recovery.launchTitle')}</h2><p>{t('recovery.launchBody')}</p></div><button type="button" onClick={onOpen}>{t('recovery.open')}</button></section>{isOpen && <RecoveryDialog onClose={onClose} t={t} lang={lang} isOnline={isOnline} />}</>;
}
