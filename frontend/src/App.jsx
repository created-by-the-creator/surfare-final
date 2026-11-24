import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CameraModal from './components/CameraModal.jsx';
import CheckCard from './components/CheckCard.jsx';
import FeedbackModal from './components/FeedbackModal.jsx';
import Footer from './components/Footer.jsx';
import Hero from './components/Hero.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import ImageModeModal from './components/ImageModeModal.jsx';
import Navbar from './components/Navbar.jsx';
import ResultPanel from './components/ResultPanel.jsx';
import RiskLevels from './components/RiskLevels.jsx';
import ScamPractice from './components/ScamPractice.jsx';
import OfflineResources from './components/OfflineResources.jsx';
import { analyzeInput } from './engine/analyze.js';
import { getSuggestedQuestionKeys, getSuggestedSignalQuestions, getSurfyAnswer, getSurfyResultMessage } from './surfy/templates.js';
import { requestSurfyReply } from './surfy/client.js';
import { htmlLanguage, translate } from './i18n/useI18n.js';
import useScrollReveal from './useScrollReveal.js';
import useFluidMotion from './useFluidMotion.js';
import { usePrivacyNotice } from './privacy/PrivacyContext.jsx';
import WelcomeExperience from './components/WelcomeExperience.jsx';
import useConnectionStatus from './useConnectionStatus.js';

const LANGUAGES = ['en', 'tl', 'taglish'];

const DEMO_CASES = {
  low: {
    tab: 'text',
    message: 'Your appointment is confirmed for tomorrow at 10 AM. Details: https://example.com/appointment',
    level: 'low',
    score: 1,
    signals: [
      { id: 'link_in_message', severity: 1, weight: 1, evidence: 'https://example.com/appointment' },
    ],
  },
  suspicious: {
    tab: 'text',
    message: 'Provide us with the details we sent you and Give me your money and account details.',
    level: 'suspicious',
    score: 6,
    signals: [
      { id: 'urgency', severity: 2, weight: 2 },
      { id: 'link_mismatch', severity: 3, weight: 3 },
      { id: 'otp_request', severity: 3, weight: 4 },
      { id: 'threat_loss', severity: 2, weight: 2 },
      { id: 'online_match', severity: 3, weight: 8, evidence: 'sample online lookup' },
    ],
    matchedPhrase: 'Give me your money and account details.',
    isDemoSuspicious: true,
  },
  high: {
    tab: 'text',
    message: 'Your GCash account will be blocked today. Send your OTP now to keep access.',
    level: 'high',
    score: 9,
    signals: [
      { id: 'urgency', severity: 2, weight: 2, evidence: 'today' },
      { id: 'otp_request', severity: 3, weight: 4, evidence: 'OTP' },
      { id: 'credential_request', severity: 3, weight: 3, evidence: 'account' },
    ],
  },
  unknown: {
    tab: 'text',
    message: 'Hi.',
    level: 'unknown',
    score: 0,
    signals: [],
    reasonKeys: [
      'result.unknown.reason.littleText',
      'result.unknown.reason.noLink',
      'result.unknown.reason.noSignals',
    ],
  },
  'ask-chat': {
    tab: 'text',
    message: 'Your GCash account will be blocked today. Send your OTP now to keep access.',
    level: 'suspicious',
    score: 6,
    signals: [
      { id: 'urgency', severity: 2, weight: 2 },
      { id: 'otp_request', severity: 3, weight: 4 },
      { id: 'credential_request', severity: 3, weight: 3 },
    ],
  },
  links: {
    tab: 'links',
    inputs: { url: 'gcash.login-example.xyz/verify' },
    level: 'suspicious',
    score: 5,
    signals: [
      { id: 'brand_in_subdomain_not_domain', severity: 3, weight: 3, evidence: 'gcash.login-example.xyz' },
      { id: 'risky_tld', severity: 2, weight: 2, evidence: '.xyz' },
    ],
  },
  qr: {
    tab: 'qr',
    inputs: { qrValue: 'https://gcash.login-example.xyz/verify' },
    level: 'high',
    score: 8,
    signals: [
      { id: 'brand_in_subdomain_not_domain', severity: 3, weight: 3, evidence: 'gcash.login-example.xyz' },
      { id: 'risky_tld', severity: 2, weight: 2, evidence: '.xyz' },
      { id: 'online_match', severity: 3, weight: 8, evidence: 'sample offline demo' },
    ],
  },
  error: {
    tab: 'qr',
    inputs: {},
    level: 'unknown',
    score: 0,
    signals: [],
    errorKey: 'error.qr_missing',
  },
};

const DEMO_ALIASES = {
  ask: 'suspicious',
  autoask: 'suspicious',
  feedback: 'suspicious',
};

function useInitialLanguage() {
  try {
    const savedLanguage = window.localStorage.getItem('surfare-language');
    return LANGUAGES.includes(savedLanguage) ? savedLanguage : 'en';
  } catch {
    return 'en';
  }
}

function demoResult(scenario, checkedText) {
  const { level, score, signals } = scenario;
  const usedOnline = signals.some((signal) => signal.id === 'online_match');
  return {
    level,
    score,
    signals,
    usedOnline,
    onlineUnavailable: false,
    summaryKey: usedOnline ? 'summary_online' : 'summary_local',
    checkedText,
    matchedPhrase: scenario.matchedPhrase,
    isDemoSuspicious: scenario.isDemoSuspicious,
    reasonKeys: scenario.reasonKeys,
  };
}

export default function App() {
  useScrollReveal();
  useFluidMotion();
  const { hasAcknowledged, requestAcknowledgment } = usePrivacyNotice();
  const [lang, setLang] = useState(useInitialLanguage);
  const t = useCallback((key, values) => translate(lang, key, values), [lang]);
  const isOnline = useConnectionStatus();
  const [activeTab, setActiveTab] = useState('text');
  const [inputs, setInputs] = useState({
    message: '',
    url: '',
    image: null,
    qr: null,
    qrValue: '',
    imageMode: '',
    imageVisualConsent: false,
  });
  const [status, setStatus] = useState('idle');
  const [isCheckUsed, setIsCheckUsed] = useState(false);
  const [result, setResult] = useState(null);
  const [errorKey, setErrorKey] = useState('');
  const [isAskOpen, setIsAskOpen] = useState(false);
  const [surfyOpenRequest, setSurfyOpenRequest] = useState(0);
  const [isAskClosing, setIsAskClosing] = useState(false);
  const [isAskThinking, setIsAskThinking] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(() => {
    try { return sessionStorage.getItem('surfare-ai-opt-in') === 'true'; } catch { return false; }
  });
  const [askMessages, setAskMessages] = useState([]);
  const [feedbackType, setFeedbackType] = useState('text');
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState('');
  const [isImageModeModalOpen, setIsImageModeModalOpen] = useState(false);
  const askQuestionKeys = useMemo(
    () => {
      const tagged = getSuggestedSignalQuestions(result, t);
      const topics = getSuggestedQuestionKeys({ result, activeTab }).filter(key => !(tagged.length && key === 'ask.why'));
      return [...tagged, ...topics];
    },
    [activeTab, result, t],
  );
  const askOpenTimer = useRef(null);
  const askCloseTimer = useRef(null);
  const askAnswerQueue = useRef([]);
  const askRequestRef = useRef(null);
  const checkRunId = useRef(0);
  const checkUsedRef = useRef(false);

  useEffect(() => () => {
    window.clearTimeout(askOpenTimer.current);
    window.clearTimeout(askCloseTimer.current);
    askRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!isOnline) {
      askRequestRef.current?.abort();
      askRequestRef.current = null;
      askAnswerQueue.current = [];
      setIsAskThinking(false);
    }
  }, [isOnline]);


  useEffect(() => {
    try { window.localStorage.setItem('surfare-language', lang); } catch { /* Keep the language for this session. */ }
    document.documentElement.lang = htmlLanguage(lang);
  }, [lang]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const demo = new URLSearchParams(window.location.search).get('demo')?.toLowerCase();
    if (demo === 'idle') return;
    const scenarioKey = DEMO_ALIASES[demo] ?? demo;
    const scenario = DEMO_CASES[scenarioKey];
    if (!scenario) return;
    checkUsedRef.current = !scenario.errorKey;
    setIsCheckUsed(!scenario.errorKey);
    setActiveTab(scenario.tab);
    setInputs((previous) => ({
      ...previous,
      ...(scenario.inputs ?? {}),
      ...(scenario.message ? { message: scenario.message } : {}),
    }));
    const result = demoResult(
      scenario,
      scenario.inputs?.url ?? scenario.inputs?.qrValue ?? scenario.message ?? '',
    );
    if (scenario.errorKey) {
      setErrorKey(scenario.errorKey);
      setStatus('error');
    }
    if (demo === 'autoask') {
      setResult(null);
      setStatus('analyzing');
      setIsAskOpen(false);
      const askTimer = window.setTimeout(() => setIsAskOpen(true), 150);
      const resultTimer = window.setTimeout(() => {
        setResult(result);
        setStatus('result');
        setAskMessages([{ role: 'surfy', text: getSurfyResultMessage(result, t) }]);
      }, 700);
      return () => {
        window.clearTimeout(askTimer);
        window.clearTimeout(resultTimer);
      };
    }
    setResult(result);
    if (!scenario.errorKey) setStatus('result');
    if (demo === 'ask' || demo === 'autoask' || demo === 'ask-chat') {
      const greeting = { role: 'surfy', text: getSurfyResultMessage(result, t) };
      setAskMessages(demo === 'ask-chat'
        ? [
          greeting,
          { role: 'user', text: t('ask.why') },
          { role: 'surfy', text: t('result.explanation.suspicious') },
          { role: 'user', text: t('ask.next') },
        ]
        : [greeting]);
      setIsAskOpen(true);
    }
    if (demo === 'feedback') {
      setFeedbackType('text');
      setIsFeedbackOpen(true);
    }
  }, []);

  const updateInput = useCallback((key, value) => {
    if (status === 'result' && (key === 'message' || key === 'url') &&
        value.trim() !== inputs[key].trim()) {
      checkUsedRef.current = false;
      setIsCheckUsed(false);
      setStatus('edited');
      setResult(null);
      setAskMessages([]);
      askRequestRef.current?.abort();
      askRequestRef.current = null;
      askAnswerQueue.current = [];
      setIsAskThinking(false);
    }
    setInputs((previous) => ({
      ...previous,
      [key]: value,
      ...(key === 'image' ? { imageMode: '', imageVisualConsent: false } : {}),
    }));
    if (key === 'image') {
      setIsImageModeModalOpen(Boolean(value));
    }
  }, [status, inputs]);

  const handleCheck = async (retryRunId) => {
    if (activeTab === 'image' && inputs.image && !inputs.imageMode) {
      setIsImageModeModalOpen(true);
      return;
    }
    if (!await requestAcknowledgment()) return;
    if (checkUsedRef.current && retryRunId !== checkRunId.current) return;
    checkUsedRef.current = true;
    setIsCheckUsed(true);
    const runId = ++checkRunId.current;
    window.clearTimeout(askCloseTimer.current);
    setIsAskClosing(false);
    if (!isAskOpen) {
      window.clearTimeout(askOpenTimer.current);
      askOpenTimer.current = window.setTimeout(() => setIsAskOpen(true), 150);
    }
    setStatus('analyzing');
    setResult(null);
    askRequestRef.current?.abort();
    askRequestRef.current = null;
    askAnswerQueue.current = [];
    setIsAskThinking(false);
    setErrorKey('');
    try {
      const analysis = await analyzeInput(activeTab, inputs, {
        onlineLookup: isOnline,
        ai: aiEnabled,
        imageMode: inputs.imageMode,
        onLocalResult: (local) => {
          if (runId !== checkRunId.current) return;
          setResult(local);
          setStatus('reviewing');
        },
      });
      if (runId !== checkRunId.current) return;
      if (analysis.errorKey) {
        setErrorKey(analysis.errorKey);
        setResult(analysis);
        setStatus('error');
        checkUsedRef.current = false;
        setIsCheckUsed(false);
        return;
      }
      setResult(analysis);
      setStatus('result');
      // A reply queued before completion must not appear after the new result summary.
      askRequestRef.current?.abort();
      askRequestRef.current = null;
      askAnswerQueue.current = [];
      setIsAskThinking(false);
      setAskMessages((previous) => [
        ...previous,
        ...(previous.length ? [{ role: 'divider', text: t('ask.newResult') }] : []),
        { role: 'surfy', text: getSurfyResultMessage(analysis, t) },
      ]);
    } catch (error) {
      if (runId !== checkRunId.current) return;
      console.error('Analysis failed:', error);
      const errorKeys = {
        file_empty: 'error.file_empty',
        file_too_large: 'error.file_too_large',
        file_unsupported: 'error.file_unsupported',
        image_dimensions: 'error.image_dimensions',
        canvas_unavailable: 'error.canvas_unavailable',
        image_too_large: 'error.file_too_large',
      };
      setErrorKey(errorKeys[error?.message] ?? 'error.analysis');
      setStatus('error');
      checkUsedRef.current = false;
      setIsCheckUsed(false);
    }
  };

  const reset = useCallback(() => {
    checkRunId.current += 1;
    checkUsedRef.current = false;
    setIsCheckUsed(false);
    window.clearTimeout(askOpenTimer.current);
    window.clearTimeout(askCloseTimer.current);
    askRequestRef.current?.abort();
    askRequestRef.current = null;
    askAnswerQueue.current = [];
    setActiveTab('text');
    setInputs({
      message: '',
      url: '',
      image: null,
      qr: null,
      qrValue: '',
      imageMode: '',
      imageVisualConsent: false,
    });
    setStatus('idle');
    setResult(null);
    setErrorKey('');
    setIsImageModeModalOpen(false);
    setAskMessages([]);
    setIsAskOpen(false);
    setIsAskClosing(false);
    setIsAskThinking(false);
  }, [isOnline]);

  const scheduleAskAnswer = useCallback(async () => {
    if (askRequestRef.current || !askAnswerQueue.current.length) return;
    const item = askAnswerQueue.current.shift();
    const controller = new AbortController();
    askRequestRef.current = controller;
    setIsAskThinking(true);
    let answer = item.fallback;
    if (item.ai) {
      try { answer = await requestSurfyReply({ ...item, signal: controller.signal }); }
      catch { answer = `${item.t('ask.aiUnavailable')} ${item.fallback}`; }
    }
    if (controller.signal.aborted || askRequestRef.current !== controller) return;
    setAskMessages((previous) => [...previous, { role: 'surfy', text: answer }]);
    if (askRequestRef.current === controller) {
      askRequestRef.current = null;
      if (askAnswerQueue.current.length) scheduleAskAnswer();
      else setIsAskThinking(false);
    }
  }, []);
  const handleAskSend = useCallback((question, { local = false } = {}) => {
    setAskMessages((previous) => [...previous, { role: 'user', text: question }]);
    askAnswerQueue.current.push({ question, result: ['result', 'reviewing'].includes(status) ? result : null, language: lang,
      history: askMessages, t, ai: aiEnabled && isOnline && !local && !result?.privateQr,
      fallback: getSurfyAnswer(question, ['result', 'reviewing'].includes(status) ? result : null, t) });
    scheduleAskAnswer();
  }, [result, status, lang, askMessages, aiEnabled, isOnline, scheduleAskAnswer, t]);

  const openFeedback = useCallback(async (type = activeTab) => {
    if (!await requestAcknowledgment()) return;
    setFeedbackType(type);
    setIsFeedbackOpen(true);
  }, [activeTab, requestAcknowledgment]);
  const handleNewCheck = useCallback(() => {
    if (status === 'result') {
      const previousTab = activeTab;
      reset();
      openFeedback(previousTab);
      return;
    }
    reset();
  }, [activeTab, openFeedback, reset, status]);
  const closeFeedback = useCallback(() => {
    setIsFeedbackOpen(false);
  }, []);
  const camera = useMemo(
    () => (cameraTarget ? (
      <CameraModal
        t={t}
        target={cameraTarget}
        onCapture={(file, qrValue) => {
          updateInput(cameraTarget, file);
          if (cameraTarget === 'qr') updateInput('qrValue', qrValue);
          setCameraTarget('');
        }}
        onClose={() => setCameraTarget('')}
      />
    ) : null),
    [cameraTarget, t],
  );

  return (
    <WelcomeExperience t={t}>
    <div className="app-bg">
      <Navbar
        lang={lang}
        onLanguageChange={setLang}
        isOnline={isOnline}
        t={t}
      />
      <main>
        <Hero t={t} />
        <CheckCard
          aiEnabled={aiEnabled}
          onAiChange={(enabled) => {
            setAiEnabled(enabled);
            try { sessionStorage.setItem('surfare-ai-opt-in', String(enabled)); } catch { /* This page still remembers the choice. */ }
            if (!enabled) {
              askRequestRef.current?.abort();
              askRequestRef.current = null;
              askAnswerQueue.current = [];
              setIsAskThinking(false);
            }
          }}
          isOnline={isOnline}
          activeTab={activeTab}
          inputs={inputs}
          onTabChange={setActiveTab}
          onInputChange={updateInput}
          onImageModeChange={() => setIsImageModeModalOpen(true)}
          onCheck={() => handleCheck()}
          canReviewAgain={status === 'result' && isOnline && aiEnabled && !result?.privateQr &&
            !result?.aiImageOnly && ['not_checked', 'unavailable'].includes(result?.aiReview?.status)}
          onReviewAgain={() => handleCheck(checkRunId.current)}
          onReset={handleNewCheck}
          onCamera={async (target) => { if (await requestAcknowledgment()) setCameraTarget(target); }}
          isAnalyzing={['analyzing', 'reviewing'].includes(status)}
          isCheckUsed={isCheckUsed}
          status={status}
          isAskOpen={isAskOpen}
          isAskClosing={isAskClosing}
          isAskThinking={isAskThinking}
          askMessages={askMessages}
          onAskSend={handleAskSend}
          surfyOpenRequest={surfyOpenRequest}
          questionKeys={askQuestionKeys}
          offlineResources={<OfflineResources t={t} isOnline={isOnline} />}
          feedbackDialog={isFeedbackOpen ? (
            <FeedbackModal
              isOpen={isFeedbackOpen}
              initialType={feedbackType}
              onClose={closeFeedback}
              t={t}
            />
          ) : null}
          t={t}
        >
          <ResultPanel
            status={status}
            result={result}
            errorKey={errorKey}
            isOnline={isOnline}
            t={t}
            onReviewText={() => {
              const extracted = result.checkedText;
              reset();
              setInputs((previous) => ({ ...previous, message: extracted }));
              requestAnimationFrame(() => document.querySelector('.tab-panel textarea')?.focus());
            }}
          />
        </CheckCard>
        <HowItWorks t={t} />
        <ScamPractice lang={lang} />
        <RiskLevels t={t} />
      </main>
      <Footer t={t} />
      {camera}
      {isImageModeModalOpen && (
        <ImageModeModal
          t={t}
          initialMode={inputs.imageMode}
          isOnline={isOnline}
          onConfirm={(mode) => {
            setInputs((previous) => ({ ...previous, imageMode: mode, imageVisualConsent: mode === 'origin' && isOnline }));
            setIsImageModeModalOpen(false);
          }}
          onClose={() => setIsImageModeModalOpen(false)}
        />
      )}
    </div>
    </WelcomeExperience>
  );
}
