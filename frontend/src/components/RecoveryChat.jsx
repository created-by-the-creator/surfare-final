import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { usePrivacyNotice } from '../privacy/PrivacyContext.jsx';
import { localGuideAnswer, askGuide } from '../recovery/chat.js';
import { ASSETS } from '../assets.js';
import AskSurfy from './AskSurfy.jsx';

export default function RecoveryChat({ isOpen, onClose, t, lang, isOnline, situations, provider, providerName, country, countryName }) {
  const privacy = usePrivacyNotice();
  const [online, setOnline] = useState(false), [messages, setMessages] = useState([]), [busy, setBusy] = useState(false);
  const controller = useRef(null), mounted = useRef(true), connected = useRef(isOnline);
  connected.current = isOnline;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (!isOnline) { setOnline(false); controller.current?.abort(); setBusy(false); } }, [isOnline]);
  const submit = async question => {
    const text = question.trim().slice(0, 1000);
    if (!text || busy) return;
    const history = messages.map(({ role, text: content }) => ({ role, content }));
    setMessages(current => [...current, { role: 'user', text }]);
    const local = localGuideAnswer({ question: text, situations, provider, country, t });
    if (!online || !isOnline) { setMessages(current => [...current, { role: 'assistant', text: local }]); return; }
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const result = await askGuide({ question: text, language: lang, providerName, country: country === 'PH' ? 'Philippines' : countryName || 'Country not specified', situations, history }, abort.signal);
      if (mounted.current) setMessages(current => [...current, { role: 'assistant', text: abort.signal.aborted ? local : result.answer }]);
    } catch {
      if (mounted.current) setMessages(current => [...current, { role: 'assistant', text: `${t('recovery.chat.unavailable')}\n\n${local}` }]);
    } finally { if (mounted.current) setBusy(false); }
  };
  if (!isOpen) return null;
  return <div className="recovery-chat-view">
    <button type="button" className="recovery-back" onClick={onClose}><ArrowLeft size={17} aria-hidden="true" />{t('recovery.chat.back')}</button>
    <div className="recovery-chat ask-panel-position"><AskSurfy isOpen messages={messages} isThinking={busy} onSend={submit} openRequest={isOpen} idPrefix="lifeguard" mascot={ASSETS.surfyLifeguard} welcome={t('recovery.chat.greeting')} t={t} hideToggle
      questionKeys={['first', 'contact'].map(key => ({ text: t(`recovery.chat.prompt.${key}`) }))}
      controls={<label className="recovery-online"><input type="checkbox" checked={online} disabled={!isOnline || busy} onChange={async event => {
        if (!event.target.checked) { setOnline(false); controller.current?.abort(); return; }
        if (await privacy?.requestAcknowledgment()) { if (mounted.current && connected.current) setOnline(true); }
      }} /><span>{t('recovery.chat.online')}<small>{t(isOnline ? 'recovery.chat.onlineInfo' : 'recovery.chat.offline')}</small></span></label>}
    /></div>
    <p className="recovery-chat-note">{t('recovery.chat.privacy')}</p>
  </div>;
}
