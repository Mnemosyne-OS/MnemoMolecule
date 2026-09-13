/**
 * library.ts — finding a structure in the corpus, and one judgement about
 * resolution. Pure, so both can be tested against inputs instead of a screen.
 */
import { displayName, type Entry } from './corpus';

/**
 * The threshold under which a structure stops showing side chains reliably.
 *
 * 3.0 Å is the conventional line in crystallography teaching, and the point is
 * not the exact number: a structure at 3.5 Å and one at 1.0 Å produce the SAME
 * picture on screen, so if the interface says nothing, the picture is the only
 * evidence the reader has and it is misleading. The notice names the actual
 * resolution rather than a grade, so a reader can disagree with our line.
 *
 * ⚠️ It applies only to a resolution that EXISTS. An NMR structure has none,
 * and warning about a number nobody reported would be inventing one.
 */
export const SIDE_CHAIN_LIMIT = 3.0;

export const showsSideChains = (resolution: number | null): boolean | null =>
  resolution === null ? null : resolution <= SIDE_CHAIN_LIMIT;

/** Fold accents and case so "Molecule" finds "Molécule" and vice versa. */
const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Everything a query should be able to reach.
 *
 * Identifiers are in here on purpose and they are the reason the search is
 * worth having: someone with `P69905` in their lecture notes, or an InChIKey
 * pasted out of a paper, should land on the structure without knowing what it
 * is called in the language the app happens to be in.
 */
function haystack(e: Entry): string {
  const parts: string[] = [e.id, e.name, e.family];
  if (e.kind === 'pdb') {
    parts.push(...e.uniprot, ...e.entities, ...e.organisms);
    if (e.method) parts.push(e.method);
  } else {
    if (e.alias) parts.push(e.alias);
    if (e.inchikey) parts.push(e.inchikey);
    if (e.formula) parts.push(e.formula);
    if (e.iupac) parts.push(e.iupac);
  }
  return fold(parts.join(' '));
}

export interface Filter {
  query: string;
  /** null = every kind. */
  kind: Entry['kind'] | null;
  /** null = every family. */
  family: string | null;
}

/**
 * The entries a filter admits, in the order they should be listed.
 *
 * Every word of the query has to appear somewhere, so "human haemoglobin"
 * narrows instead of widening. An empty query admits everything: an empty
 * search box is not a filter, and returning nothing for it is the classic way
 * a library looks broken on first open.
 */
export function search(entries: Entry[], f: Filter): Entry[] {
  const terms = fold(f.query).split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (f.kind && e.kind !== f.kind) return false;
    if (f.family && e.family !== f.family) return false;
    if (!terms.length) return true;
    const h = haystack(e);
    return terms.every((tm) => h.includes(tm));
  });
}

/** Sorting the list a human reads: by the label they see. */
export const byName = (a: Entry, b: Entry): number =>
  displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });
