import AnimatedMascot from './AnimatedMascot.jsx';
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { ChevronLeft, Pause, Play, X } from 'lucide-react';
import { ASSETS } from '../assets.js';
import { advanceSpring } from '../motion/spring.js';
import { planTourLayout, tourPointerTip } from '../motion/tour-layout.js';
import { usePrivacyNotice } from '../privacy/PrivacyContext.jsx';
import PrivacyNotice from './PrivacyNotice.jsx';
import './WelcomeExperience.css';

const TourContext = createContext(() => {});
export const useSiteTour = () => useContext(TourContext);

const WELCOME_SEEN_KEY = 'surfare-welcome-seen';
let welcomeSeenThisPage = false;

function hasSeenWelcome() {
  if (welcomeSeenThisPage) return true;
  for (const name of ['localStorage', 'sessionStorage']) {
    try { if (window[name].getItem(WELCOME_SEEN_KEY) === 'true') return true; } catch { /* Storage may be unavailable. */ }
  }
  return false;
}

function rememberWelcome() {
  welcomeSeenThisPage = true;
  for (const name of ['localStorage', 'sessionStorage']) {
    try { window[name].setItem(WELCOME_SEEN_KEY, 'true'); } catch { /* Keep the in-memory fallback. */ }
  }
}

const STEPS = [
  { target: '.hero-title-highlight', key: 'welcome', text: true, view: '#top' },
  { target: '.language-control', key: 'settings', view: '#top' },
  { target: '.check-tabs', point: '.check-tab.is-active', key: 'detectors', view: '.check-card' },
  { target: '.tab-panel textarea, .upload-area', key: 'input', view: '.check-form-column' },
  { target: '.result-cap h2', fallback: '.check-button', key: 'result', text: true, view: '.result-panel' },
  { target: '.surfy-launcher, .surfy-unhide', key: 'surfy' },
  { target: '.nav-guide-link', fallback: '.nav-mobile-menu', key: 'lifeguard', view: '#top' },
  { target: '.connection-status', key: 'offline', view: '#top' },
  { target: '.practice-intro .practice-primary', key: 'practice', view: '.practice-intro' },
  { target: '.privacy-toggle', key: 'privacy', view: '#privacy' },
];

function GuideCursor({ cursorRef, className = '' }) {
  return (
    <div className={`surfy-cursor ${className}`} ref={cursorRef} aria-hidden="true">
      <svg viewBox="0 0 28 32"><path d="M3 2 24 18 14 20 10 30Z" /></svg>
      <span className="cursor-avatar"><AnimatedMascot src={ASSETS.surfyPoint} alt="" /></span>
      <span className="cursor-name">Surfy</span>
    </div>
  );
}

export default function WelcomeExperience({ children, t, skipIntro = false }) {
  const { notice, hasAcknowledged, requestAcknowledgment } = usePrivacyNotice();
  const initialPrivacyRequested = useRef(false);
  const [firstVisit] = useState(() => !skipIntro && !hasSeenWelcome());
  const [phase, setPhase] = useState(firstVisit ? 'intro' : 'ready');
  const [tourActive, setTourActive] = useState(false);
  const [tourClosing, setTourClosing] = useState(false);
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(reduced);
  const [interacting, setInteracting] = useState(false);
  const [pageHidden, setPageHidden] = useState(document.hidden);
  const [dockHeight, setDockHeight] = useState(190);
  const [cardWidth, setCardWidth] = useState(300);
  const [invitePhase, setInvitePhase] = useState('hidden');
  const dialogRef = useRef(null);
  const wordmarkRef = useRef(null);
  const introCursorRef = useRef(null);
  const jumpingSurfyRef = useRef(null);
  const shadowRef = useRef(null);
  const inviteRef = useRef(null);
  const inviteChoiceRef = useRef(false);
  const travelRef = useRef(null);
  const goalRef = useRef({ x: 16, y: 80 });
  const pointerRef = useRef(null);
  const scrollTravelRef = useRef(null);
  const connectorRef = useRef(null);
  const dockRef = useRef(null);
  const pageRef = useRef(null);
  const focusReturnRef = useRef(null);
  const runTourAfterIntro = useRef(firstVisit);
  const currentStep = STEPS[step];
  const isPaused = paused || interacting || pageHidden || tourClosing || Boolean(notice);

  useEffect(() => {
    const leavePage = () => {
      // A browser Back action can restore this document from memory without remounting React.
      runTourAfterIntro.current = false;
      setPhase('ready');
      setInvitePhase('hidden');
      setTourActive(false);
      setTourClosing(false);
    };
    const restorePage = (event) => { if (event.persisted) leavePage(); };
    window.addEventListener('pagehide', leavePage);
    window.addEventListener('pageshow', restorePage);
    return () => {
      window.removeEventListener('pagehide', leavePage);
      window.removeEventListener('pageshow', restorePage);
    };
  }, []);

  useEffect(() => {
    if (!hasAcknowledged) {
      setTourActive(false);
      setInvitePhase('hidden');
    }
  }, [hasAcknowledged]);

  const startTour = useCallback(async () => {
    if (!await requestAcknowledgment()) return;
    focusReturnRef.current = document.activeElement;
    setStep(0);
    setPaused(reduced);
    setInteracting(false);
    setTourClosing(false);
    travelRef.current = null;
    scrollTravelRef.current = null;
    window.scrollTo({ top: 0, behavior: 'instant' });
    setTourActive(true);
  }, [reduced, requestAcknowledgment]);

  const finishIntro = useCallback((withTour = true) => {
    rememberWelcome();
    runTourAfterIntro.current = withTour;
    setPhase((current) => current === 'intro' ? 'opening' : current);
  }, []);

  const finishTour = useCallback(() => {
    setTourClosing(true);
  }, []);

  useEffect(() => {
    if (!tourClosing) return undefined;
    const timer = window.setTimeout(() => {
      const hadFocus = dockRef.current?.contains(document.activeElement);
      setTourActive(false);
      setTourClosing(false);
      if (hadFocus) {
        const fallback = focusReturnRef.current;
        if (fallback?.isConnected && fallback !== document.body) fallback.focus({ preventScroll: true });
        else document.querySelector('.hero-primary')?.focus({ preventScroll: true });
      }
    }, reduced ? 0 : 460);
    return () => window.clearTimeout(timer);
  }, [tourClosing, reduced]);

  const nextStep = useCallback(() => {
    if (step === STEPS.length - 1) finishTour();
    else setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }, [step, finishTour]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(media.matches); if (media.matches) setPaused(true); };
    const visibility = () => setPageHidden(document.hidden);
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useLayoutEffect(() => {
    if (phase === 'ready') return undefined;
    const dialog = dialogRef.current;
    if (!dialog.open) { dialog.showModal(); dialog.focus({ preventScroll: true }); }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'intro') return undefined;
    if (reduced) {
      const timer = window.setTimeout(() => finishIntro(), 1600);
      return () => window.clearTimeout(timer);
    }
    const title = wordmarkRef.current.getBoundingClientRect();
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    // The portfolio's sampled curve keeps the cursor moving without stops.
    const start = { x: title.left - 65, y: title.bottom + 115 };
    const end = { x: title.right + 10, y: title.bottom + 18 };
    const c1 = { x: title.left + title.width * .35, y: title.bottom + 18 };
    const c2 = { x: title.right + 70, y: title.bottom + 100 };
    const frames = Array.from({ length: 81 }, (_, index) => {
      const position = index / 80;
      const u = position ** 3 * (position * (position * 6 - 15) + 10);
      const v = 1 - u;
      const x = v ** 3 * start.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u ** 3 * end.x;
      const y = v ** 3 * start.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u ** 3 * end.y;
      return {
        transform: `translate3d(${clamp(x, 16, innerWidth - 76)}px, ${clamp(y, 16, innerHeight - 85)}px, 0) rotate(${-7 * (1 - u)}deg)`,
        opacity: Math.min(1, position * 5), offset: position,
      };
    });
    const animation = introCursorRef.current.animate(frames, { duration: 2500, easing: 'linear', fill: 'forwards' });
    const hopFrames = Array.from({ length: 161 }, (_, index) => {
      const time = index / 160;
      const point = (p) => ({
        x: -80 * Math.cos(1.5 * Math.PI * p) * (1 - p * .35),
        y: -48 * Math.abs(Math.sin(3 * Math.PI * p)) * (1 - p * .4),
      });
      const current = point(time);
      const previous = point(Math.max(0, time - 1 / 160));
      const vx = (current.x - previous.x) * 160 / 2.6;
      const vy = (current.y - previous.y) * 160 / 2.6;
      const blur = index === 160 ? 0 : Math.min(1.5, Math.hypot(vx, vy) * .004);
      return {
        offset: time,
        opacity: Math.min(1, time * 10),
        transform: `translate3d(${current.x}px, ${current.y}px, 0) rotate(${Math.max(-8, Math.min(8, vx * .045))}deg)`,
        filter: `blur(${blur}px)`,
      };
    });
    const hop = jumpingSurfyRef.current.animate(hopFrames, { duration: 2600, easing: 'linear', fill: 'forwards' });
    const shadow = shadowRef.current.animate(hopFrames.map((frame) => {
      const time = frame.offset;
      const x = -80 * Math.cos(1.5 * Math.PI * time) * (1 - time * .35);
      const height = Math.abs(Math.sin(3 * Math.PI * time)) * (1 - time * .4);
      return { offset: time, transform: `translateX(${x}px) scaleX(${1 - height * .5})`, opacity: .85 - height * .5 };
    }), { duration: 2600, easing: 'linear', fill: 'forwards' });
    const timer = window.setTimeout(() => finishIntro(), 2750);
    return () => { animation.cancel(); hop.cancel(); shadow.cancel(); window.clearTimeout(timer); };
  }, [phase, reduced, finishIntro]);

  useEffect(() => {
    if (phase !== 'opening') return undefined;
    const timer = window.setTimeout(() => {
      setPhase('ready');
    }, reduced ? 0 : 600);
    return () => window.clearTimeout(timer);
  }, [phase, reduced, startTour]);

  useEffect(() => {
    if (phase !== 'ready' || initialPrivacyRequested.current) return;
    initialPrivacyRequested.current = true;
    void requestAcknowledgment().then((accepted) => {
      if (accepted && runTourAfterIntro.current) setInvitePhase('open');
    });
  }, [phase, requestAcknowledgment]);

  useLayoutEffect(() => {
    if (!tourActive) return undefined;
    const inner = dockRef.current.querySelector('.tour-dock-inner');
    const measure = () => setDockHeight(Math.min(Math.ceil(inner.getBoundingClientRect().height) + 2, Math.max(180, (window.visualViewport?.height ?? innerHeight) - 88)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [tourActive]);

  useLayoutEffect(() => {
    if (invitePhase === 'hidden') return undefined;
    const dialog = inviteRef.current;
    if (!dialog.open) { dialog.showModal(); dialog.focus({ preventScroll: true }); }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previous; };
  }, [invitePhase]);

  useEffect(() => {
    if (invitePhase !== 'closing') return undefined;
    const timer = window.setTimeout(() => {
      setInvitePhase('hidden');
      if (inviteChoiceRef.current) startTour();
    }, reduced ? 0 : 360);
    return () => window.clearTimeout(timer);
  }, [invitePhase, reduced, startTour]);

  const chooseTour = (accepted) => {
    inviteChoiceRef.current = accepted;
    setInvitePhase('closing');
  };

  useEffect(() => {
    if (!tourActive || tourClosing || notice) {
      scrollTravelRef.current = null;
      return undefined;
    }
    const candidate = pageRef.current.querySelector(currentStep.target);
    const target = candidate?.getClientRects().length ? candidate
      : currentStep.fallback && pageRef.current.querySelector(currentStep.fallback);
    if (!target) { nextStep(); return undefined; }
    target.dataset.tourFocus = 'true';
    const reflow = () => {
      const text = t('tour.' + currentStep.key + '.body');
      const width = Math.floor(Math.min(innerWidth - 32, Math.max(264, Math.min(350, Math.round(232 + Math.sqrt(text.length) * 8)))));
      setCardWidth(width);
      const vh = window.visualViewport?.height ?? innerHeight;
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const pointed = (currentStep.point && pageRef.current.querySelector(currentStep.point)) || target;
      const initial = pointed.getBoundingClientRect();
      const obstacles = [...pageRef.current.querySelectorAll('button, a[href], textarea, select')]
        .filter((element) => element !== pointed && getComputedStyle(element).visibility !== 'hidden')
        .map((element) => ({ rect: element.getBoundingClientRect(), sticky: Boolean(element.closest('.site-header')), control: true }))
        .filter(({ rect }) => rect.width > 8 && rect.height > 8);
      const best = planTourLayout({
        target: initial, scrollY: window.scrollY, viewportWidth: innerWidth, viewportHeight: vh,
        headerBottom: header.bottom, cardWidth: width, cardHeight: dockHeight,
        maxScroll: Math.max(0, document.documentElement.scrollHeight - vh),
        sticky: Boolean(pointed.closest('.site-header')), obstacles,
      });
      if (!best) return;
      goalRef.current = { x: best.x, y: best.y };
      if (reduced) {
        window.scrollTo({ top: best.scroll, behavior: 'instant' });
        scrollTravelRef.current = null;
      } else if (!scrollTravelRef.current || Math.abs(scrollTravelRef.current.target - best.scroll) > 1) {
        // Reset momentum when the destination changes. Critical damping avoids overshooting the target.
        scrollTravelRef.current = { position: window.scrollY, velocity: 0, target: Math.round(best.scroll), damping: 34 };
      }
    };
    reflow();
    const settleTimer = window.setTimeout(reflow, reduced ? 0 : 500);
    const layoutObserver = new ResizeObserver(reflow);
    layoutObserver.observe(target);
    layoutObserver.observe(pageRef.current);
    let active = true;
    document.fonts?.ready.then(() => { if (active) reflow(); });
    let frameId;
    let lastTime;
    const draw = (now) => {
      const card = dockRef.current;
      const { x:goalX, y:goalY } = goalRef.current;
      const dt = Math.min(32, now - (lastTime ?? now)) / 1000;
      const scroll = scrollTravelRef.current;
      if (scroll && !reduced) {
        const next = advanceSpring(scroll.position, scroll.velocity, scroll.target, dt, scroll.damping);
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        const position = Math.max(0, Math.min(maxScroll, next.position));
        scrollTravelRef.current = { ...scroll, position, velocity: position === next.position ? next.velocity : 0 };
        // Keep scrolling monotonic and drive the real position so the pointer stays aligned.
        if (Math.abs(window.scrollY - position) > .1) window.scrollTo({ top: position, behavior: 'instant' });
      }
      const old = travelRef.current ?? { x: goalX + (reduced ? 0 : 24), y: goalY + (reduced ? 0 : 16) };
      const nextX = reduced ? { position: goalX, velocity: 0 } : advanceSpring(old.x, old.vx ?? 0, goalX, dt);
      const nextY = reduced ? { position: goalY, velocity: 0 } : advanceSpring(old.y, old.vy ?? 0, goalY, dt);
      const viewportHeight = window.visualViewport?.height ?? innerHeight;
      const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
      const x = Math.max(12, Math.min(innerWidth - cardWidth - 12, nextX.position));
      const y = Math.max(headerBottom + 8, Math.min(viewportHeight - dockHeight - 8, nextY.position));
      const speed = Math.hypot(nextX.velocity, nextY.velocity);
      const distance = Math.hypot(goalX - x, goalY - y);
      card.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
      card.style.filter = reduced ? 'none' : 'blur(' + Math.min(2, speed * .003) + 'px)';
      card.style.opacity = '1';
      // Browsers quantize scrolling to device pixels; don't lock the controls on a subpixel remainder.
      const scrolling = scrollTravelRef.current && Math.abs(window.scrollY - scrollTravelRef.current.target) > 2;
      card.dataset.travelling = distance > 4 || speed > 24 || scrolling ? 'true' : 'false';
      travelRef.current = { x, y, vx: x === nextX.position ? nextX.velocity : 0, vy: y === nextY.position ? nextY.velocity : 0 };
      const pointedElement = (currentStep.point && pageRef.current.querySelector(currentStep.point)) || target;
      let targetRect = pointedElement.getBoundingClientRect();
      if (currentStep.text) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const lines = [...range.getClientRects()];
        targetRect = lines[lines.length - 1] || range.getBoundingClientRect();
      }
      // The SVG tip is at (3, 2); account for it so the tip, not its box,
      // lands on the highlighted text or control, even during a resize.
      const tip = tourPointerTip(targetRect, innerWidth, window.visualViewport?.height ?? innerHeight);
      // Track the real target each frame; a second spring would lag behind the scrolling page.
      const px = tip.x;
      const py = tip.y;
      pointerRef.current.style.transform = `translate3d(${px - 3}px, ${py - 2}px, 0)`;
      pointerRef.current.style.opacity = targetRect.bottom - 4 >= 0 && targetRect.bottom - 4 <= viewportHeight && targetRect.right - 4 <= innerWidth ? '1' : '0';
      const startX = x + 40;
      const startY = y + 42;
      connectorRef.current.setAttribute('d', `M ${startX} ${startY} C ${startX} ${(startY + py) / 2}, ${px} ${(startY + py) / 2}, ${px} ${py}`);
      lastTime = now;
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    window.addEventListener('resize', reflow);
    window.visualViewport?.addEventListener('resize', reflow);
    return () => {
      delete target.dataset.tourFocus;
      cancelAnimationFrame(frameId);
      active = false;
      layoutObserver.disconnect();
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', reflow);
      window.visualViewport?.removeEventListener('resize', reflow);
    };
  }, [tourActive, tourClosing, notice, currentStep, step, dockHeight, cardWidth, reduced, nextStep, t]);

  useEffect(() => {
    if (!tourActive || isPaused) return undefined;
    const timer = window.setTimeout(nextStep, 7500);
    return () => window.clearTimeout(timer);
  }, [tourActive, step, isPaused, nextStep]);

  useEffect(() => {
    if (!tourActive) return undefined;
    const inTour = (target) => target instanceof Element && target.closest('.surfare-tour-dock, [data-tour-start]');
    const browse = (event) => { if (!inTour(event.target)) finishTour(); };
    const keydown = (event) => {
      if (event.key === 'Escape') finishTour();
      else if (!inTour(event.target) && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) finishTour();
    };
    const focus = (event) => {
      if (inTour(event.target)) return;
      if (event.target.matches('input, textarea, select')) finishTour();
      else setPaused(true);
    };
    document.addEventListener('pointerdown', browse);
    document.addEventListener('wheel', browse, { passive: true });
    document.addEventListener('touchmove', browse, { passive: true });
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focus);
    return () => {
      document.removeEventListener('pointerdown', browse);
      document.removeEventListener('wheel', browse);
      document.removeEventListener('touchmove', browse);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focus);
    };
  }, [tourActive, finishTour]);

  return (
    <TourContext.Provider value={startTour}>
      <div className={`site-experience is-${phase}${tourActive ? ' is-touring' : ''}${tourClosing ? ' is-tour-closing' : ''}`} style={{ '--tour-space': `${dockHeight}px`, '--tour-width': `${cardWidth}px` }}>
        <div className="experience-page" ref={pageRef}>{children}</div>
        {notice && <PrivacyNotice t={t} reduced={reduced} key={`${notice}-${hasAcknowledged}`} />}
        {phase !== 'ready' && (
          <dialog className={`surfare-intro${phase === 'opening' ? ' is-opening' : ''}`} ref={dialogRef}
            tabIndex={-1} aria-labelledby="intro-title" onCancel={(event) => { event.preventDefault(); finishIntro(false); }}>
            <div className="intro-content">
              <p className="intro-eyebrow">{t('intro.eyebrow')}</p>
              <h2 className="intro-wordmark" id="intro-title" ref={wordmarkRef}>
                <img src={ASSETS.appIcon} alt="" width="72" height="72" />
                <span>Surfare</span>
                <i className="intro-handle handle-tl" aria-hidden="true" /><i className="intro-handle handle-tr" aria-hidden="true" />
                <i className="intro-handle handle-bl" aria-hidden="true" /><i className="intro-handle handle-br" aria-hidden="true" />
              </h2>
              <p className="intro-tagline">{t('intro.tagline')}</p>
              <div className="intro-surfy-stage" aria-hidden="true">
                <span className="intro-surfy-shadow" ref={shadowRef} />
                <AnimatedMascot className="intro-surfy" ref={jumpingSurfyRef} src={ASSETS.surfyCheer} alt="" width="120" height="120" />
              </div>
            </div>
            <GuideCursor cursorRef={introCursorRef} className="intro-cursor" />
            <button className="intro-skip" onClick={() => finishIntro()}>{t('intro.skip')}</button>
          </dialog>
        )}
        {invitePhase !== 'hidden' && (
          <dialog className={'tour-invite' + (invitePhase === 'closing' ? ' is-closing' : '')} ref={inviteRef}
            tabIndex={-1} aria-labelledby="tour-invite-title" aria-describedby="tour-invite-description"
            onCancel={(event) => { event.preventDefault(); chooseTour(false); }}>
            <span className="invite-face" aria-hidden="true"><AnimatedMascot src={ASSETS.surfyPoint} alt="" /></span>
            <p className="invite-eyebrow">{t('tour.invite.eyebrow')}</p>
            <h2 id="tour-invite-title">{t('tour.invite.title')}</h2>
            <p id="tour-invite-description">{t('tour.invite.body')}</p>
            <div className="invite-actions">
              <button className="invite-accept" type="button" onClick={() => chooseTour(true)}>{t('tour.invite.accept')}</button>
              <button className="invite-decline" type="button" onClick={() => chooseTour(false)}>{t('tour.invite.decline')}</button>
            </div>
          </dialog>
        )}
        {tourActive && (
          <>
            <svg className="tour-connector" aria-hidden="true"><path ref={connectorRef} /></svg>
            <GuideCursor cursorRef={pointerRef} className="tour-cursor" />
            <aside className="surfare-tour-dock" ref={dockRef} aria-label={t('tour.label')}
              onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
              onFocusCapture={() => setInteracting(true)}
              onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}>
              <div className="tour-dock-inner">
                <span className="tour-face" aria-hidden="true"><AnimatedMascot src={ASSETS.surfyPoint} alt="" /></span>
                <div className="tour-message" key={step}>
                  <p className="tour-step-count">Surfy · {step + 1} / {STEPS.length}</p>
                  <h2>{t(`tour.${currentStep.key}.title`)}</h2>
                  <p>{t(`tour.${currentStep.key}.body`)}</p>
                </div>
                <div className="tour-controls">
                  <button className="tour-skip" onClick={finishTour}><X size={15} aria-hidden="true" />{t('tour.skip')}</button>
                  <button className="tour-back" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} aria-label={t('tour.back')}><ChevronLeft size={18} /></button>
                  <button className="tour-pause" onClick={() => setPaused((value) => !value)} aria-label={t(paused ? 'tour.play' : 'tour.pause')}>
                    {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}<span>{t(paused ? 'tour.play' : 'tour.pause')}</span>
                  </button>
                  <button className="tour-next" onClick={nextStep}>{t(step === STEPS.length - 1 ? 'tour.done' : 'tour.next')}</button>
                </div>
              </div>
              <div className="tour-progress" key={`${step}-${paused}`} aria-hidden="true"><span style={{ animationPlayState: isPaused ? 'paused' : 'running' }} /></div>
            </aside>
            <p className="sr-only" role="status">{`${step + 1} / ${STEPS.length}. ${t(`tour.${currentStep.key}.title`)} ${t(`tour.${currentStep.key}.body`)}`}</p>
          </>
        )}
      </div>
    </TourContext.Provider>
  );
}
