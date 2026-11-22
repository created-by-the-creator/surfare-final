import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { downloadOfflinePack, inspectOfflinePack, OFFLINE_PACK_BYTES, OFFLINE_STORAGE_BYTES } from '../offline/resources.js';
import './OfflineResources.css';

export default function OfflineResources({ t, isOnline }) {
  const [status, setStatus] = useState('checking');
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState('');
  const controllerRef = useRef(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    inspectOfflinePack().then((pack) => {
      if (!mountedRef.current) return;
      setLoaded(pack.bytes); setStatus(!pack.supported ? 'unsupported' : pack.ready ? 'ready' : 'idle');
    }).catch(() => { if (mountedRef.current) setStatus('unsupported'); });
    return () => { mountedRef.current = false; controllerRef.current?.abort(); };
  }, []);

  const download = async () => {
    if (controllerRef.current) return;
    const controller = new AbortController(); controllerRef.current = controller;
    setError(''); setStatus('downloading');
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota && estimate.quota - (estimate.usage || 0) < OFFLINE_STORAGE_BYTES * (1 - loaded / OFFLINE_PACK_BYTES)) throw Error('offline_storage_full');
      const pack = await downloadOfflinePack({ signal: controller.signal, onProgress: ({ loaded }) => { if (mountedRef.current) setLoaded(loaded); } });
      if (mountedRef.current) { setStatus(pack.ready ? 'ready' : 'idle'); setLoaded(pack.bytes); }
    } catch (error) {
      if (!mountedRef.current) return;
      if (error.name !== 'AbortError') setError(error.name === 'QuotaExceededError' || error.message === 'offline_storage_full' ? 'offline.storageError' : 'offline.downloadError');
      const pack = await inspectOfflinePack().catch(() => ({ bytes: 0 }));
      if (mountedRef.current) { setLoaded(pack.bytes); setStatus('idle'); }
    } finally { controllerRef.current = null; }
  };
  const downloading = status === 'downloading';
  const ready = status === 'ready';
  const percent = Math.min(100, Math.round(loaded / OFFLINE_PACK_BYTES * 100));
  const description = ready ? 'offline.readyBody' : status === 'unsupported' ? 'offline.unsupportedBody' : 'offline.body';

  return (
    <section className="offline-resources" id="offline-resources" aria-labelledby="offline-title">
      <span className={`offline-resource-icon${ready ? ' is-ready' : ''}`}>{ready ? <CheckCircle2 aria-hidden="true" /> : <Download aria-hidden="true" />}</span>
      <div className="offline-resource-copy">
        <h3 id="offline-title">{t(ready ? 'offline.readyTitle' : 'offline.title')}</h3>
        <p>{t(description)}</p>
        {downloading && <div className="offline-download-progress"><progress max={100} value={percent} aria-label={t('offline.downloading')} /><span aria-live="polite">{percent}%</span></div>}
        {error && <p className="offline-resource-error" role="alert">{t(error)}</p>}
      </div>
      <div className="offline-resource-action">
        <button className="offline-download-button" type="button" disabled={ready || downloading || !isOnline || status === 'checking' || status === 'unsupported'} onClick={download}>
          {ready ? <CheckCircle2 size={17} aria-hidden="true" /> : downloading ? <Loader2 className="offline-spinner" size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
          {t(ready ? 'offline.saved' : downloading ? 'offline.downloading' : status === 'checking' ? 'offline.checking' : !isOnline ? 'offline.needInternet' : loaded > 0 ? 'offline.resume' : 'offline.download')}
        </button>
        {downloading ? <button className="offline-cancel" type="button" onClick={() => controllerRef.current?.abort()}>{t('offline.cancel')}</button> : <small>{t(ready ? 'offline.savedOnDevice' : 'offline.size', { size: (OFFLINE_PACK_BYTES / 1000000).toFixed(1) })}</small>}
      </div>
    </section>
  );
}
