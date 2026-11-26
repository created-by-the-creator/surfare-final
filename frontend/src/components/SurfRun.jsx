import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Flag, Pause, Play, Shell, Waves } from 'lucide-react';
import { ASSETS } from '../assets.js';
import SurfyRider from './SurfyRider.jsx';
import { RUN_DURATION, advanceSurfRun, courseForStep, newSurfRun } from '../training/surf-run.js';
import './SurfRun.css';

export const RUN_COPY = {
  en: { start: 'Let’s surf!', intro: 'Read the message. Then ride through the surf to your answer.', how: 'Swipe or use the arrows. Collect shells. Dodge rocks!', go: 'Choose your answer gate', gateHint: 'Steer to a gate, then catch the wave. You can take your time.', catch: 'Catch this wave', left: 'Steer left', right: 'Steer right', pause: 'Pause', resume: 'Keep surfing', paused: 'Taking a breather', shells: 'shells', rock: 'Rock! One shell lost.', shell: '+1 shell!', ready: 'Your surf route', read: 'Read the message again', ride: 'Riding to the gates…', rejected: 'Try a different gate', total: 'Shells collected', keyboard: '← → to steer · Space to pause', again: 'Ride again', finish: 'Made it to shore!' },
  tl: { start: 'Mag-surf na!', intro: 'Basahin ang mensahe. Pagkatapos, sumabay sa alon patungo sa sagot.', how: 'Mag-swipe o gamitin ang mga arrow. Kumuha ng kabibe. Iwasan ang bato!', go: 'Piliin ang gate ng sagot', gateHint: 'Pumunta sa gate at sumabay sa alon. Walang pagmamadali.', catch: 'Sumabay sa alon', left: 'Pakaliwa', right: 'Pakanan', pause: 'Ihinto muna', resume: 'Magpatuloy', paused: 'Pahinga muna', shells: 'kabibe', rock: 'Bato! Nabawasan ng isang kabibe.', shell: '+1 kabibe!', ready: 'Ang ruta mo', read: 'Basahin ulit ang mensahe', ride: 'Papunta sa mga gate…', rejected: 'Subukan ang ibang gate', total: 'Nakuhang kabibe', keyboard: '← → para gumalaw · Space para huminto', again: 'Sumabay ulit', finish: 'Nakarating sa pampang!' },
  taglish: { start: 'Let’s surf!', intro: 'Read muna ang message. Then surf papunta sa answer mo.', how: 'Swipe or use the arrows. Collect shells. Iwas sa rocks!', go: 'Choose your answer gate', gateHint: 'Steer to a gate, then catch the wave. Take your time.', catch: 'Catch this wave', left: 'Steer left', right: 'Steer right', pause: 'Pause', resume: 'Surf ulit', paused: 'Pahinga muna', shells: 'shells', rock: 'Rock! Minus one shell.', shell: '+1 shell!', ready: 'Your surf route', read: 'Read ulit ang message', ride: 'Surfing to the gates…', rejected: 'Try another gate', total: 'Shells na collected', keyboard: '← → to steer · Space to pause', again: 'Ride again', finish: 'Nakarating sa shore!' },
};

export default function SurfRun({ lang, board, step, state, text, onAnswer, onRead, onStart }) {
  const copy = RUN_COPY[lang] || RUN_COPY.en;
  const [started, setStarted] = useState(false);
  const [lane, setLane] = useState(1);
  const [run, setRun] = useState(newSurfRun);
  const [paused, setPaused] = useState(false);
  const laneRef = useRef(1);
  const pointer = useRef(null);
  const surface = useRef(null);
  const course = courseForStep(state.step);
  const atGate = run.time >= RUN_DURATION;
  const answered = state.phase !== 'question';
  const steer = direction => {
    if (answered || paused) return;
    const next = Math.max(0, Math.min(2, laneRef.current + direction));
    laneRef.current = next; setLane(next);
  };
  useEffect(() => {
    if (!started || paused || atGate || answered) return;
    const timer = setInterval(() => setRun(current => advanceSurfRun(current, laneRef.current, 100, courseForStep(state.step))), 100);
    return () => clearInterval(timer);
  }, [started, paused, atGate, answered, state.step]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const commit = () => { if (atGate && !answered && !paused && !state.rejected.includes(lane)) onAnswer(lane, run.shells); };

  return <div className={`surf-run surf-board-${board}`}>
    {!started ? <div className="surf-launch">
      <SurfyRider board={board} />
      <div><h3>{copy.ready}</h3><p>{copy.intro}</p><p>{copy.how}</p><button type="button" className="practice-primary surf-start" onClick={() => { setStarted(true); setPaused(false); onStart(); requestAnimationFrame(() => { surface.current?.focus({ preventScroll: true }); surface.current?.closest('.surf-run')?.scrollIntoView({ block: 'start' }); }); }}><Waves size={20} aria-hidden="true" />{copy.start}</button></div>
    </div> : <>
      <div className="surf-run-heading"><span><Shell size={18} aria-hidden="true" /> {run.shells} {copy.shells}</span><strong>{atGate ? copy.go : copy.ride}</strong><button type="button" className="surf-pause" disabled={answered} onClick={() => { if (paused) onStart(); setPaused(value => !value); }} aria-label={paused ? copy.resume : copy.pause}>{paused ? <Play size={18} /> : <Pause size={18} />}</button></div>
      <div className={`surf-course${atGate ? ' at-gates' : ''}${answered ? state.correct ? ' has-landed' : ' has-bumped' : ''}${paused ? ' is-paused' : ''}`} ref={surface} tabIndex={0} role="group" aria-label={copy.how}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (['ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) event.preventDefault();
          if (event.key === 'ArrowLeft') steer(-1);
          if (event.key === 'ArrowRight') steer(1);
          if (event.key === ' ' && !atGate && !answered) setPaused(value => !value);
          if (event.key === 'Enter') commit();
        }}
        onPointerDown={event => { if (event.target.closest('button')) return; pointer.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={event => {
          if (!pointer.current) return;
          const dx = event.clientX - pointer.current.x, dy = event.clientY - pointer.current.y;
          pointer.current = null;
          if (Math.abs(dx) > 25 && Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 1 : -1);
        }} onPointerCancel={() => { pointer.current = null; }}>
        <div className="surf-hero-ocean" aria-hidden="true"><img src={ASSETS.waveBorder} className="surf-hero-wave" alt="" width="2172" height="414" /><span className="surf-deep-water" /></div>
        <div className="surf-current" aria-hidden="true"><span /><span /><span /></div>
        {!atGate && course.map((item, index) => {
          const age = run.time - item.at;
          if (age < 0 || age > 2100 || run.resolved.includes(index)) return null;
          return <span key={index} className={`surf-pickup is-${item.type}`} style={{ left: `${17 + item.lane * 33}%`, top: `${9 + age / 1800 * 66}%` }} aria-hidden="true">{item.type === 'shell' ? <Shell size={27} /> : <svg viewBox="0 0 50 40"><path d="M3 33L10 13L24 4L40 12L47 32L34 37L14 38Z" fill="#7d8591" stroke="#eef2f5" strokeWidth="2" /><path d="M10 13L26 18L40 12M26 18L34 37" fill="none" stroke="#aab5bf" strokeWidth="2" /></svg>}</span>;
        })}
        {atGate && <div className="surf-gates" aria-hidden="true">{step.options.map((_, index) => <span key={index} className={`${lane === index ? 'is-target ' : ''}${state.rejected.includes(index) ? 'is-closed' : ''}`}><Flag size={20} />{['A', 'B', 'C'][index]}{state.rejected.includes(index) ? ' ×' : ''}</span>)}</div>}
        <div className={`surf-player${run.effectUntil > run.time && run.effect === 'rock' ? ' is-hit' : ''}`} style={{ left: `${17 + lane * 33}%` }} aria-hidden="true"><span className="surf-wake" /><SurfyRider board={board} paused={paused} /></div>
        <div className="surf-course-notice" role="status">{answered ? state.correct ? copy.finish : copy.rejected : !atGate && run.effectUntil > run.time ? run.effect === 'shell' ? copy.shell : copy.rock : ''}</div>
        {paused && <div className="surf-pause-overlay"><h3>{copy.paused}</h3><button className="practice-primary" type="button" onClick={() => { setPaused(false); onStart(); }}><Play size={18} />{copy.resume}</button></div>}
        <progress className="surf-distance" max={RUN_DURATION} value={run.time} aria-label={copy.ride} />
      </div>
      <div className="surf-steering"><button type="button" className="surf-steer-left" onClick={() => steer(-1)} disabled={lane === 0 || answered || paused} aria-label={copy.left}><ArrowLeft size={25} /></button><p>{atGate ? copy.gateHint : copy.how}<small>{copy.keyboard}</small></p><button type="button" className="surf-steer-right" onClick={() => steer(1)} disabled={lane === 2 || answered || paused} aria-label={copy.right}><ArrowRight size={25} /></button></div>
      <ol className="surf-gate-legend">{step.options.map((option, index) => <li key={index} className={`${lane === index ? 'is-target ' : ''}${state.rejected.includes(index) ? 'is-closed' : ''}`}><span>{['A', 'B', 'C'][index]}</span>{text(option)}</li>)}</ol>
      {atGate && !answered && <button className="practice-primary surf-catch" type="button" disabled={paused || state.rejected.includes(lane)} onClick={commit}><Waves size={20} />{state.rejected.includes(lane) ? copy.rejected : `${copy.catch} · ${['A', 'B', 'C'][lane]}`}</button>}
      <button className="practice-text-button surf-read" type="button" onClick={() => { setPaused(true); onRead(); }}>{copy.read}</button>
    </>}
  </div>;
}
