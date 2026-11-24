import { describe, expect, it } from 'vitest';
import { RUN_DURATION, advanceSurfRun, courseForStep, newSurfRun } from './surf-run.js';

describe('playable surf course', () => {
  it('collects a shell only when crossing it in the matching lane', () => {
    const first = advanceSurfRun(newSurfRun(), 1, 2200);
    expect(first.shells).toBe(1);
    expect(advanceSurfRun(first, 1, 100).shells).toBe(1);
    expect(advanceSurfRun(newSurfRun(), 0, 2200).shells).toBe(0);
  });
  it('loses at most one shell per rock, with no negative shell count', () => {
    const first = advanceSurfRun(newSurfRun(), 1, 2200);
    const hit = advanceSurfRun(first, 1, 800);
    expect(hit).toMatchObject({ shells: 0, bumps: 1, effect: 'rock' });
    expect(advanceSurfRun(hit, 1, 100).bumps).toBe(1);
    expect(advanceSurfRun(newSurfRun(), 2, 5300).shells).toBeGreaterThanOrEqual(0);
  });
  it('ends at the gates, rotates courses and rejects invalid elapsed time', () => {
    const start = newSurfRun();
    expect(advanceSurfRun(start, 1, -100)).toBe(start);
    expect(advanceSurfRun(start, 1, NaN)).toBe(start);
    const end = advanceSurfRun(start, 1, 99999);
    expect(end.time).toBe(RUN_DURATION);
    expect(advanceSurfRun(end, 1, 100)).toBe(end);
    expect(courseForStep(1)[0].lane).toBe(2);
    expect(courseForStep(2)[0].lane).toBe(0);
  });
});
