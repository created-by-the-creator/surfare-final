import AnimatedMascot from './AnimatedMascot.jsx';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, MessageCircle, X } from 'lucide-react';
import { ASSETS } from '../assets.js';
import AskSurfy from './AskSurfy.jsx';
import './SurfyLauncher.css';

export default function SurfyLauncher({ t, messages, isThinking, onSend, questionKeys, aiEnabled, isOnline, onAiChange }) {
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(() => {
    try { return localStorage.getItem('surfare-surfy-folded') === 'true'; } catch { return false; }
  });
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const fold = value => {
    setFolded(value);
    try { localStorage.setItem('surfare-surfy-folded', String(value)); } catch { /* Keep the current choice. */ }
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector('textarea')?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <div className={`surfy-launcher-dock${folded ? ' is-folded' : ''}`}>
    {folded ? <button ref={triggerRef} className="surfy-unhide" type="button" onClick={() => fold(false)}
      aria-label={t('ask.showButton')} title={t('ask.showButton')}><MessageCircle size={22} aria-hidden="true" /></button>
    : <>
    <button ref={triggerRef} className="surfy-launcher" type="button" onClick={() => setOpen(true)}
      aria-haspopup="dialog" aria-expanded={open} aria-controls="surfy-quick-dialog">
      <span className="surfy-launcher-avatar" aria-hidden="true"><AnimatedMascot src={ASSETS.surfyWink} alt="" width="80" height="80" /></span>
      <span className="surfy-launcher-copy"><span>{t('ask.eyebrow')}</span><strong>{t('ask.title')}</strong></span>
      <ArrowUpRight size={20} aria-hidden="true" />
    </button>
    <button className="surfy-fold" type="button" onClick={() => fold(true)} aria-label={t('ask.hideButton')}
      title={t('ask.hideButton')}><ChevronDown size={17} aria-hidden="true" /></button>
    </>}
    </div>
    <dialog id="surfy-quick-dialog" ref={dialogRef} className="surfy-quick-dialog" aria-label={t('ask.title')}
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false);
      }}>
      {open && <>
        <button type="button" className="surfy-quick-close" onClick={() => setOpen(false)} aria-label={t('ask.close')}><X size={20} aria-hidden="true" /></button>
        <AskSurfy isOpen idPrefix="quick-ask" openRequest={open} t={t} messages={messages} isThinking={isThinking}
          onSend={onSend} questionKeys={questionKeys} showReplyStart
          controls={<label className="surfy-quick-ai"><input type="checkbox" checked={aiEnabled} disabled={!isOnline}
            onChange={event => onAiChange(event.target.checked)} /><span>{t('ask.aiHelp')}<small>{t(isOnline ? 'ask.quickPrivacy' : 'recovery.chat.offline')}</small></span></label>} />
      </>}
    </dialog>
  </>;
}
