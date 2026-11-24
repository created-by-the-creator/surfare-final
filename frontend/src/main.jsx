import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/outfit';
import './index.css';
import App from './App.jsx';
import { PrivacyProvider } from './privacy/PrivacyContext.jsx';
import './motion.css';
import './components/CheckExperience.css';
import { readShareLaunch } from './sharing/receive.js';

const shareLaunch = readShareLaunch();

// Ordinary page loads start at the hero; shared items open at the checker.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}
if (window.location.hash) {
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
}
const startAtTop = () => { if (!shareLaunch) window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); };
startAtTop();
window.addEventListener('pageshow', startAtTop);

// Commit the home page before the browser captures the incoming page transition.
flushSync(() => createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivacyProvider><App shareLaunch={shareLaunch} /></PrivacyProvider>
  </React.StrictMode>,
));
