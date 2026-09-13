import { describe, expect, it } from 'vitest';
import {
  displayName, familiesOf, massText, parserFor, resolutionText,
  type ChebiEntry, type Entry, type PdbEntry,
} from './corpus';

const pdb = (over: Partial<PdbEntry> = {}): PdbEntry => ({
  kind: 'pdb', id: '1HHO', family: 'oxygen', why: 'because', label: 'Haemoglobin, oxy',
  name: 'STRUCTURE OF HUMAN OXYHAEMOGLOBIN AT 2.1 ANGSTROMS RESOLUTION',
  entities: ['HEMOGLOBIN A (OXY) (ALPHA CHAIN)'], uniprot: ['P69905'],
  method: 'X-RAY DIFFRACTION', resolution: 2.1, released: '1983-10-27',
  organisms: ['Homo sapiens'], atoms: 2396, chains: 2,
  file: 'pdb/1HHO.bcif.gz', bytes: 53539, ...over,
});

const chebi = (over: Partial<ChebiEntry> = {}): ChebiEntry => ({
  kind: 'chebi', id: 'CHEBI:15377', family: 'small', why: 'because',
  name: 'water', alias: null, inchikey: 'XLYOFNOQVPJJNP-UHFFFAOYSA-N',
  formula: 'H2O', mass: 18.015, charge: null, iupac: 'oxidane', definition: 'An oxygen hydride',
  atoms: 3, file: 'chebi/15377.sdf', bytes: 342, ...over,
});

describe('a number nobody reported is not zero', () => {
  it('renders a missing resolution as a dash', () => {
    // Four of the 105 PDB entries are solution NMR. "0.00 A" would draw them
    // as perfect structures.
    expect(resolutionText(null)).toBe('—');
  });

  it('renders a reported resolution with its unit', () => {
    expect(resolutionText(2.1)).toBe('2.10 Å');
  });

  it('does not confuse a real zero-ish value with an absent one', () => {
    // 0 is not reachable for a resolution, but the FORMATTER must not be the
    // thing that decides that: it prints what it is given.
    expect(massText(0)).toBe('0.000 Da');
    expect(massText(null)).toBe('—');
  });
});

describe('the label a human reads', () => {
  it('is our editorial label for a structure, never the depositor title', () => {
    // The depositor title is a full sentence. Four of those as quiz options
    // and the longest one is visibly the answer.
    expect(displayName(pdb())).toBe('Haemoglobin, oxy');
  });

  it('falls back to the depositor title when no label was written', () => {
    expect(displayName(pdb({ label: '' }))).toContain('OXYHAEMOGLOBIN');
  });

  it('is our alias for a compound ChEBI files under a systematic name', () => {
    const uric = chebi({ name: '7,9-dihydro-1H-purine-2,6,8(3H)-trione', alias: 'uric acid' });
    expect(displayName(uric)).toBe('uric acid');
  });

  it('is ChEBI’s own name when we wrote no alias', () => {
    expect(displayName(chebi())).toBe('water');
  });
});

describe('the parser is chosen by kind, and the binary flag with it', () => {
  it('sends a PDB entry to the binary bcif parser', () => {
    // Handing a Uint8Array to a text parser produces a model with zero atoms
    // and no error at all — the quietest way this could fail.
    expect(parserFor(pdb())).toEqual({ format: 'bcif', binary: true });
  });

  it('sends a ChEBI entry to the text sdf parser', () => {
    expect(parserFor(chebi())).toEqual({ format: 'sdf', binary: false });
  });
});

describe('families are derived from the corpus, never listed by hand', () => {
  it('counts what is actually present, largest first', () => {
    const entries: Entry[] = [
      pdb({ id: 'A', family: 'enzyme' }), pdb({ id: 'B', family: 'enzyme' }),
      pdb({ id: 'C', family: 'enzyme' }), chebi({ id: 'D', family: 'sugar' }),
    ];
    expect(familiesOf(entries)).toEqual([
      { id: 'enzyme', total: 3 },
      { id: 'sugar', total: 1 },
    ]);
  });

  it('reports no family for an empty corpus rather than an invented one', () => {
    expect(familiesOf([])).toEqual([]);
  });

  it('breaks ties by name so the list does not reshuffle between renders', () => {
    const entries: Entry[] = [pdb({ id: 'A', family: 'zeta' }), pdb({ id: 'B', family: 'alpha' })];
    expect(familiesOf(entries).map((f) => f.id)).toEqual(['alpha', 'zeta']);
  });
});
