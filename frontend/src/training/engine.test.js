import { describe, expect, it } from 'vitest';
import { MISSIONS, PRACTICE_COPY, SENDER_LABELS, localize } from './content.js';
import { PROGRESS_KEY, answerMission, completeMission, continueMission, readProgress, startMission, writeProgress } from './engine.js';

const mission = MISSIONS[0];
const finish = (item) => {
  let state = startMission(item);
  for (const step of item.steps) {
    state = answerMission(item, state, step.correct);
    state = continueMission(item, state);
  }
  return state;
};

describe('practice missions', () => {
  it('has complete, independently authored learning content in all three languages', () => {
    expect(new Set(MISSIONS.map((item) => item.id)).size).toBe(MISSIONS.length);
    for (const lang of ['en', 'tl', 'taglish']) {
      expect(Object.keys(PRACTICE_COPY[lang]).sort()).toEqual(Object.keys(PRACTICE_COPY.en).sort());
      for (const item of MISSIONS) {
        for (const value of [item.title, item.category, item.lesson]) expect(localize(value, lang).length).toBeGreaterThan(10);
        expect(item.steps).toHaveLength(2);
        for (const step of item.steps) {
          expect(SENDER_LABELS[step.sender][lang]).toBeTruthy();
          expect(step.options).toHaveLength(3);
          expect(step.correct).toBeGreaterThanOrEqual(0);
          expect(step.correct).toBeLessThan(step.options.length);
          for (const value of [step.message, step.explanation, ...step.options]) expect(value[lang].length).toBeGreaterThan(5);
        }
      }
    }
  });

  it('finishes each mission with a bounded score and no API or random dependency', () => {
    for (const item of MISSIONS) {
      const state = finish(item);
      expect(state.phase).toBe('complete');
      expect(state.score).toBe(20);
      expect(state.mistakes).toBe(0);
    }
  });

  it('keeps a mistaken answer on the same question until the learner retries', () => {
    let state = startMission(mission);
    const wrong = (mission.steps[0].correct + 1) % 3;
    state = answerMission(mission, state, wrong);
    expect(state.phase).toBe('feedback');
    expect(state.step).toBe(0);
    expect(state.score).toBe(0);
    state = continueMission(mission, state);
    expect(state.phase).toBe('question');
    expect(answerMission(mission, state, wrong)).toBe(state);
    state = answerMission(mission, state, mission.steps[0].correct);
    expect(state.score).toBe(7);
    expect(continueMission(mission, state).step).toBe(1);
  });

  it('prevents repeated clicks from awarding points again', () => {
    const answered = answerMission(mission, startMission(mission), mission.steps[0].correct);
    expect(answerMission(mission, answered, mission.steps[0].correct)).toBe(answered);
    const completed = finish(mission);
    expect(answerMission(mission, completed, 0)).toBe(completed);
    expect(continueMission(mission, completed)).toBe(completed);
  });

  it('ignores invalid choices and states for another mission', () => {
    const state = startMission(mission);
    for (const invalid of [-1, 3, NaN, '1', null]) expect(answerMission(mission, state, invalid)).toBe(state);
    expect(answerMission(MISSIONS[1], state, 0)).toBe(state);
    expect(continueMission(mission, state)).toBe(state);
  });

  it('saves only completed missions and retains the best score on replay', () => {
    expect(completeMission({}, mission, startMission(mission))).toEqual({});
    const progress = completeMission({}, mission, finish(mission));
    expect(progress).toEqual({ [mission.id]: 20 });
    expect(completeMission(progress, mission, { ...finish(mission), score: 14 })).toEqual(progress);
  });

  it('recovers from corrupted storage and drops unknown or invalid scores', () => {
    expect(readProgress({ getItem: () => 'bad json' }, MISSIONS)).toEqual({});
    expect(readProgress({ getItem: () => JSON.stringify({ version: 1, best: { wallet: 999, fake: 20, winnings: 14 } }) }, MISSIONS)).toEqual({ winnings: 14 });
    expect(readProgress({ getItem: () => { throw Error('blocked'); } }, MISSIONS)).toEqual({});
  });

  it('persists only score metadata and tolerates disabled storage', () => {
    const writes = [];
    writeProgress({ setItem: (...args) => writes.push(args) }, { wallet: 20 });
    expect(writes).toEqual([[PROGRESS_KEY, JSON.stringify({ version: 1, best: { wallet: 20 } })]]);
    expect(() => writeProgress({ setItem: () => { throw Error('quota'); } }, {})).not.toThrow();
  });
});
