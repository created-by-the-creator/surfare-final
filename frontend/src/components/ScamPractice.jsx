import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Check, CheckCircle2, Circle, CircleHelp, Coins, Gamepad2, Package, Phone, RotateCcw, Search, ShieldCheck, Sparkles, Star, Trophy, WifiOff, X } from 'lucide-react';
import { ASSETS } from '../assets.js';
import { MISSIONS, PRACTICE_COPY, SENDER_LABELS, localize } from '../training/content.js';
import { answerMission, completeMission, continueMission, readProgress, startMission, writeProgress } from '../training/engine.js';
import { PRACTICE_CLUES, splitPracticeMessage } from '../training/inspection.js';
import './ScamPractice.css';

const ICONS = { wallet: ShieldCheck, coins: Coins, package: Package, briefcase: Briefcase, shield: ShieldCheck, phone: Phone };

function PracticeDialog({ mission, lang, onClose, onComplete }) {
  const copy = PRACTICE_COPY[lang] || PRACTICE_COPY.en;
  const text = (value) => localize(value, lang);
  const [state, setState] = useState(() => startMission(mission));
  const [inspection, setInspection] = useState('');
  const dialogRef = useRef(null);
  const focusRef = useRef(null);
  const id = useId();
  const step = mission.steps[state.step];
  const sender = text(SENDER_LABELS[step.sender]);
  const isComplete = state.phase === 'complete';
  const clue = text(PRACTICE_CLUES[mission.id][state.step]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => { focusRef.current?.focus({ preventScroll: true }); }, [state.step, state.phase]);

  const next = () => {
    setInspection('');
    const updated = continueMission(mission, state);
    setState(updated);
    if (updated.phase === 'complete') onComplete(mission, updated);
  };

  return createPortal(
    <dialog className="practice-dialog" ref={dialogRef} aria-labelledby={`${id}-title`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <button className="practice-close" onClick={onClose} type="button" aria-label={copy.close}><X size={19} aria-hidden="true" /></button>
      <div className="practice-dialog-top">
        <span className="practice-brand"><Gamepad2 size={20} aria-hidden="true" /> Surfy's Scam Challenge</span>
        <span className="practice-score"><Star size={16} aria-hidden="true" /> {state.score} / {mission.steps.length * 10}</span>
      </div>
      <div className="practice-game-layout">
        <aside className="practice-coach">
          <p className="practice-kicker">{text(mission.category)}</p>
          <h2 id={`${id}-title`}>{text(mission.title)}</h2>
          <img src={isComplete || state.correct ? ASSETS.surfyCheer : state.phase === 'feedback' ? ASSETS.surfyMagnify : ASSETS.surfyTablet} alt="" width="1000" height="1000" />
          <div className="practice-coach-tip"><Sparkles size={17} aria-hidden="true" /><p>{isComplete ? text(mission.lesson) : copy.about}</p></div>
        </aside>
        <div className="practice-play-area">
          {isComplete ? (
            <div className="practice-result">
              <span className="practice-trophy"><Trophy size={36} aria-hidden="true" /></span>
              <p className="practice-kicker">{copy.done}</p>
              <h3 ref={focusRef} tabIndex={-1}>{copy.resultTitle}</h3>
              <p className="practice-result-score">{state.score}<span> / {mission.steps.length * 10} {copy.points}</span></p>
              <p>{copy.resultBody}</p>
              <div className="practice-result-lesson"><strong>{copy.tip}</strong><p>{text(mission.lesson)}</p></div>
              <button className="practice-primary" type="button" onClick={onClose}>{copy.another}</button>
              <button className="practice-text-button" type="button" onClick={() => { setInspection(''); setState(startMission(mission)); }}><RotateCcw size={16} aria-hidden="true" />{copy.replay}</button>
              <small>{copy.saved}</small>
            </div>
          ) : (
            <>
              <div className="practice-step-meta"><span>{copy.step} {state.step + 1} {copy.of} {mission.steps.length}</span><span>{copy.inbox}</span></div>
              <progress className="practice-progress" max={mission.steps.length} value={state.step + (state.correct ? 1 : 0)} aria-label={copy.progress} />
              <div className="practice-message">
                <div className="practice-message-sender"><span aria-hidden="true">{sender.slice(0, 1)}</span><strong>{sender}</strong>
                  <button className="practice-inspect-sender" type="button" aria-label={copy.inspectSender}
                    aria-expanded={inspection === 'sender'} aria-controls={`${id}-inspection`}
                    onClick={() => setInspection(inspection === 'sender' ? '' : 'sender')}><Search size={18} aria-hidden="true" /></button>
                </div>
                <p className="practice-fictional">{copy.fictional}</p>
                <p className="practice-message-body">{splitPracticeMessage(text(step.message), clue).map((part, index) => part.inspectable ? (
                  <button className="practice-clue" type="button" key={index} aria-expanded={inspection === 'message'} aria-controls={`${id}-inspection`}
                    onClick={() => setInspection(inspection === 'message' ? '' : 'message')}>{part.text}</button>
                ) : <span key={index}>{part.text}</span>)}</p>
                <p className="practice-inspection-hint"><Search size={15} aria-hidden="true" />{copy.inspectHint}</p>
              </div>
              <div id={`${id}-inspection`} className="practice-inspection" role="region" aria-label={copy.closerLook} hidden={!inspection}>
                <strong><Search size={17} aria-hidden="true" />{copy.closerLook}</strong>
                <p>{inspection === 'sender' ? copy.senderNote : text(step.explanation)}</p>
              </div>
              {state.phase === 'feedback' && <div className="practice-action-receipt"><span>{copy.youChose}: {text(step.options[state.selected])}</span></div>}
              <h3 className="practice-question" id={`${id}-question`} ref={state.phase === 'question' ? focusRef : null} tabIndex={-1}>{copy.choose}</h3>
              <div className="practice-options" role="group" aria-labelledby={`${id}-question`}>
                {step.options.map((option, index) => {
                  const rejected = state.rejected.includes(index);
                  const selected = state.selected === index;
                  return (
                    <button key={`${state.step}-${index}`} className={`practice-option${selected ? state.correct ? ' is-right' : ' is-wrong' : ''}${rejected && !selected ? ' is-rejected' : ''}`}
                      type="button" disabled={state.phase !== 'question' || rejected}
                      onClick={() => setState((current) => answerMission(mission, current, index))}>
                      <span className="practice-option-marker" aria-hidden="true">{selected && state.correct ? <Check size={15} /> : <Circle size={12} />}</span>
                      <span>{text(option)}</span>
                    </button>
                  );
                })}
              </div>
              {state.phase === 'feedback' && (
                <div className={`practice-feedback${state.correct ? ' is-right' : ''}`} ref={focusRef} tabIndex={-1} role="status">
                  <div>{state.correct ? <CheckCircle2 size={20} aria-hidden="true" /> : <CircleHelp size={20} aria-hidden="true" />}<strong>{state.correct ? copy.correct : copy.incorrect}</strong></div>
                  <p>{text(step.explanation)}</p>
                  <button className="practice-primary" type="button" onClick={next}>{!state.correct ? copy.retry : state.step === mission.steps.length - 1 ? copy.finish : copy.next}</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>, document.body,
  );
}

export default function ScamPractice({ lang }) {
  const copy = PRACTICE_COPY[lang] || PRACTICE_COPY.en;
  const text = (value) => localize(value, lang);
  const [missionId, setMissionId] = useState('');
  const [progress, setProgress] = useState(() => {
    try { return readProgress(window.localStorage, MISSIONS); } catch { return {}; }
  });
  const [resetNotice, setResetNotice] = useState(false);
  const mission = MISSIONS.find((item) => item.id === missionId);
  const completed = Object.keys(progress).length;
  const onComplete = (completedMission, state) => {
    setProgress((current) => {
      const updated = completeMission(current, completedMission, state);
      try { writeProgress(window.localStorage, updated); } catch { /* Storage may be disabled. */ }
      return updated;
    });
  };

  return (
    <section className="practice-section" id="practice" aria-labelledby="practice-title">
      <div className="page-container">
        <div className="practice-intro">
          <div className="practice-intro-copy">
            <p className="section-eyebrow">{copy.eyebrow}</p>
            <h2 id="practice-title">{copy.title}</h2>
            <p>{copy.description}</p>
            <button className="practice-primary" type="button" onClick={() => setMissionId((MISSIONS.find((item) => progress[item.id] === undefined) || MISSIONS[0]).id)}><Gamepad2 size={20} aria-hidden="true" />{copy.play}</button>
            <div className="practice-features"><span><ShieldCheck size={16} aria-hidden="true" />{copy.free}</span><span><WifiOff size={16} aria-hidden="true" />{copy.offline}</span></div>
          </div>
          <div className="practice-intro-art" aria-hidden="true">
            <span className="practice-art-orbit" />
            <img src={ASSETS.surfySurfingLeft} alt="" width="1000" height="1000" loading="lazy" />
          </div>
        </div>
        <div className="practice-collection-heading"><h3>{copy.collection}</h3><span><CheckCircle2 size={17} aria-hidden="true" />{completed} / {MISSIONS.length} {copy.completed}</span></div>
        <div className="practice-missions">
          {MISSIONS.map((item) => {
            const Icon = ICONS[item.icon];
            const done = progress[item.id] !== undefined;
            return (
              <button className={`practice-mission${done ? ' is-complete' : ''}`} key={item.id} type="button" onClick={() => setMissionId(item.id)}>
                <span className="practice-mission-icon"><Icon size={23} aria-hidden="true" /></span>
                <span className="practice-mission-copy"><small>{text(item.category)}</small><strong>{text(item.title)}</strong><span>{done ? `${copy.best}: ${progress[item.id]} / ${item.steps.length * 10}` : copy.decisions}</span></span>
                {done ? <CheckCircle2 className="practice-mission-check" size={19} aria-label={copy.done} />
                  : <Gamepad2 className="practice-mission-arrow" size={18} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="practice-footer"><p>{copy.saved}</p>{completed > 0 && <button className="practice-text-button" type="button" onClick={() => { setProgress({}); setResetNotice(true); try { writeProgress(window.localStorage, {}); } catch { /* Session only. */ } }}>{copy.clear}</button>}<span className="visually-hidden" role="status">{resetNotice ? copy.reset : ''}</span></div>
      </div>
      {mission && <PracticeDialog key={mission.id} mission={mission} lang={lang} onClose={() => setMissionId('')} onComplete={onComplete} />}
    </section>
  );
}
