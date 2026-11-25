import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Download, ExternalLink, LifeBuoy, MessageCircle, Phone, X } from 'lucide-react';
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
      {contact.tel && <a className="recovery-call" href={`tel:${contact.tel}`}><Phone size={16} aria-hidden="true" />{t('recovery.call')} {contact.phone}</a>}
      <a href={contact.url} target="_blank" rel="noopener noreferrer">{t(id === 'bank' ? 'recovery.findProvider' : 'recovery.officialHelp')}<ExternalLink size={14} aria-hidden="true" /></a>
      {contact.source !== contact.url && <a className="recovery-source" href={contact.source} target="_blank" rel="noopener noreferrer">{t('recovery.source')}</a>}
    </div>
  </article>;
}

export function RecoveryDialog({ onClose, t, lang = 'en', isOnline = navigator.onLine }) {
  const id = useId();
  const dialogRef = useRef(null), headingRef = useRef(null), chatTrigger = useRef(null);
  const previousChat = useRef(false);
  const [situations, setSituations] = useState([]), [country, setCountry] = useState('PH');
  const [providerName, setProviderName] = useState(''), [countryName, setCountryName] = useState('');
  const [screen, setScreen] = useState('choose'), [completed, setCompleted] = useState([]), [chatOpen, setChatOpen] = useState(false);
  const provider = /\bgcash\b/i.test(providerName) ? 'gcash' : /\bmaya\b/i.test(providerName) ? 'maya'
    : /bank|\bbpi\b|\bbdo\b|\brcbc\b|\bpnb\b|\bub\b|\bsecurity\b|\bcimb\b|\bgotyme\b|\btonik\b/i.test(providerName) ? 'bank' : providerName.trim() ? 'account' : 'unknown';
  const plan = buildRecoveryPlan({ situations, provider, country });
  const done = completed.filter(item => plan.steps.includes(item)).length;

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
  }, [screen, chatOpen]);

  const closeChat = () => setChatOpen(false);
  const download = () => {
    const body = recoverySummary({ situations, provider, providerName, country, countryName, completed, plan, t });
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'surfy-lifeguard-checklist.txt'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return createPortal(<dialog ref={dialogRef} className="recovery-dialog" aria-labelledby={`${id}-label`} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="recovery-header"><span id={`${id}-label`}><LifeBuoy size={21} aria-hidden="true" />{t('recovery.label')}</span><button type="button" onClick={onClose} aria-label={t('recovery.close')}><X size={20} /></button></header>
    <div className="recovery-shell">
      <div className="recovery-body" hidden={chatOpen}>
        <div className="recovery-intro">
          <div><p className="recovery-eyebrow">{t(screen === 'choose' ? 'recovery.chooseStep' : 'recovery.planStep')}</p><h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>{t(screen === 'choose' ? 'recovery.title' : 'recovery.planTitle')}</h2><p>{t(screen === 'choose' ? 'recovery.intro' : 'recovery.planIntro')}</p></div>
          <img src={ASSETS.surfyLifeguard} alt="" width="640" height="960" decoding="async" />
        </div>
        <div className="recovery-chat-invite"><div><strong>{t('recovery.chat.invite')}</strong><p>{t('recovery.chat.inviteBody')}</p></div><button type="button" className="recovery-chat-jump" ref={chatTrigger} onClick={() => setChatOpen(true)} aria-expanded={chatOpen} aria-controls="lifeguard-surfy"><MessageCircle size={18} aria-hidden="true" />{t('recovery.chat.title')}<ArrowRight size={16} aria-hidden="true" /></button></div>
        {screen === 'choose' ? <>
          <fieldset className="recovery-situations"><legend>{t('recovery.what')}</legend><p>{t('recovery.multiple')}</p><div>{SITUATIONS.map(item => <label key={item} className={situations.includes(item) ? 'is-selected' : ''}><input type="checkbox" value={item} checked={situations.includes(item)} onChange={() => setSituations(current => toggleSituation(current, item))} /><span>{t(`recovery.situation.${item}`)}</span><Check size={17} aria-hidden="true" /></label>)}</div></fieldset>
          {situations.includes('danger') && country === 'PH' && <ContactCard id="emergency" t={t} />}
          <div className="recovery-context"><p className="recovery-context-heading">{t('recovery.context')}</p><div className="recovery-context-fields">
            <label className="recovery-select" htmlFor={`${id}-country`}>{t('recovery.country')}<select id={`${id}-country`} value={country} onChange={event => setCountry(event.target.value)}><option value="PH">{t('recovery.ph')}</option><option value="other">{t('recovery.otherCountry')}</option></select></label>
            {country === 'other' && <label className="recovery-select">{t('recovery.countryName')}<input value={countryName} maxLength={80} onChange={event => setCountryName(event.target.value)} autoComplete="country-name" /></label>}
            <label className="recovery-select" htmlFor={`${id}-provider`}>{t('recovery.provider')}<input id={`${id}-provider`} value={providerName} maxLength={100} placeholder={t('recovery.providerHint')} onChange={event => setProviderName(event.target.value)} /></label>
          </div><p className="recovery-field-hint">{t('recovery.providerOptional')}</p></div>
          <div className="recovery-action-bar"><p>{t('recovery.privacy')}</p><button className="recovery-primary" type="button" disabled={!situations.length} onClick={() => setScreen('plan')}>{t('recovery.showPlan')}<ArrowRight size={18} aria-hidden="true" /></button></div>
        </> : <>
          <button className="recovery-back" type="button" onClick={() => setScreen('choose')}><ArrowLeft size={17} aria-hidden="true" />{t('recovery.edit')}</button>
          {country !== 'PH' && <p className="recovery-outside" role="status">{t('recovery.outside')}</p>}
          {situations.includes('danger') && country === 'PH' && <ContactCard id="emergency" t={t} />}
          <section className="recovery-steps"><div className="recovery-steps-heading"><h3>{t('recovery.steps')}</h3><span role="status">{done} / {plan.steps.length} {t('recovery.completed')}</span></div><progress value={done} max={plan.steps.length || 1} aria-label={t('recovery.completed')} />{plan.steps.map((item, index) => <label key={item} className={completed.includes(item) ? 'is-done' : ''}><input type="checkbox" checked={completed.includes(item)} onChange={() => setCompleted(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])} /><span><strong>{index + 1}. {t(`recovery.step.${item}.title`)}</strong><span>{t(`recovery.step.${item}.body`)}</span></span></label>)}</section>
          {plan.contacts.some(item => item !== 'emergency') && <details className="recovery-contacts"><summary><span><Phone size={17} aria-hidden="true" />{t('recovery.contacts')}</span><ChevronDown size={18} aria-hidden="true" /></summary><p>{t('recovery.contactIntro')}</p>{plan.contacts.filter(item => item !== 'emergency').map(item => <ContactCard id={item} key={item} t={t} />)}<p className="recovery-review">{t('recovery.reviewed')}: {CONTACTS_REVIEWED}. {t('recovery.rates')}</p></details>}
          <div className="recovery-action-bar"><p>{t('recovery.limit')}</p><button type="button" className="recovery-secondary" onClick={download}><Download size={18} aria-hidden="true" />{t('recovery.download')}</button></div>
        </>}
      </div>
      <RecoveryChat isOpen={chatOpen} onClose={closeChat} t={t} lang={lang} isOnline={isOnline} situations={situations} provider={provider} providerName={providerName} country={country} countryName={countryName} />
    </div>
    <div className="recovery-wave" aria-hidden="true"><svg viewBox="0 0 600 80" preserveAspectRatio="none"><path d="M0 28C90 0 170 51 270 25S460 6 600 28V80H0Z" fill="#2f73c6" /><path d="M0 44C110 70 180 15 310 44S475 61 600 38V80H0Z" fill="#8dd7f5" /></svg></div>
  </dialog>, document.body);
}

export default function RecoveryHelp({ isOpen, onOpen, onClose, t, lang, isOnline, compact = false }) {
  return <><section id="recovery" className={`recovery-launcher${compact ? ' is-compact' : ' page-container'}`} aria-label={t('recovery.label')}><LifeBuoy size={25} aria-hidden="true" /><div><h2>{t('recovery.launchTitle')}</h2><p>{t('recovery.launchBody')}</p></div><button type="button" onClick={onOpen}>{t('recovery.open')}<ArrowRight size={18} aria-hidden="true" /></button></section>{isOpen && <RecoveryDialog onClose={onClose} t={t} lang={lang} isOnline={isOnline} />}</>;
}
