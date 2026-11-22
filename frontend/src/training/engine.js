export const PROGRESS_KEY = 'surfare-practice-v1';

export function startMission(mission) {
  return { missionId: mission.id, step: 0, phase: 'question', score: 0, mistakes: 0, rejected: [], selected: null, correct: null };
}

export function answerMission(mission, state, choice) {
  const step = mission.steps[state.step];
  if (state.missionId !== mission.id || state.phase !== 'question' || !step
    || !Number.isInteger(choice) || choice < 0 || choice >= step.options.length || state.rejected.includes(choice)) return state;
  const correct = choice === step.correct;
  return {
    ...state, phase: 'feedback', selected: choice, correct,
    score: state.score + (correct ? Math.max(2, 10 - state.rejected.length * 3) : 0),
    mistakes: state.mistakes + (correct ? 0 : 1),
    rejected: correct ? state.rejected : [...state.rejected, choice],
  };
}

export function continueMission(mission, state) {
  if (state.missionId !== mission.id || state.phase !== 'feedback') return state;
  if (!state.correct) return { ...state, phase: 'question', selected: null, correct: null };
  if (state.step === mission.steps.length - 1) return { ...state, phase: 'complete' };
  return { ...state, step: state.step + 1, phase: 'question', rejected: [], selected: null, correct: null };
}

export function readProgress(storage, missions) {
  try {
    const saved = JSON.parse(storage.getItem(PROGRESS_KEY));
    if (saved?.version !== 1 || !saved.best || typeof saved.best !== 'object') return {};
    return Object.fromEntries(missions.flatMap((mission) => {
      const score = saved.best[mission.id];
      return Number.isInteger(score) && score >= 0 && score <= mission.steps.length * 10 ? [[mission.id, score]] : [];
    }));
  } catch { return {}; }
}

export function completeMission(progress, mission, state) {
  if (state.missionId !== mission.id || state.phase !== 'complete') return progress;
  return { ...progress, [mission.id]: Math.max(progress[mission.id] ?? 0, state.score) };
}

export function writeProgress(storage, progress) {
  try { storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, best: progress })); } catch { /* Keep session progress when storage is unavailable. */ }
}
