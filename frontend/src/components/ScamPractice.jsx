import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, CheckCircle2, CircleHelp, Coins, Gamepad2, Package, Phone, RotateCcw, Search, ShieldCheck, Shell, Star, Trophy, WifiOff, X } from 'lucide-react';
import SurfRun, { RUN_COPY } from './SurfRun.jsx';
import SurfyRider, { BoardArt } from './SurfyRider.jsx';
import { MISSIONS, PRACTICE_COPY, SENDER_LABELS, localize } from '../training/content.js';
import { BOARD_KEY, BOARD_UNLOCKS, answerMission, availableBoard, completeMission, continueMission, readProgress, routeStars, startMission, surfProfile, writeProgress } from '../training/engine.js';
import { SURF_COPY } from '../training/surf-content.js';
import { PRACTICE_CLUES, splitPracticeMessage } from '../training/inspection.js';
import './ScamPractice.css';

const ICONS = { wallet: ShieldCheck, coins: Coins, package: Package, briefcase: Briefcase, shield: ShieldCheck, phone: Phone };

function RouteStars({ score, label }) {
  return <span className="surf-stars" role="img" aria-label={`${routeStars(score)} / 3 ${label}`}>{[1, 2, 3].map(star => <Star key={star} size={22} className={star <= routeStars(score) ? 'is-earned' : ''} aria-hidden="true" />)}</span>;
}

function PracticeDialog({ mission, lang, board, progress, onClose, onComplete, onNext }) {
  const copy = PRACTICE_COPY[lang] || PRACTICE_COPY.en;
  const surf = SURF_COPY[lang] || SURF_COPY.en;
  const text = (value) => localize(value, lang);
  const [state, setState] = useState(() => startMission(mission));
  const [inspection, setInspection] = useState('');
  const [reward, setReward] = useState(null);
  const [riding, setRiding] = useState(false);
  const [shells, setShells] = useState(0);
  const collectedSteps = useRef(new Set());
  const dialogRef = useRef(null);
  const focusRef = useRef(null);
  const id = useId();
  const step = mission.steps[state.step];
  const sender = text(SENDER_LABELS[step.sender]);
  const isComplete = state.phase === 'complete';
  const clue = text(step.clue || PRACTICE_CLUES[mission.id][state.step]);

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

  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
    if (state.phase === 'feedback') focusRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    else dialogRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [state.step, state.phase]);

  const next = () => {
    setInspection('');
    const updated = continueMission(mission, state);
    setState(updated);
    if (updated.step !== state.step) setRiding(false);
    if (updated.phase === 'complete') {
      const before = surfProfile(progress, MISSIONS);
      const after = surfProfile(completeMission(progress, mission, updated), MISSIONS);
      setReward({ xp: after.xp - before.xp, level: after.level, newBoard: BOARD_UNLOCKS.findIndex(count => count > before.completed && count <= after.completed) });
      onComplete(mission, updated);
    }
  };

  return createPortal(
    <dialog className="practice-dialog" ref={dialogRef} aria-labelledby={`${id}-title`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')].filter(button => button.getClientRects().length);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <div className="practice-dialog-top">
        <button className="practice-close" onClick={onClose} type="button" aria-label={copy.close}><X size={19} aria-hidden="true" /></button>
        <span className="practice-brand"><Gamepad2 size={20} aria-hidden="true" />{surf.brand}</span>
        <span className="practice-score"><Star size={16} aria-hidden="true" /> {state.score} / {mission.steps.length * 10}</span>
      </div>
      <div className="practice-game-layout surf-school-layout">
        <aside className="practice-coach">
          <p className="practice-kicker">{text(mission.category)}</p>
          <h2 id={`${id}-title`}>{text(mission.title)}</h2>
        </aside>
        <div className="practice-play-area">
          {isComplete ? (
            <div className="practice-result">
              <span className="practice-trophy"><Trophy size={36} aria-hidden="true" /></span>
              <p className="practice-kicker">{surf.finish}</p>
              <h3 ref={focusRef} tabIndex={-1}>{state.score === 50 ? surf.perfect : state.score >= 40 ? surf.silver : surf.bronze}</h3>
              <RouteStars score={state.score} label={surf.stars} />
              <p className="surf-session-shells"><Shell size={20} aria-hidden="true" />{shells} {(RUN_COPY[lang] || RUN_COPY.en).total}</p>
              <p className="practice-result-score">{state.score}<span> / {mission.steps.length * 10} {copy.points}</span></p>
              <div className="surf-reward"><strong>+{reward?.xp || 0} {surf.earned}</strong><span>{surf.level} {reward?.level || 1} · {surf.ranks[(reward?.level || 1) - 1]}</span>{reward?.newBoard > 0 && <span>🏄 {surf.equip}: {surf.boards[reward.newBoard]}</span>}</div>
              <p>{surf.improve}</p>
              <div className="practice-result-lesson"><strong>{copy.tip}</strong><p>{text(mission.lesson)}</p></div>
              <button className="practice-primary" type="button" onClick={onNext}>{surf.next}</button>
              <button className="practice-text-button" type="button" onClick={onClose}>{copy.another}</button>
              <button className="practice-text-button" type="button" onClick={() => { setInspection(''); setReward(null); setRiding(false); setShells(0); collectedSteps.current.clear(); setState(startMission(mission)); }}><RotateCcw size={16} aria-hidden="true" />{copy.replay}</button>
              <small>{surf.saved}</small>
            </div>
          ) : (
            <>
              <div className="practice-step-meta"><span>{copy.step} {state.step + 1} {copy.of} {mission.steps.length}</span><span>{copy.inbox}</span></div>
              <progress className="practice-progress" max={mission.steps.length} value={state.step + (state.correct ? 1 : 0)} aria-label={copy.progress} />
              <div className="practice-message" hidden={riding}>
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
              <div id={`${id}-inspection`} className="practice-inspection" role="region" aria-label={copy.closerLook} hidden={!inspection || riding}>
                <strong><Search size={17} aria-hidden="true" />{copy.closerLook}</strong>
                <p>{inspection === 'sender' ? copy.senderNote : text(step.explanation)}</p>
              </div>
              <SurfRun key={state.step} lang={lang} board={board} step={step} state={state} text={text}
                onStart={() => setRiding(true)} onRead={() => { setRiding(false); dialogRef.current?.scrollTo({ top: 0 }); }}
                onAnswer={(choice, caught) => {
                  if (!collectedSteps.current.has(state.step)) { collectedSteps.current.add(state.step); setShells(total => total + caught); }
                  setState(current => answerMission(mission, current, choice));
                }} />
              {state.phase === 'feedback' && (
                <div className={`practice-feedback${state.correct ? ' is-right' : ''}`} ref={focusRef} tabIndex={-1} role="status">
                  <div>{state.correct ? <CheckCircle2 size={20} aria-hidden="true" /> : <CircleHelp size={20} aria-hidden="true" />}<strong>{state.correct ? state.rejected.length === 0 ? `${surf.firstTry} +10` : `${copy.correct} +${Math.max(2, 10 - state.rejected.length * 3)}` : surf.retry}</strong></div>
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
  const surf = SURF_COPY[lang] || SURF_COPY.en;
  const text = (value) => localize(value, lang);
  const [missionId, setMissionId] = useState('');
  const [progress, setProgress] = useState(() => {
    try { return readProgress(window.localStorage, MISSIONS); } catch { return {}; }
  });
  const [resetNotice, setResetNotice] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(BOARD_KEY)) ?? 0; } catch { return 0; }
  });
  const mission = MISSIONS.find((item) => item.id === missionId);
  const completed = Object.keys(progress).length;
  const profile = surfProfile(progress, MISSIONS);
  const board = availableBoard(selectedBoard, completed);
  const equipBoard = (index) => {
    setSelectedBoard(index);
    try { window.localStorage.setItem(BOARD_KEY, JSON.stringify(index)); } catch { /* Session only. */ }
  };
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
            <h2 id="practice-title">{surf.title}</h2>
            <p>{surf.description}</p>
            <button className="practice-primary" type="button" onClick={() => setMissionId((MISSIONS.find((item) => progress[item.id] === undefined) || MISSIONS[0]).id)}><Gamepad2 size={20} aria-hidden="true" />{copy.play}</button>
            <div className="practice-features"><span><ShieldCheck size={16} aria-hidden="true" />{copy.free}</span><span><WifiOff size={16} aria-hidden="true" />{copy.offline}</span></div>
          </div>
          <div className="practice-intro-art" aria-hidden="true">
            <span className="practice-art-orbit" />
            <SurfyRider board={board} />
          </div>
        </div>
        <div className="surf-profile" aria-label={`${surf.level} ${profile.level}`}>
          <span className="surf-level-icon"><Trophy size={26} aria-hidden="true" /></span>
          <div className="surf-profile-copy"><strong>{surf.level} {profile.level} · {surf.ranks[profile.level - 1]}</strong><progress max="60" value={profile.levelXP} aria-label={surf.nextLevel} /><span>{profile.xp} {surf.xp} · {profile.nextXP ? `${profile.nextXP} ${surf.nextLevel}` : surf.maxLevel}</span></div>
          <span className="surf-profile-total">{completed} / 6 <CheckCircle2 size={18} aria-hidden="true" /></span>
        </div>
        <div className="practice-collection-heading"><h3>{copy.collection}</h3><span><CheckCircle2 size={17} aria-hidden="true" />{completed} / {MISSIONS.length} {copy.completed}</span></div>
        <div className="practice-missions">
          {MISSIONS.map((item, index) => {
            const Icon = ICONS[item.icon];
            const done = progress[item.id] !== undefined;
            return (
              <button className={`practice-mission${done ? ' is-complete' : ''}`} key={item.id} type="button" onClick={() => setMissionId(item.id)}>
                <span className="practice-mission-icon"><Icon size={23} aria-hidden="true" /></span>
                <span className="practice-mission-copy"><small>{surf.route} {index + 1} · {text(item.category)}</small><strong>{text(item.title)}</strong><span>{done ? `${copy.best}: ${progress[item.id]} / ${item.steps.length * 10}` : surf.questions}</span>{done && <RouteStars score={progress[item.id]} label={surf.stars} />}</span>
                {done ? <CheckCircle2 className="practice-mission-check" size={19} aria-label={copy.done} />
                  : <Gamepad2 className="practice-mission-arrow" size={18} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="surf-boards"><h3>{surf.badges}</h3><p>{surf.boardsHint}</p><div className="surf-board-grid">{BOARD_UNLOCKS.map((count, index) => <button key={index} type="button" className={`surf-board-choice surf-board-${index}`} disabled={completed < count} aria-pressed={board === index} onClick={() => equipBoard(index)}><BoardArt board={index} /><strong>{surf.boards[index]}</strong><span>{completed < count ? `${count} ${surf.routes} · ${surf.locked}` : board === index ? `✓ ${surf.equipped}` : surf.equip}</span></button>)}</div></div>
        <div className="practice-footer"><p>{surf.saved}</p>{completed > 0 && <button className="practice-text-button" type="button" onClick={() => { setProgress({}); equipBoard(0); setResetNotice(true); try { writeProgress(window.localStorage, {}); } catch { /* Session only. */ } }}>{copy.clear}</button>}<span className="visually-hidden" role="status">{resetNotice ? copy.reset : ''}</span></div>
      </div>
      {mission && <PracticeDialog key={mission.id} mission={mission} lang={lang} board={board} progress={progress} onClose={() => setMissionId('')} onComplete={onComplete} onNext={() => setMissionId(MISSIONS[(MISSIONS.indexOf(mission) + 1) % MISSIONS.length].id)} />}
    </section>
  );
}
