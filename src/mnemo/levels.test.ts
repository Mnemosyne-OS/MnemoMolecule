import { describe, expect, it } from 'vitest';
import type { ChebiEntry, Corpus, Entry, PdbEntry } from '../mol/corpus';
import {
  ALL_LEVEL, askablePool, canStudy, CHEBI_LEVEL, levelProgress, levelsOf, MIN_FOR_QUIZ, PDB_LEVEL,
} from './levels';
import { dayOf, TOP_BOX, type ReviewState } from './review';

const NOW = Date.UTC(2026, 8, 9, 22, 40);
const TODAY = dayOf(NOW);

const pdb = (id: string, family: string, label = `L-${id}`): PdbEntry => ({
  kind: 'pdb', id, family, why: '', label, name: `TITLE ${id}`, entities: [], uniprot: [],
  method: null, resolution: null, released: null, organisms: [], atoms: 1, chains: 1,
  file: '', bytes: 1,
});

const chebi = (id: string, family: string, alias: string | null = null): ChebiEntry => ({
  kind: 'chebi', id, family, why: '', name: `n-${id}`, alias, inchikey: null, formula: null,
  mass: null, charge: null, iupac: null, definition: null, atoms: null,
  file: '', bytes: 1,
});

const corpusOf = (structures: Entry[]): Corpus => ({
  builtAt: '2026-09-09', counts: { pdb: 0, chebi: 0 },
  outOf: { pdb: '', chebi: '' }, sources: [], structures,
});

describe('levels are derived from the corpus, never listed by hand', () => {
  const entries = [
    pdb('1', 'enzyme'), pdb('2', 'enzyme'), pdb('3', 'enzyme'),
    chebi('C1', 'sugar'), chebi('C2', 'sugar'),
  ];

  it('offers everything, each source, then each family present', () => {
    const ids = levelsOf(corpusOf(entries)).map((l) => l.id);
    expect(ids).toEqual([ALL_LEVEL, PDB_LEVEL, CHEBI_LEVEL, 'enzyme', 'sugar']);
  });

  it('does not offer a family the corpus does not contain', () => {
    // A hand-written list would keep showing a tile after its last entry was
    // removed, and nobody could enter it.
    expect(levelsOf(corpusOf(entries)).map((l) => l.id)).not.toContain('drug');
  });

  it('gives each level the total the quiz will actually draw from', () => {
    // Counting one thing on the tile and asking from another puts "20" on a
    // tile that runs out after 12, and the bar never fills for a reason
    // nobody can see.
    const c = corpusOf(entries);
    for (const lv of levelsOf(c)) {
      expect(askablePool(entries, lv)).toHaveLength(lv.total);
    }
  });

  it('sorts families by size, then by name for a stable order', () => {
    const many = [
      pdb('a', 'zeta'), pdb('b', 'zeta'),
      pdb('c', 'alpha'), pdb('d', 'alpha'),
      pdb('e', 'beta'), pdb('f', 'beta'), pdb('g', 'beta'),
    ];
    expect(levelsOf(corpusOf(many)).slice(3).map((l) => l.id)).toEqual(['beta', 'alpha', 'zeta']);
  });
});

describe('the option labels are the ones the reader sees', () => {
  it('uses our editorial label, so the option says what the tile counted', () => {
    const c = corpusOf([pdb('1HHO', 'oxygen', 'Haemoglobin, oxy')]);
    const all = levelsOf(c)[0]!;
    expect(askablePool(c.structures, all)[0]!.name).toBe('Haemoglobin, oxy');
  });

  it('uses our alias for a compound filed under a systematic name', () => {
    const c = corpusOf([chebi('CHEBI:17775', 'small', 'uric acid')]);
    expect(askablePool(c.structures, levelsOf(c)[0]!)[0]!.name).toBe('uric acid');
  });
});

describe('a level too small to ask fairly says so instead of starting', () => {
  it('refuses three candidates, and reports the count', () => {
    // With three, either the quiz shows fewer options — easier without saying
    // it got easier — or it borrows from another family, which is the one
    // thing that makes a right answer meaningless.
    const c = corpusOf([pdb('1', 'tiny'), pdb('2', 'tiny'), pdb('3', 'tiny')]);
    const tiny = levelsOf(c).find((l) => l.id === 'tiny')!;
    expect(canStudy(tiny)).toEqual({ ok: false, why: 'tooSmall', n: 3 });
  });

  it('accepts exactly the minimum', () => {
    const c = corpusOf(Array.from({ length: MIN_FOR_QUIZ }, (_, i) => pdb(`${i}`, 'ok')));
    expect(canStudy(levelsOf(c).find((l) => l.id === 'ok')!).ok).toBe(true);
  });

  it('tells an empty level apart from a small one', () => {
    // Two different sentences, because they send a reader to two different
    // next steps.
    const c = corpusOf([chebi('C', 'sugar')]);
    const pdbLevel = levelsOf(c).find((l) => l.id === PDB_LEVEL)!;
    expect(canStudy(pdbLevel)).toEqual({ ok: false, why: 'empty', n: 0 });
  });
});

describe('progress counts cards, never structures', () => {
  const entries = [pdb('1', 'enzyme'), pdb('2', 'enzyme'), pdb('3', 'enzyme'), pdb('4', 'enzyme')];
  const level = levelsOf(corpusOf(entries)).find((l) => l.id === 'enzyme')!;

  it('reports zero studied for a level nobody opened', () => {
    const p = levelProgress(level, entries, { v: 1, cards: {} }, NOW);
    expect(p).toEqual({ studied: 0, mastered: 0, due: 0, ratio: 0 });
  });

  it('counts only cards inside the level', () => {
    const state: ReviewState = {
      v: 1,
      cards: { '1': { b: TOP_BOX, d: TODAY - 1, n: 5 }, ELSEWHERE: { b: 2, d: TODAY, n: 1 } },
    };
    const p = levelProgress(level, entries, state, NOW);
    expect(p.studied).toBe(1);
    expect(p.mastered).toBe(1);
    expect(p.due).toBe(1);
    expect(p.ratio).toBeCloseTo(0.25);
  });

  it('reports a ratio of 0 for a level with no structures rather than dividing by zero', () => {
    const empty = { id: 'x', match: () => false, total: 0 };
    expect(levelProgress(empty, entries, { v: 1, cards: {} }, NOW).ratio).toBe(0);
  });
});
