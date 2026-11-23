import { describe, expect, it } from 'vitest';
import {
  markAutoCacheAttempt,
  markAutoCacheDone,
  markAutoCacheSkipped,
  readAutoCacheState,
  shouldAutoCache,
} from './autocache.js';

function fakeStorage(initial = '') {
  const entries = new Map([['surfare:offline-pack-autocache', initial]]);
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}

describe('offline pack auto-caching', () => {
  it('starts once on a fresh install and survives an unreadable saved value', () => {
    expect(shouldAutoCache(1000, readAutoCacheState(fakeStorage()))).toBe(true);
    const broken = fakeStorage('not json');
    expect(readAutoCacheState(broken)).toEqual({ attemptedAt: 0, completed: false, skipped: false });
    expect(shouldAutoCache(1000, readAutoCacheState(broken))).toBe(true);
  });

  it('waits before retrying a failed background attempt', () => {
    expect(shouldAutoCache(1000, { attemptedAt: 1000, completed: false, skipped: false })).toBe(false);
    expect(shouldAutoCache(1000 + 60 * 60 * 1000, { attemptedAt: 1000, completed: false, skipped: false })).toBe(true);
  });

  it('never repeats completed downloads or canceled downloads', () => {
    expect(shouldAutoCache(10_000_000, { attemptedAt: 0, completed: true, skipped: false })).toBe(false);
    expect(shouldAutoCache(10_000_000, { attemptedAt: 0, completed: false, skipped: true })).toBe(false);
  });

  it('records attempts, completion, and cancellation', () => {
    const storage = fakeStorage();
    markAutoCacheAttempt(500, storage);
    expect(readAutoCacheState(storage)).toMatchObject({ attemptedAt: 500, completed: false });
    markAutoCacheDone(storage);
    expect(readAutoCacheState(storage)).toMatchObject({ completed: true, skipped: false });
    const canceled = fakeStorage();
    markAutoCacheSkipped(canceled);
    expect(readAutoCacheState(canceled)).toMatchObject({ skipped: true, completed: false });
  });
});
