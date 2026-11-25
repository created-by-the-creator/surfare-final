import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Globe, Image, Link2, MessageSquareText, ShieldCheck, Upload, Wifi, WifiOff } from 'lucide-react';
import { ASSETS } from '../../frontend/src/assets.js';
import ResultPanel from '../../frontend/src/components/ResultPanel.jsx';
import { mergeLinkResolution } from '../../frontend/src/engine/link-destination.js';
import AskSurfy from '../../frontend/src/components/AskSurfy.jsx';
import RecoveryHelp from '../../frontend/src/components/RecoveryHelp.jsx';
import PrivacyNotice from '../../frontend/src/components/PrivacyNotice.jsx';
import { usePrivacyNotice } from '../../frontend/src/privacy/PrivacyContext.jsx';
import { analyzeInput } from '../../frontend/src/engine/analyze.js';
import { getSuggestedQuestionKeys, getSuggestedSignalQuestions, getSurfyAnswer, getSurfyResultMessage } from '../../frontend/src/surfy/templates.js';
import { requestSurfyReply } from '../../frontend/src/surfy/client.js';
import { htmlLanguage } from '../../frontend/src/i18n/useI18n.js';
import { translate } from './copy.js';
import { imageOriginPattern, loadContextImage } from './image.js';
import { SURFARE_ORIGIN } from '../identity.js';

const tabs = [['text', MessageSquareText], ['links', Link2], ['image', Image]];
export default function ExtensionPanel() {
  const { hasAcknowledged, notice, requestAcknowledgment, reviewNotice } = usePrivacyNotice();
  const [lang, setLang] = useState(() => localStorage.getItem('surfare-language') || 'en');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const t = useCallback((key, values) => translate(lang, key, values), [lang]);
  const [tab, setTab] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [imageMode, setImageMode] = useState('origin');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loadingImage, setLoadingImage] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [errorKey, setErrorKey] = useState('');
  const [onlineHelp, setOnlineHelp] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [askOpen, setAskOpen] = useState(false);
  const [openRequest, setOpenRequest] = useState(0);
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const runId = useRef(0), chatAbort = useRef(null), chatQueue = useRef([]);
  const lastIncoming = useRef(''), startup = useRef(false);
  const busy = ['analyzing', 'reviewing'].includes(status) || loadingImage;

  useEffect(() => {
    document.documentElement.lang = htmlLanguage(lang);
    localStorage.setItem('surfare-language', lang);
  }, [lang]);
  useEffect(() => {
    if (!startup.current) { startup.current = true; void requestAcknowledgment(); }
    return () => { chatAbort.current?.abort(); };
  }, [requestAcknowledgment]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change); window.addEventListener('offline', change);
    return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change); };
  }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    let key, closed = false, changes = 0;
    const accept = item => {
      if (!closed && item) { setIncoming(item); void chrome.storage.session.remove(key); }
    };
    const changed = (values, area) => { if (area === 'session' && key && values[key]?.newValue) { changes++; accept(values[key].newValue); } };
    chrome.storage.onChanged.addListener(changed);
    void chrome.windows.getCurrent().then(async window => {
      key = `pending-${window.id}`;
      const version = changes;
      const values = await chrome.storage.session.get(key);
      if (version === changes) accept(values[key]);
    });
    return () => { closed = true; chrome.storage.onChanged.removeListener(changed); };
  }, []);

  function clearResult() {
    runId.current++;
    chatAbort.current?.abort(); chatAbort.current = null; chatQueue.current = [];
    setThinking(false); setAskOpen(false); setMessages([]);
    setStatus('idle'); setResult(null); setErrorKey('');
  }
  function reset() {
    clearResult(); setText(''); setFile(null); setSourceUrl(''); setLoadingImage(false); setOnlineHelp(false);
  }
  async function check({ kind = tab, value = text, image = file, mode = imageMode, useOnline = false } = {}) {
    const before = runId.current;
    if (!await requestAcknowledgment() || before !== runId.current) return;
    clearResult();
    const id = runId.current;
    setStatus('analyzing');
    try {
      const checked = await analyzeInput(mode === 'qr' && kind === 'image' ? 'qr' : kind, {
        message: value, url: value, image, qr: image,
        imageVisualConsent: useOnline && mode === 'origin',
      }, {
        onlineLookup: useOnline, ai: useOnline, imageMode: mode,
        onLocalResult: local => { if (id === runId.current) { setResult(local); setStatus('reviewing'); } },
      });
      if (id !== runId.current) return;
      setResult(checked);
      if (checked.errorKey) { setErrorKey(checked.errorKey); setStatus('error'); return; }
      setStatus('result');
      setMessages([{ role: 'surfy', text: getSurfyResultMessage(checked, t) }]);
    } catch (error) {
      if (id !== runId.current) return;
      setErrorKey(['file_too_large', 'file_empty', 'file_unsupported', 'image_dimensions'].includes(error.message) ? `error.${error.message}` : 'error.analysis');
      setStatus('error');
    }
  }

  async function getImage(src, askPermission) {
    const id = runId.current;
    setLoadingImage(true); setErrorKey('');
    try {
      const origins = [imageOriginPattern(src)];
      // A permission request must stay in the button's user gesture.
      const access = askPermission ? chrome.permissions.request({ origins }) : chrome.permissions.contains({ origins });
      if (!await access) { if (askPermission) throw Error('permission_denied'); return; }
      const selected = await loadContextImage(src);
      if (id !== runId.current) return;
      setFile(selected); setSourceUrl(''); setLoadingImage(false);
      await check({ kind: 'image', image: selected, mode: imageMode });
    } catch (error) {
      if (id === runId.current) setErrorKey(error.message === 'permission_denied' ? 'extension.permissionDenied' : error.message === 'file_too_large' ? 'error.file_too_large' : 'extension.imageUnavailable');
    } finally { if (id === runId.current) setLoadingImage(false); }
  }
  useEffect(() => {
    if (!hasAcknowledged || !incoming || lastIncoming.current === incoming.id) return;
    lastIncoming.current = incoming.id;
    reset();
    if (incoming.expiresAt <= Date.now()) { setErrorKey('extension.expired'); return; }
    if (incoming.kind === 'error') { setErrorKey(incoming.errorKey); return; }
    setTab(incoming.kind);
    if (incoming.kind === 'image') { setSourceUrl(incoming.srcUrl); void getImage(incoming.srcUrl, false); }
    else { setText(incoming.text); void check({ kind: incoming.kind, value: incoming.text }); }
  }, [incoming, hasAcknowledged]);

  async function drainChat() {
    if (chatAbort.current) return;
    while (chatQueue.current.length) {
      const item = chatQueue.current.shift();
      const controller = new AbortController(); chatAbort.current = controller; setThinking(true);
      let answer = item.fallback;
      if (item.ai) {
        try { answer = await requestSurfyReply({ ...item, signal: controller.signal }); }
        catch { answer = `${item.t('ask.aiUnavailable')} ${item.fallback}`; }
      }
      if (controller.signal.aborted || chatAbort.current !== controller) return;
      setMessages(previous => [...previous, { role: 'surfy', text: answer }]);
      chatAbort.current = null;
    }
    setThinking(false);
  }
  function send(question, { local = false } = {}) {
    setMessages(previous => [...previous, { role: 'user', text: question }]);
    chatQueue.current.push({ question, result, language: lang, history: messages, t,
      ai: onlineHelp && online && !local && !result?.privateQr,
      fallback: getSurfyAnswer(question, result, t) });
    void drainChat();
  }
  const questions = [...getSuggestedSignalQuestions(result, t), ...getSuggestedQuestionKeys({ result, activeTab: tab })];
  const guideState = busy ? 'checking' : status === 'error' || errorKey ? 'error' : status === 'result' ? 'done' : (tab === 'image' ? file : text.trim()) ? 'ready' : 'idle';
  const mascot = busy || guideState === 'error' ? ASSETS.surfyMagnify
    : status === 'result' ? result?.level === 'high' ? ASSETS.surfyAlarm : ASSETS.surfyTablet : ASSETS.surfyPoint;
  function chooseImage(selected) {
    if (busy) return;
    clearResult(); setSourceUrl(''); setFile(selected || null);
  }
  return <div className="extension-shell check-section">
    <header className="extension-header">
      <div className="extension-brand"><img src={ASSETS.appIcon} alt="" width="36" height="36" /><h1>Surfare</h1></div>
      <label className="extension-language"><Globe size={16} aria-hidden="true" /><select aria-label={t('nav.language')} value={lang} onChange={event => setLang(event.target.value)}><option value="en">English</option><option value="tl">Filipino</option><option value="taglish">Taglish</option></select></label>
      <button type="button" className="extension-site" aria-label={t('extension.website')} onClick={() => chrome.tabs.create({ url: SURFARE_ORIGIN })}><ExternalLink size={18} /></button>
    </header>
    <main>
      <div className="extension-form-card">
        <div className="extension-workspace-top"><h2>{t('check.title')}</h2><span className={`extension-connection ${online ? 'is-online' : 'is-offline'}`} role="status">{online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}{t(online ? 'nav.online' : 'nav.offline')}</span></div>
        <div className={`extension-guide is-${guideState}`}>
          <img src={mascot} alt="" width="88" height="96" />
          <p role="status">{t(`check.guide.${guideState}`)}</p>
        </div>
      <div className="extension-tabs" role="group" aria-label={t('check.tabs.label')}>
        {tabs.map(([kind, Icon]) => <button key={kind} type="button" disabled={busy} aria-pressed={tab === kind} onClick={() => { reset(); setTab(kind); }}><Icon size={17} />{t(`check.tabs.${kind}`)}</button>)}
      </div>
      <section className="extension-input">
        {tab !== 'image' ? <><label htmlFor="selected-text">{t(tab === 'links' ? 'check.link.label' : 'check.text.label')}</label><textarea id="selected-text" value={text} maxLength={12000} disabled={busy} placeholder={t('extension.placeholder')} onChange={event => { clearResult(); setText(event.target.value); }} /></> : <>
          <label htmlFor="extension-image">{t('check.image.label')}</label>
          {sourceUrl && <div className="extension-image-access"><p>{t('extension.imageAccess', { host: new URL(sourceUrl).hostname })}</p><button type="button" disabled={busy} onClick={() => { void getImage(sourceUrl, true); }}>{t('extension.loadImage')}</button></div>}
          <input className="extension-file-input" id="extension-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { chooseImage(event.target.files[0]); event.target.value = ''; }} />
          <button type="button" className="extension-upload" disabled={busy} onClick={() => document.getElementById('extension-image').click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (event.dataTransfer.files[0]) chooseImage(event.dataTransfer.files[0]); }}>
            {preview ? <img className="extension-preview" src={preview} alt={t('check.image.preview')} /> : <Upload size={28} aria-hidden="true" />}
            <span>{t('check.image.choose')}</span><small>{t('check.image.formats')}</small>
          </button>
          {file && <p className="extension-file-name">{file.name}</p>}
          <label htmlFor="image-mode">{t('check.image.modeLabel')}</label>
          <select id="image-mode" value={imageMode} disabled={busy} onChange={event => { clearResult(); setImageMode(event.target.value); }}><option value="origin">{t('check.image.modeAi')}</option><option value="ocr">{t('check.image.modeOcr')}</option><option value="qr">{t('check.tabs.qr')}</option></select>
        </>}
        {errorKey && status !== 'error' && <p className="extension-error" role="alert">{t(errorKey)}</p>}
        <label className="extension-online"><input type="checkbox" checked={onlineHelp} disabled={!online || busy} onChange={event => { setOnlineHelp(event.target.checked); if (!event.target.checked) { chatAbort.current?.abort(); chatAbort.current = null; chatQueue.current = []; setThinking(false); } }} /><span><strong>{t('extension.online')}</strong><small>{t('extension.sharing')}</small></span></label>
        {!online && <p className="extension-local">{t('extension.offline')}</p>}
        <button className="extension-check" disabled={busy || (tab === 'image' ? !file : !text.trim())} type="button" onClick={() => { void check({ useOnline: onlineHelp && online }); }}><ShieldCheck size={19} />{t(busy ? 'result.loading' : onlineHelp ? 'extension.checkOnline' : 'check.button')}</button>
      </section>
      </div>
      <RecoveryHelp compact t={t} lang={lang} isOnline={online} isOpen={recoveryOpen} onOpen={() => setRecoveryOpen(true)} onClose={() => setRecoveryOpen(false)} />
      <ResultPanel status={status} result={result} errorKey={errorKey} isOnline={online} t={t} onReset={reset} isAskOpen={askOpen} onRecovery={() => setRecoveryOpen(true)}
        onDestinationResolved={resolution => setResult(current => current ? mergeLinkResolution(current, resolution) : current)}
        onReviewText={() => { const value = result.checkedText; reset(); setTab('text'); setText(value); }}
        onAskAboutResult={() => { setAskOpen(true); setOpenRequest(value => value + 1); requestAnimationFrame(() => { document.querySelector('.ask-dialog h2')?.focus({ preventScroll: true }); document.querySelector('.ask-dialog')?.scrollIntoView({ block: 'start' }); }); }} />
      {status === 'result' && <button className="extension-reset" type="button" onClick={reset}>{t('check.new')}</button>}
      {askOpen && <AskSurfy isOpen isThinking={thinking} messages={messages} onSend={send} openRequest={openRequest} questionKeys={questions} aiEnabled={onlineHelp && online} t={t} />}
    </main>
    <footer className="extension-footer"><p className="extension-intro">{t('extension.intro')}</p><p>{t('extension.localFirst')}</p><details><summary>{t('extension.accessTitle')}</summary><p>{t('extension.accessDetail')}</p></details><button type="button" onClick={reviewNotice}>{t('extension.privacy')}</button></footer>
    {notice && <PrivacyNotice t={t} reduced key={`${notice}-${hasAcknowledged}`} />}
  </div>;
}
