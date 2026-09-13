/**
 * session.ts — a run of questions: how long, how it is going, how it ended.
 *
 * Pure, and `now` is always an argument. The panel renders; this decides.
 *
 * The gamification lives here too, and it is deliberately made of quantities
 * that were actually measured. A streak is a real count of consecutive right
 * answers. Accuracy is right over asked. The rank is a name for the accuracy
 * and nothing else — read the number, you can derive the word.
 *
 * There is no XP, no coins, no level-up curve. Not out of taste: an invented
 * currency is a number on the same screen as the real ones, in the same
 * typeface, and after a week nobody remembers which of the two measured
 * anything. A person studying biochemistry is entitled to know that every figure in
 * front of them came from something they did.
 */
import type { Answered } from './review';

/** Run lengths offered. `null` means keep going until you stop. */
export const LENGTHS = [5, 10, 50, null] as const;
export type RunLength = (typeof LENGTHS)[number];

/**
 * The label for a run length. `null` has no number to show and is named by the
 * panel — a pure module that returned "Endless" would be one English word
 * hiding inside a translated screen, which is exactly the leak nobody reports
 * because it looks deliberate.
 */
export function lengthLabel(n: RunLength): string | null {
  return n === null ? null : String(n);
}

export interface Run {
  /** How many questions this run commits to, or null for endless. */
  length: RunLength;
  answers: Answered[];
  /** Consecutive right answers ending now. Reset by a miss, never carried over. */
  streak: number;
  /** Longest streak inside THIS run. */
  bestStreak: number;
  startedAt: number;
  /** Set when the human ends an endless run themselves. */
  ended?: boolean;
}

export const startRun = (length: RunLength, now: number): Run =>
  ({ length, answers: [], streak: 0, bestStreak: 0, startedAt: now });

/** The run after one answer. Never mutates the run it was given. */
export function record(run: Run, answer: Answered): Run {
  const streak = answer.correct ? run.streak + 1 : 0;
  return {
    ...run,
    answers: [...run.answers, answer],
    streak,
    bestStreak: Math.max(run.bestStreak, streak),
  };
}

export function isComplete(run: Run): boolean {
  // An endless run has no length to reach, so the only way out is the human
  // saying stop. Faking a length at that moment (`length = answers.length`)
  // would make the results screen claim they had committed to that number.
  if (run.ended) return true;
  return run.length !== null && run.answers.length >= run.length;
}

/** Ends a run where it stands. Nothing else about it changes. */
export const endRun = (run: Run): Run => ({ ...run, ended: true });

export interface RunStats {
  asked: number;
  right: number;
  /** 0..1, or null when nothing was asked — never 0, which would read as "all wrong". */
  accuracy: number | null;
  bestStreak: number;
  elapsedMs: number;
  missed: Answered[];
}

export function runStats(run: Run, now: number): RunStats {
  const right = run.answers.filter((a) => a.correct).length;
  return {
    asked: run.answers.length,
    right,
    accuracy: run.answers.length ? right / run.answers.length : null,
    bestStreak: run.bestStreak,
    elapsedMs: Math.max(0, now - run.startedAt),
    missed: run.answers.filter((a) => !a.correct),
  };
}

/**
 * A word for an accuracy, and nothing more than that.
 *
 * `null` in means nothing was asked, and it stays null: a run with no answers
 * has no rank, and inventing "Beginner" for it would be a judgement passed on
 * someone who has not done anything yet.
 */
export type Rank = 'Perfect' | 'Excellent' | 'Solid' | 'Getting there' | 'Worth another pass';

export function rankOf(accuracy: number | null): Rank | null {
  if (accuracy === null) return null;
  if (accuracy === 1) return 'Perfect';
  if (accuracy >= 0.9) return 'Excellent';
  if (accuracy >= 0.75) return 'Solid';
  if (accuracy >= 0.5) return 'Getting there';
  return 'Worth another pass';
}

/** mm:ss, because a study run is minutes and nobody counts in milliseconds. */
export function duration(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
