/**
 * levels.ts — what you can choose to be asked about, and how far along you are.
 *
 * A level is one FAMILY from the editorial corpus, plus one tile for everything
 * and one per kind. They are DERIVED from the corpus that was loaded, never
 * listed by hand: adding an entry to `corpus/*.json` must not require
 * remembering to add its family here too, and a family that loses all its
 * entries must stop appearing rather than showing an empty tile nobody can
 * enter.
 *
 * Everything here is pure and takes `now` as an argument, so the same rules can
 * be tested against a date rather than against whatever the clock says.
 *
 * Three decisions, each one a way this screen could mislead:
 *
 * 1. THE TILE'S TOTAL IS WHAT THE QUIZ WILL ACTUALLY ASK. Both come from the
 *    same function. Counting corpus rows on the tile and asking from a
 *    different pool would put "20 structures" on a tile that runs out after 12,
 *    and the progress bar would never reach the end for a reason nobody could
 *    see.
 *
 * 2. A LEVEL TOO SMALL FOR A FAIR QUESTION SAYS SO INSTEAD OF STARTING. Four
 *    options need four candidates. With three, either the quiz shows fewer
 *    options — a question that is easier without saying it got easier — or it
 *    borrows from another family, which is the one thing that makes a right
 *    answer meaningless.
 *
 * 3. PROGRESS IS A COUNT OF CARDS, NEVER A COUNT OF STRUCTURES. A level you
 *    have never opened has no cards, so it reads zero-of-many. It must never
 *    read as "mastered 0%" of something measured — the panel decides how to
 *    render an unread store; this file only reports what the cards say.
 */
import { displayName, type Corpus, type Entry } from '../mol/corpus';
import { dayOf, TOP_BOX, type Askable, type ReviewState } from './review';

/** Four options need four candidates; below that a question cannot be fair. */
export const MIN_FOR_QUIZ = 4;

/** The tile that covers everything in the cartridge. */
export const ALL_LEVEL = '__all__';
/** The two tiles that cover one source each. */
export const PDB_LEVEL = '__pdb__';
export const CHEBI_LEVEL = '__chebi__';

export interface Level {
  id: string;
  /** How to pick this level's entries out of the corpus. */
  match: (e: Entry) => boolean;
  /** Structures askable in it — the same number the quiz will draw from. */
  total: number;
}

export interface LevelProgress {
  studied: number;
  mastered: number;
  due: number;
  /** 0..1 of the level's structures that have reached the last box. */
  ratio: number;
}

/**
 * The structures a quiz can ask about, for a level.
 *
 * The NAME is the one a reader sees — our alias when ChEBI files a compound
 * under a systematic name — because the options must say what the tile counted.
 */
export function askablePool(entries: Entry[], level: Level): Askable[] {
  return entries.filter(level.match).map((e) => ({ id: e.id, name: displayName(e), family: e.family }));
}

/** Every level this corpus can offer: everything, each source, then each family. */
export function levelsOf(corpus: Corpus): Level[] {
  const entries = corpus.structures;
  const make = (id: string, match: (e: Entry) => boolean): Level =>
    ({ id, match, total: entries.filter(match).length });

  const families = [...new Set(entries.map((e) => e.family))]
    .map((f) => make(f, (e) => e.family === f))
    .filter((l) => l.total > 0)
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));

  return [
    make(ALL_LEVEL, () => true),
    make(PDB_LEVEL, (e) => e.kind === 'pdb'),
    make(CHEBI_LEVEL, (e) => e.kind === 'chebi'),
    ...families,
  ];
}

export function levelProgress(level: Level, entries: Entry[], state: ReviewState, now: number): LevelProgress {
  const today = dayOf(now);
  const ids = entries.filter(level.match).map((e) => e.id);
  let studied = 0, mastered = 0, due = 0;
  for (const id of ids) {
    const c = state.cards[id];
    if (!c) continue;
    studied++;
    if (c.b >= TOP_BOX) mastered++;
    if (c.d <= today) due++;
  }
  // A level with no structures has no ratio to report; zero would read as "none
  // of them mastered", which is a different statement from "empty".
  return { studied, mastered, due, ratio: ids.length ? mastered / ids.length : 0 };
}

/**
 * Whether a level can be studied, and why not when it cannot.
 *
 * The refusal is a CODE, not a sentence. A pure module that returned English
 * prose would have to know the reader's language, and the language is a fact
 * about the screen — the panel turns `why` into words.
 */
export type NoQuizReason = 'empty' | 'tooSmall';

export function canStudy(level: Level): { ok: boolean; why?: NoQuizReason; n: number } {
  if (level.total >= MIN_FOR_QUIZ) return { ok: true, n: level.total };
  return { ok: false, why: level.total === 0 ? 'empty' : 'tooSmall', n: level.total };
}
