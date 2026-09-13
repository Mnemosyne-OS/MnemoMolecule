import { describe, expect, it } from 'vitest';
import {
  BOXES, dayOf, emptyState, grade, nextQuestion, parseState, progress, sessionNote,
  stateSize, STATE_LIMIT_BYTES, TOP_BOX, type Answered, type Askable, type ReviewState,
} from './review';

const NOW = Date.UTC(2026, 8, 9, 22, 40);
const TODAY = dayOf(NOW);

const askable = (id: string, family = 'enzyme'): Askable => ({ id, name: `name-${id}`, family });

describe('never asked and asked-and-failed are different facts', () => {
  it('gives a structure nobody was asked about no card at all', () => {
    expect(progress(emptyState(), NOW)).toEqual({ seen: 0, due: 0, mastered: 0 });
  });

  it('counts only structures that HAVE a card as seen', () => {
    const s: ReviewState = { v: 1, cards: { A: grade(undefined, false, NOW) } };
    expect(progress(s, NOW).seen).toBe(1);
  });
});

describe('a right first answer must not come straight back', () => {
  it('starts a correct answer at box 1, never box 0', () => {
    // Box 0 is due TODAY. A structure you got right landing there would be due
    // the moment you answered it, and the panel would report six due right
    // after you studied six.
    const c = grade(undefined, true, NOW);
    expect(c.b).toBe(1);
    expect(c.d).toBe(TODAY + BOXES[1]);
  });

  it('sends a wrong answer back to box 0, due today', () => {
    const c = grade({ b: 4, d: TODAY + 16, n: 9 }, false, NOW);
    expect(c.b).toBe(0);
    expect(c.d).toBe(TODAY);
  });

  it('moves an existing card UP one box on a right answer', () => {
    // The whole Leitner rule. Testing only the first answer leaves this
    // untested: a fresh card lands on box 1 whether the code adds one or not.
    expect(grade({ b: 2, d: TODAY, n: 3 }, true, NOW).b).toBe(3);
    expect(grade({ b: 2, d: TODAY, n: 3 }, true, NOW).d).toBe(TODAY + BOXES[3]);
  });

  it('lengthens the interval every time it climbs', () => {
    const intervals = [0, 1, 2, 3, 4].map((b) => grade({ b, d: TODAY, n: 1 }, true, NOW).d - TODAY);
    expect(intervals).toEqual([BOXES[1], BOXES[2], BOXES[3], BOXES[4], BOXES[5]]);
  });

  it('never climbs past the last box', () => {
    const c = grade({ b: TOP_BOX, d: TODAY, n: 3 }, true, NOW);
    expect(c.b).toBe(TOP_BOX);
  });

  it('counts the answer it was just given', () => {
    expect(grade({ b: 1, d: TODAY, n: 4 }, true, NOW).n).toBe(5);
  });
});

describe('an unreadable store becomes empty, never partial', () => {
  it('drops a card with a non-numeric field instead of guessing it', () => {
    // A half-parsed progress file that silently keeps the cards it could read
    // would tell someone they have forgotten material they know.
    const parsed = parseState({ v: 1, cards: { A: { b: 1, d: 2, n: 3 }, B: { b: 'x', d: 2, n: 3 } } });
    expect(Object.keys(parsed.cards)).toEqual(['A']);
  });

  it('refuses a whole store of the wrong version', () => {
    expect(parseState({ v: 2, cards: { A: { b: 1, d: 2, n: 3 } } })).toEqual(emptyState());
  });

  it('refuses garbage without throwing', () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState('nope')).toEqual(emptyState());
    expect(parseState({ v: 1 })).toEqual(emptyState());
  });

  it('leaves `best` ABSENT when nothing recorded one', () => {
    // 0 would be a claim that someone once played and never got two right.
    expect('best' in parseState({ v: 1, cards: {} })).toBe(false);
    expect(parseState({ v: 1, cards: {}, best: 7 }).best).toBe(7);
  });

  it('clamps a box that is out of range rather than trusting it', () => {
    expect(parseState({ v: 1, cards: { A: { b: 99, d: 1, n: 1 } } }).cards.A!.b).toBe(TOP_BOX);
    expect(parseState({ v: 1, cards: { A: { b: -3, d: 1, n: 1 } } }).cards.A!.b).toBe(0);
  });

  it('rejects an infinite number, which is finite-looking to typeof', () => {
    expect(parseState({ v: 1, cards: { A: { b: 1, d: Infinity, n: 1 } } }).cards).toEqual({});
  });
});

describe('a question is only asked when it can be asked honestly', () => {
  it('refuses to build one from fewer than two candidates', () => {
    expect(nextQuestion([askable('A')], emptyState(), NOW, 1)).toBeNull();
    expect(nextQuestion([], emptyState(), NOW, 1)).toBeNull();
  });

  it('draws distractors from the SAME family when it can', () => {
    // Ask "which is lysozyme" against three sugars and the answer is free, so
    // the score measures nothing.
    const pool = [
      askable('A', 'enzyme'), askable('B', 'enzyme'), askable('C', 'enzyme'), askable('D', 'enzyme'),
      askable('X', 'sugar'), askable('Y', 'sugar'), askable('Z', 'sugar'),
    ];
    for (let seed = 1; seed < 40; seed++) {
      const q = nextQuestion(pool, { v: 1, cards: { A: { b: 0, d: TODAY, n: 1 } } }, NOW, seed);
      if (q?.subject.id !== 'A') continue;
      expect(q.options.every((o) => o.family === 'enzyme')).toBe(true);
    }
  });

  it('widens to other families rather than asking a two-option question', () => {
    const pool = [askable('A', 'lonely'), askable('X', 'sugar'), askable('Y', 'sugar'), askable('Z', 'sugar')];
    const q = nextQuestion(pool, { v: 1, cards: { A: { b: 0, d: TODAY, n: 1 } } }, NOW, 3);
    expect(q).not.toBeNull();
    expect(q!.options).toHaveLength(4);
  });

  it('includes the subject among the options', () => {
    const pool = [askable('A'), askable('B'), askable('C'), askable('D')];
    const q = nextQuestion(pool, emptyState(), NOW, 5)!;
    expect(q.options.map((o) => o.id)).toContain(q.subject.id);
  });

  it('prefers a DUE card over a fresh one', () => {
    const pool = [askable('DUE'), askable('FRESH1'), askable('FRESH2'), askable('FRESH3')];
    const s: ReviewState = { v: 1, cards: { DUE: { b: 1, d: TODAY - 1, n: 1 } } };
    for (let seed = 1; seed < 12; seed++) {
      expect(nextQuestion(pool, s, NOW, seed)!.subject.id).toBe('DUE');
    }
  });

  it('steps aside from what this sitting already asked', () => {
    // A wrong answer files the card as due TODAY, which is right for tomorrow
    // and wrong for the next ten seconds: without this the sitting never moves
    // past the structure you just got wrong.
    const pool = [askable('A'), askable('B'), askable('C'), askable('D')];
    const s: ReviewState = { v: 1, cards: { A: { b: 0, d: TODAY, n: 1 } } };
    const q = nextQuestion(pool, s, NOW, 7, 4, new Set(['A']));
    expect(q!.subject.id).not.toBe('A');
  });

  it('comes back round rather than stopping when everything has been asked', () => {
    const pool = [askable('A'), askable('B'), askable('C'), askable('D')];
    const q = nextQuestion(pool, emptyState(), NOW, 9, 4, new Set(['A', 'B', 'C', 'D']));
    expect(q).not.toBeNull();
  });

  it('replays identically for the same seed', () => {
    const pool = [askable('A'), askable('B'), askable('C'), askable('D')];
    const a = nextQuestion(pool, emptyState(), NOW, 42)!;
    const b = nextQuestion(pool, emptyState(), NOW, 42)!;
    expect(b.options.map((o) => o.id)).toEqual(a.options.map((o) => o.id));
  });
});

describe('the store reports its own pressure', () => {
  it('is not tight when it is small', () => {
    expect(stateSize(emptyState()).tight).toBe(false);
  });

  it('says so before the host silently stops saving', () => {
    const cards: Record<string, { b: number; d: number; n: number }> = {};
    for (let i = 0; i < 9000; i++) cards[`ID${i}`] = { b: 3, d: 20000, n: 4 };
    const s = stateSize({ v: 1, cards });
    expect(s.bytes).toBeGreaterThan(STATE_LIMIT_BYTES * 0.8);
    expect(s.tight).toBe(true);
  });
});

describe('a session with nothing in it produces no note', () => {
  const answer = (id: string, correct: boolean): Answered =>
    ({ id, name: `name-${id}`, family: 'enzyme', correct, n: 1 });

  it('writes nothing at all for an empty run', () => {
    // "Studied 0 structures" is a record of an event that did not happen, and
    // an ingest cannot be corrected later.
    expect(sessionNote([], { scopeName: 'Enzymes', now: NOW })).toBeNull();
  });

  it('names the identifiers, not only the prose', () => {
    const note = sessionNote([answer('1HHO', false)], { scopeName: 'Enzymes', now: NOW })!;
    expect(note).toContain('1HHO');
    expect(note).toContain('Missed');
    expect(note).toContain('Enzymes');
  });

  it('is ONE note for the whole run, not one per answer', () => {
    const note = sessionNote([answer('A', true), answer('B', false), answer('C', true)],
      { scopeName: 'Enzymes', now: NOW })!;
    expect(note.split('Molecular structure study session')).toHaveLength(2);
    expect(note).toContain('2 recalled, 1 missed');
  });

  it('switches to a count instead of naming two hundred structures', () => {
    const many = Array.from({ length: 30 }, (_, i) => answer(`ID${i}`, false));
    const note = sessionNote(many, { scopeName: 'All', now: NOW })!;
    expect(note).toContain('and 18 more');
  });

  it('says where the data came from, so it stands on its own in a year', () => {
    const note = sessionNote([answer('A', true)], { scopeName: 'All', now: NOW })!;
    expect(note).toContain('CC0');
    expect(note).toContain('ChEBI');
  });
});
