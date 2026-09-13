import { describe, expect, it } from 'vitest';
import type { ChebiEntry, Entry, PdbEntry } from './corpus';
import { byName, search, showsSideChains, SIDE_CHAIN_LIMIT } from './library';

const pdb = (over: Partial<PdbEntry> = {}): PdbEntry => ({
  kind: 'pdb', id: '1HHO', family: 'oxygen', why: '', label: 'Haemoglobin, oxy',
  name: 'STRUCTURE OF HUMAN OXYHAEMOGLOBIN', entities: ['HEMOGLOBIN A (OXY) (ALPHA CHAIN)'],
  uniprot: ['P69905'], method: 'X-RAY DIFFRACTION', resolution: 2.1, released: '1983-10-27',
  organisms: ['Homo sapiens'], atoms: 2396, chains: 2,
  file: 'pdb/1HHO.bcif.gz', bytes: 1, ...over,
});

const chebi = (over: Partial<ChebiEntry> = {}): ChebiEntry => ({
  kind: 'chebi', id: 'CHEBI:15377', family: 'small', why: '', name: 'water', alias: null,
  inchikey: 'XLYOFNOQVPJJNP-UHFFFAOYSA-N', formula: 'H2O', mass: 18.015, charge: null,
  iupac: 'oxidane', definition: '', atoms: 3, file: 'chebi/15377.sdf', bytes: 1, ...over,
});

const ALL = (query: string) => ({ query, kind: null, family: null });

describe('the search reaches identifiers, which is why it is worth having', () => {
  it('finds a structure by its UniProt accession', () => {
    // Someone with P69905 in their lecture notes should land on the structure
    // without knowing what it is called in the app's language.
    expect(search([pdb(), chebi()], ALL('P69905')).map((e) => e.id)).toEqual(['1HHO']);
  });

  it('finds a compound by an InChIKey pasted out of a paper', () => {
    expect(search([pdb(), chebi()], ALL('XLYOFNOQVPJJNP-UHFFFAOYSA-N')).map((e) => e.id))
      .toEqual(['CHEBI:15377']);
  });

  it('finds a compound by formula', () => {
    expect(search([pdb(), chebi()], ALL('H2O')).map((e) => e.id)).toEqual(['CHEBI:15377']);
  });

  it('finds a structure by organism', () => {
    expect(search([pdb(), chebi()], ALL('Homo sapiens')).map((e) => e.id)).toEqual(['1HHO']);
  });

  it('finds a compound by our alias, not only by ChEBI’s name', () => {
    const uric = chebi({ id: 'CHEBI:17775', name: '7,9-dihydro-1H-purine-2,6,8(3H)-trione', alias: 'uric acid' });
    expect(search([uric], ALL('uric acid')).map((e) => e.id)).toEqual(['CHEBI:17775']);
  });
});

describe('the query narrows instead of widening', () => {
  it('requires EVERY word to appear somewhere', () => {
    // The second entry must match ONE of the two words, or `some` and `every`
    // give the same answer and the test proves nothing. "human" is in both.
    const other = pdb({
      id: '1IGT', label: 'IgG antibody', name: 'STRUCTURE OF A HUMAN IGG',
      uniprot: [], organisms: ['Homo sapiens'],
    });
    expect(search([pdb(), other], ALL('human')).map((e) => e.id).sort()).toEqual(['1HHO', '1IGT']);
    expect(search([pdb(), other], ALL('human haemoglobin')).map((e) => e.id)).toEqual(['1HHO']);
  });

  it('admits everything for an empty query', () => {
    // An empty search box is not a filter. Returning nothing for it is the
    // classic way a library looks broken on first open.
    expect(search([pdb(), chebi()], ALL('')).length).toBe(2);
    expect(search([pdb(), chebi()], ALL('   ')).length).toBe(2);
  });

  it('ignores case and accents in both directions', () => {
    const acc = chebi({ id: 'CHEBI:1', name: 'Molécule' });
    expect(search([acc], ALL('molecule')).length).toBe(1);
    expect(search([acc], ALL('MOLÉCULE')).length).toBe(1);
  });

  it('honours the kind and family filters alongside the query', () => {
    const entries: Entry[] = [pdb(), chebi()];
    expect(search(entries, { query: '', kind: 'chebi', family: null }).map((e) => e.kind)).toEqual(['chebi']);
    expect(search(entries, { query: '', kind: null, family: 'oxygen' }).map((e) => e.id)).toEqual(['1HHO']);
    expect(search(entries, { query: 'water', kind: 'pdb', family: null })).toEqual([]);
  });
});

describe('resolution says what a picture cannot', () => {
  it('is unknown, not fine and not coarse, when nobody reported one', () => {
    // An NMR structure has no resolution. Warning about a number nobody
    // reported would be inventing one.
    expect(showsSideChains(null)).toBeNull();
  });

  it('calls a coarse structure coarse', () => {
    expect(showsSideChains(3.5)).toBe(false);
  });

  it('calls a fine structure fine, and includes the limit itself', () => {
    expect(showsSideChains(1.0)).toBe(true);
    expect(showsSideChains(SIDE_CHAIN_LIMIT)).toBe(true);
    expect(showsSideChains(SIDE_CHAIN_LIMIT + 0.01)).toBe(false);
  });
});

describe('the list is ordered by what the reader sees', () => {
  it('sorts on the label, not on the depositor title', () => {
    // Sorting on `name` would order the library by the first word of a
    // shouty sentence, which is nobody's idea of alphabetical.
    const a = pdb({ id: 'X', label: 'Alpha', name: 'ZZZ TITLE' });
    const b = pdb({ id: 'Y', label: 'Zulu', name: 'AAA TITLE' });
    expect([b, a].sort(byName).map((e) => e.id)).toEqual(['X', 'Y']);
  });
});
