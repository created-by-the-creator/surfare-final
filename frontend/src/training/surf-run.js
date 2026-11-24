export const RUN_DURATION = 8000;
export const COURSE = [
  { at: 400, lane: 1, type: 'shell' },
  { at: 1200, lane: 1, type: 'rock' },
  { at: 1900, lane: 0, type: 'shell' },
  { at: 2700, lane: 2, type: 'shell' },
  { at: 3500, lane: 2, type: 'rock' },
  { at: 4200, lane: 1, type: 'shell' },
  { at: 5000, lane: 0, type: 'rock' },
  { at: 5700, lane: 2, type: 'shell' },
];
export const newSurfRun = () => ({ time: 0, shells: 0, bumps: 0, resolved: [], effect: '', effectUntil: 0 });
export const courseForStep = step => COURSE.map(item => ({ ...item, lane: (item.lane + step) % 3 }));
export function advanceSurfRun(run, lane, delta, course = COURSE) {
  if (run.time >= RUN_DURATION || !Number.isFinite(delta) || delta <= 0) return run;
  const time = Math.min(RUN_DURATION, run.time + delta);
  const next = { ...run, time, resolved: [...run.resolved] };
  course.forEach((item, index) => {
    if (time < item.at + 1800 || next.resolved.includes(index)) return;
    next.resolved.push(index);
    if (lane !== item.lane) return;
    if (item.type === 'shell') { next.shells++; next.effect = 'shell'; }
    else { next.bumps++; next.shells = Math.max(0, next.shells - 1); next.effect = 'rock'; }
    next.effectUntil = time + 650;
  });
  return next;
}
