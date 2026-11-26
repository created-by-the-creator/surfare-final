import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Smartphone } from 'lucide-react';
import { downloadOfflinePack, inspectOfflinePack, OFFLINE_PACK_BYTES, OFFLINE_STORAGE_BYTES } from '../offline/resources.js';
import useInstallPrompt from '../pwa/useInstallPrompt.js';
import './OfflineResources.css';

export default function OfflineResources({ t, isOnline }) {
  const [status, setStatus] = useState('checking');
  const [loaded, setLoaded] = useState(0);
  const controllerRef = useRef(null);
  const mountedRef = useRef(false);
  const attemptedRef = useRef(false);
  const { canInstall, install } = useInstallPrompt();

  useEffect(() => {
    mountedRef.current = true;
    inspectOfflinePack().then((pack) => {
      if (!mountedRef.current) return;
      setLoaded(pack.bytes);
      setStatus(!pack.supported ? 'unsupported' : pack.ready ? 'ready' : 'idle');
    }).catch(() => { if (mountedRef.current) setStatus('unsupported'); });
    return () => { mountedRef.current = false; controllerRef.current?.abort(); };
  }, []);

  const download = useCallback(async () => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('downloading');
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota && estimate.quota - (estimate.usage || 0) < OFFLINE_STORAGE_BYTES * (1 - loaded / OFFLINE_PACK_BYTES)) throw Error('offline_storage_full');
      const pack = await downloadOfflinePack({ signal: controller.signal, onProgress: ({ loaded: value }) => { if (mountedRef.current) setLoaded(value); } });
      if (mountedRef.current) {
        setStatus(pack.ready ? 'ready' : 'idle');
        setLoaded(pack.bytes);
      }
    } catch {
      if (!mountedRef.current) return;
      const pack = await inspectOfflinePack().catch(() => ({ bytes: 0 }));
      if (mountedRef.current) { setLoaded(pack.bytes); setStatus('idle'); }
    } finally {
      controllerRef.current = null;
    }
  }, [loaded]);

  // Save the OCR pack quietly whenever the app has a working connection.
  // A failed attempt is retried after the connection drops and returns.
  useEffect(() => {
    if (!isOnline) {
      attemptedRef.current = false;
      return;
    }
    if (status !== 'idle' || attemptedRef.current) return;
    attemptedRef.current = true;
    void download();
  }, [download, isOnline, status]);

  if (status !== 'ready') return null;

  const readyHelp = t('offline.readyHelp');
  return (
    <section className="pwa-install-row" aria-label={readyHelp}>
      <span className="offline-ready-badge" title={readyHelp}>
        <CheckCircle2 size={16} aria-hidden="true" />
        {t('offline.readyBadge')}
      </span>
      {canInstall && (
        <button className="offline-install-button" type="button" onClick={install}>
          <Smartphone size={16} aria-hidden="true" />
          {t('offline.installPhone')}
        </button>
      )}
    </section>
  );
}
