import { useCallback, useEffect, useState } from 'react';

function isInstalled() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator?.standalone);
}

export default function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isInstalled);

  useEffect(() => {
    const onBeforeInstall = (event) => {
      // Keep the event so the user can install from Surfare's own button.
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onInstalled = () => { setDeferredPrompt(null); setInstalled(true); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice?.outcome === 'accepted';
  }, [deferredPrompt]);

  return { canInstall: Boolean(deferredPrompt) && !installed, installed, install };
}
