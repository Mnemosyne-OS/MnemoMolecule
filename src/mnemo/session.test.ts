/**
 * session.ts, taken from the doc 115 verification pass (05/10): the file had no test.
 * (Atlas has session.test.ts; the port did not bring it). These pin the
 * honesty rules its header claims.
 */
import { describe, expect, it } from 'vitest';
import { duration, endRun, isComplete, lengthLabel, LENGTHS, rankOf, record, runStats, startRun } from './session';
import type { Answered } from './review';

const a = (id: string, correct: boolean): Answered => ({ id, name: id, family: 'f', correct, n: 1 });
const T0 = 1_000_000;

describe('accuracy and rank: nothing asked is null, never 0', () => {
  it('a run with no answers has null accuracy and no rank', () => {
    const s = runStats(startRun(5, T0), T0 + 10);
    expect(s.accuracy).toBeNull();
    expect(rankOf(s.accuracy)).toBeNull();
  });
  it('a run of all misses has accuracy 0, which IS a measurement', () => {
    const r = record(startRun(5, T0), a('A', false));
    expect(runStats(r, T0).accuracy).toBe(0);
    expect(rankOf(0)).toBe('Worth another pass');
  });
  it('rank boundaries', () => {
    expect(rankOf(1)).toBe('Perfect');
    expect(rankOf(0.9)).toBe('Excellent');
    expect(rankOf(0.75)).toBe('Solid');
    expect(rankOf(0.5)).toBe('Getting there');
    expect(rankOf(0.49)).toBe('Worth another pass');
  });
});

describe('streaks are measured, never carried', () => {
  it('a miss resets the streak and keeps the best', () => {
    let r = startRun(null, T0);
    r = record(r, a('A', true));
    r = record(r, a('B', true));
    r = record(r, a('C', false));
    expect(r.streak).toBe(0);
    expect(r.bestStreak).toBe(2);
    r = record(r, a('D', true));
    expect(r.streak).toBe(1);
    expect(r.bestStreak).toBe(2);
  });
  it('record never mutates the run it was given', () => {
    const r = startRun(5, T0);
    record(r, a('A', true));
    expect(r.answers).toHaveLength(0);
    expect(r.streak).toBe(0);
  });
});

describe('an endless run only ends when the human says so', () => {
  it('is never complete by count', () => {
    let r = startRun(null, T0);
    for (let i = 0; i < 60; i++) r = record(r, a(`X${i}`, true));
    expect(isComplete(r)).toBe(false);
    expect(isComplete(endRun(r))).toBe(true);
  });
  it('a fixed run completes exactly at its length', () => {
    let r = startRun(5, T0);
    for (let i = 0; i < 4; i++) r = record(r, a(`X${i}`, true));
    expect(isComplete(r)).toBe(false);
    expect(isComplete(record(r, a('X4', false)))).toBe(true);
  });
  it('endless has no number to show; the panel names it', () => {
    expect(lengthLabel(null)).toBeNull();
    expect(LENGTHS.map(lengthLabel)).toEqual(['5', '10', '50', null]);
  });
});

describe('elapsed time', () => {
  it('never goes negative when the clock went backwards', () => {
    expect(runStats(startRun(5, T0), T0 - 500).elapsedMs).toBe(0);
  });
  it('formats mm:ss', () => {
    expect(duration(29_000)).toBe('0:29');
    expect(duration(61_000)).toBe('1:01');
    expect(duration(0)).toBe('0:00');
  });
});
