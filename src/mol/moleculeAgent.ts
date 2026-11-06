/**
 * moleculeAgent.ts — what an agent may do in Molecule (doc 149), as plain functions over the
 * page's own state and its own moves. Declared in `mnemo-plugin.json` › agentActions, served by
 * `MoleculeAgentActions` while the window is open.
 *
 * 🚨 Every move is the one the person's own control makes: a structure goes through `pick` (a
 * row of the library, which also resets the representation), a representation through the
 * toolbar's `setStyle`, spin and reset through the toolbar's buttons, the library filter through
 * the search box and the chips. So the person sees each action happen on screen.
 *
 * 🚨 While a review run is on, the stage IS the question: showing a structure, or filtering the
 * library, would put the answer on screen. Every write that touches the selection is refused.
 *
 * ⛔ The memory card (`MoleculeMemory`) is not exposed: asking it runs a model.
 *
 * 🗣️ The voice (doc 149 §19): the orb plans a sentence without reading Molecule first, so every
 * action that targets a structure or a family takes it by the words a person says, in English,
 * French or Spanish (`agentFind`, `spokenNames`), and still by its id. Several matches are
 * refused AMBIGUOUS with their names, never guessed.
 *
 * Refusals throw `CODE: reason`, and an unknown name says how to list the right ones.
 */
import { displayName, familiesOf, type Corpus, type Entry, type Kind } from './corpus';
import { byName, search } from './library';
import { kindCanCartoon, STYLES, type Style } from './styles';
import { findNamed, listed, type Named } from './agentFind';
import { spokenNamesOf } from './spokenNames';
import { STRINGS, LANGS } from '../i18n/strings';
import { turnStage, zoomStage } from './stage';

/** The page's state and its own moves, read fresh at every call. */
export interface MoleculeAgentContext {
  corpus: Corpus;
  selected: Entry | null;
  style: Style;
  spinning: boolean;
  /** A review run is on: the stage is the question. */
  studying: boolean;
  reviewing: boolean;
  query: string;
  kind: Kind | null;
  family: string | null;
  pick: (e: Entry) => void;
  setStyle: (s: Style) => void;
  setSpinning: (on: boolean) => void;
  recentre: () => void;
  setQuery: (q: string) => void;
  setKind: (k: Kind | null) => void;
  setFamily: (f: string | null) => void;
  /** The gesture panel is open. */
  gestOpen: boolean;
  /** The page's own setters for its two panels: the review button and the ✋ button. */
  setReviewing: (on: boolean) => void;
  setStudying: (on: boolean) => void;
  setGestOpen: (on: boolean) => void;
  /** A number in [0, 1); `Math.random` when absent, fixed in tests. */
  random?: () => number;
}

/** How many rows `find` returns at most: what the manifest declares as `limit`'s maximum. */
export const FIND_LIMIT = { min: 1, max: 50, default: 20 } as const;

/** One zoom step (×1.25 closer, ÷1.25 farther) and how many one call may take. */
export const ZOOM = { step: 1.25, maxTimes: 5 } as const;
/** The largest turn one call may ask, in degrees, either way. */
export const TURN_MAX = 360;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A structure as an agent reads it: enough to name it and to ask for it again. */
function row(e: Entry) {
  return { id: e.id, name: displayName(e), kind: e.kind, family: e.family };
}

/** A whole number of rows inside the declared limits; anything else is refused, never clamped silently. */
export function readLimit(v: unknown): number {
  if (v === undefined || v === null) return FIND_LIMIT.default;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < FIND_LIMIT.min || v > FIND_LIMIT.max) {
    throw new Error(`BAD_ARG: limit must be a whole number from ${FIND_LIMIT.min} to ${FIND_LIMIT.max}`);
  }
  return v;
}

/** A structure by every name a person may say: our label, the source's own, the alias, the spoken ones. */
function namedStructures(entries: readonly Entry[]): Named<Entry>[] {
  return entries.map((e) => ({
    item: e,
    id: e.id,
    names: [displayName(e), e.name, ...(e.kind === 'chebi' && e.alias ? [e.alias] : []), ...spokenNamesOf(e.id)],
    label: `${displayName(e)} (${e.id})`,
  }));
}

/**
 * A structure by its id (any case), then by its names as a person says them, then by the
 * library's own search (UniProt, formula, InChIKey…). Several candidates are AMBIGUOUS, never
 * the first one.
 */
export function resolveStructure(entries: readonly Entry[], ref: string): Entry {
  const r = ref.trim();
  if (!r) throw new Error('BAD_ARG: an empty structure name');
  try {
    return findNamed(namedStructures(entries), r, { code: 'NO_STRUCTURE', noun: 'structure', hint: 'Use find to search the library' });
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('NO_STRUCTURE')) throw err;
    // An identifier the names do not carry: a UniProt accession, a formula, an InChIKey.
    const near = search([...entries], { query: r, kind: null, family: null });
    if (near.length === 1) return near[0]!;
    if (near.length > 1) {
      throw new Error(`AMBIGUOUS: "${r}" names several structures: ${listed(near.map((e) => `${displayName(e)} (${e.id})`))}; say which`);
    }
    throw err;
  }
}

/** A family by its id or its label in any of the three languages; an unknown one says which exist. */
export function resolveFamily(entries: readonly Entry[], ref: string): string {
  const named: Named<string>[] = familiesOf([...entries]).map(({ id }) => ({
    item: id,
    id,
    names: [id, ...LANGS.map((l) => (STRINGS[l] as Record<string, string>)[`family.${id}`] ?? '').filter(Boolean)],
    label: id,
  }));
  return findNamed(named, ref, { code: 'NO_FAMILY', noun: 'family', plural: 'families' });
}

function notStudying(c: MoleculeAgentContext): void {
  if (c.studying) throw new Error('REVIEWING: a review run is on and the stage is its question; ask again when it ends');
}

function shown(c: MoleculeAgentContext): Entry {
  if (!c.selected) throw new Error('NOTHING_SHOWN: no structure is on the stage. Use show first');
  return c.selected;
}

/** The handlers, keyed by the action ids `mnemo-plugin.json` declares. */
export function moleculeAgentHandlers(ctx: () => MoleculeAgentContext) {
  // agent-actions:begin
  return {
    status: () => {
      const c = ctx();
      return {
        shown: c.selected ? row(c.selected) : null,
        style: c.style,
        spinning: c.spinning,
        reviewing: c.reviewing,
        studying: c.studying,
        gesturesOpen: c.gestOpen,
        library: { text: c.query, kind: c.kind, family: c.family },
        counts: { ...c.corpus.counts, total: c.corpus.structures.length },
        families: familiesOf(c.corpus.structures).map((f) => f.id),
      };
    },
    find: (args: Record<string, unknown>) => {
      const c = ctx();
      const limit = readLimit(args.limit);
      const kind = str(args.kind) as Kind | '';
      const family = str(args.family) ? resolveFamily(c.corpus.structures, str(args.family)) : null;
      const hits = search(c.corpus.structures, { query: str(args.text), kind: kind || null, family }).sort(byName);
      return { total: hits.length, structures: hits.slice(0, limit).map(row) };
    },
    show: (args: Record<string, unknown>) => {
      const c = ctx();
      notStudying(c);
      const e = resolveStructure(c.corpus.structures, str(args.structure));
      c.pick(e);
      return { shown: row(e) };
    },
    setStyle: (args: Record<string, unknown>) => {
      const c = ctx();
      const e = shown(c);
      const style = str(args.style) as Style;
      if (!STYLES.includes(style)) throw new Error(`BAD_ARG: style must be one of ${STYLES.join(', ')}`);
      // The toolbar disables this button for the same reason: a small molecule has no chain to draw.
      if (style === 'cartoon' && !kindCanCartoon(e.kind)) throw new Error('NO_CARTOON: a small molecule has no chain of residues to draw as a ribbon; use sticks or spheres');
      c.setStyle(style);
      return { style };
    },
    spin: (args: Record<string, unknown>) => {
      const c = ctx();
      shown(c);
      const on = args.on === true;
      c.setSpinning(on);
      return { spinning: on };
    },
    resetView: () => {
      const c = ctx();
      shown(c);
      c.recentre();
      return { reset: true };
    },
    filterLibrary: (args: Record<string, unknown>) => {
      const c = ctx();
      notStudying(c);
      const kind = str(args.kind);
      const family = str(args.family);
      const nextFamily = family && family !== 'all' ? resolveFamily(c.corpus.structures, family) : null;
      const text = str(args.text);
      c.setQuery(text);
      c.setKind(kind === 'pdb' || kind === 'chebi' ? kind : null);
      c.setFamily(nextFamily);
      const listed = search(c.corpus.structures, { query: text, kind: kind === 'pdb' || kind === 'chebi' ? kind : null, family: nextFamily });
      return { listed: listed.length };
    },
    zoom: (args: Record<string, unknown>) => {
      const c = ctx();
      shown(c);
      const direction = str(args.direction);
      if (direction !== 'in' && direction !== 'out') throw new Error('BAD_ARG: direction must be in or out');
      const times = args.times === undefined ? 1 : args.times;
      if (typeof times !== 'number' || !Number.isInteger(times) || times < 1 || times > ZOOM.maxTimes) {
        throw new Error(`BAD_ARG: times must be a whole number from 1 to ${ZOOM.maxTimes}`);
      }
      const factor = (direction === 'in' ? ZOOM.step : 1 / ZOOM.step) ** times;
      // The hand's pinch runs this same call on the same view.
      if (!zoomStage(factor)) throw new Error('WRITE_FAILED: the 3D view is not running; nothing was zoomed');
      return { zoomed: direction, times };
    },
    turn: (args: Record<string, unknown>) => {
      const c = ctx();
      shown(c);
      const degrees = args.degrees;
      if (typeof degrees !== 'number' || !Number.isFinite(degrees) || degrees === 0 || Math.abs(degrees) > TURN_MAX) {
        throw new Error(`BAD_ARG: degrees must be a number from -${TURN_MAX} to ${TURN_MAX}, not 0`);
      }
      const axis = args.axis === undefined ? 'y' : str(args.axis);
      if (axis !== 'x' && axis !== 'y') throw new Error('BAD_ARG: axis must be y (turn sideways) or x (tip forward)');
      // The hand's drag runs this same call on the same view.
      if (!turnStage(degrees, axis)) throw new Error('WRITE_FAILED: the 3D view is not running; nothing was turned');
      return { turned: degrees, axis };
    },
    showRandom: (args: Record<string, unknown>) => {
      const c = ctx();
      notStudying(c);
      const kind = str(args.kind);
      const family = str(args.family) ? resolveFamily(c.corpus.structures, str(args.family)) : null;
      const pool = search(c.corpus.structures, { query: '', kind: kind === 'pdb' || kind === 'chebi' ? kind : null, family })
        .filter((e) => e.id !== c.selected?.id);
      if (!pool.length) throw new Error('NO_STRUCTURE: no other structure has that kind and family');
      const r = (c.random ?? Math.random)();
      const e = pool[Math.min(pool.length - 1, Math.floor(r * pool.length))]!;
      c.pick(e);
      return { shown: row(e) };
    },
    showPanel: (args: Record<string, unknown>) => {
      const c = ctx();
      const panel = str(args.panel);
      // The toolbar's own two buttons: « Review » and ✋.
      if (panel === 'review') c.setReviewing(true);
      else if (panel === 'gestures') c.setGestOpen(true);
      else throw new Error('BAD_ARG: panel must be review or gestures');
      return { open: panel };
    },
    closePanel: (args: Record<string, unknown>) => {
      const c = ctx();
      const asked = str(args.panel);
      if (asked && asked !== 'review' && asked !== 'gestures') throw new Error('BAD_ARG: panel must be review or gestures');
      const open = (asked ? [asked] : ['gestures', 'review']).filter((p) => (p === 'review' ? c.reviewing : c.gestOpen));
      if (!open.length) throw new Error(`NOTHING_OPEN: ${asked ? `the ${asked} panel is not open` : 'no panel is open'}`);
      for (const p of open) {
        // The review's own close button does exactly these two: the run ends, the stage comes back.
        if (p === 'review') { c.setStudying(false); c.setReviewing(false); } else c.setGestOpen(false);
      }
      return { closed: open };
    },
  };
  // agent-actions:end
}
