import { describe, expect, it } from 'vitest';
import type { ChebiEntry, PdbEntry } from '../mol/corpus';
import { keysFor, questionFor } from './MoleculeMemory';

const pdb = (over: Partial<PdbEntry> = {}): PdbEntry => ({
  kind: 'pdb', id: '1HHO', family: 'oxygen', why: '', label: 'Haemoglobin, oxy',
  name: 'STRUCTURE OF HUMAN OXYHAEMOGLOBIN', entities: [], uniprot: ['P69905', 'P68871'],
  method: 'X-RAY DIFFRACTION', resolution: 2.1, released: '1983-10-27',
  organisms: ['Homo sapiens'], atoms: 2396, chains: 2,
  file: 'pdb/1HHO.bcif.gz', bytes: 1, ...over,
});

const chebi = (over: Partial<ChebiEntry> = {}): ChebiEntry => ({
  kind: 'chebi', id: 'CHEBI:15377', family: 'small', why: '', name: 'water', alias: null,
  inchikey: 'XLYOFNOQVPJJNP-UHFFFAOYSA-N', formula: 'H2O', mass: 18.015, charge: null,
  iupac: '', definition: '', atoms: 3, file: 'chebi/15377.sdf', bytes: 1, ...over,
});

describe('the question carries every key a note might have been written with', () => {
  it('carries the experiment AND the protein for a structure', () => {
    // Notes taken in a lecture say "haemoglobin"; notes copied off a slide say
    // 1HHO; a paper pasted into a vault says P69905. Asking with one of the
    // three misses the other two, and the identifier is the whole argument.
    expect(keysFor(pdb())).toEqual(['PDB 1HHO', 'UniProt P69905', 'UniProt P68871']);
  });

  it('still carries the experiment when there is no protein accession', () => {
    // Six entries in the corpus are DNA, RNA or peptide only. No accession is
    // not a failure, and it must not take the PDB id down with it.
    expect(keysFor(pdb({ uniprot: [] }))).toEqual(['PDB 1HHO']);
  });

  it('carries the ChEBI id, the InChIKey and the formula for a compound', () => {
    expect(keysFor(chebi())).toEqual(['CHEBI:15377', 'InChIKey XLYOFNOQVPJJNP-UHFFFAOYSA-N', 'H2O']);
  });

  it('omits an InChIKey nobody recorded rather than writing an empty one', () => {
    expect(keysFor(chebi({ inchikey: null, formula: null }))).toEqual(['CHEBI:15377']);
  });
});

describe('the sentence sent to the host', () => {
  it('names the structure and every key', () => {
    const q = questionFor(pdb());
    expect(q).toContain('Haemoglobin, oxy');
    expect(q).toContain('PDB 1HHO');
    expect(q).toContain('UniProt P69905');
  });

  it('names BOTH our alias and the source name when they differ', () => {
    // A student's notes may use either. Dropping one loses whichever half
    // they happened to write down.
    const uric = chebi({ id: 'CHEBI:17775', name: '7,9-dihydro-1H-purine-2,6,8(3H)-trione', alias: 'uric acid' });
    const q = questionFor(uric);
    expect(q).toContain('uric acid');
    expect(q).toContain('7,9-dihydro-1H-purine-2,6,8(3H)-trione');
  });

  it('does not repeat one name twice when there is no alias', () => {
    expect(questionFor(chebi())).toContain('water');
    expect(questionFor(chebi())).not.toContain('also called');
  });

  it('asks for the exact phrase that lets an empty answer be told from an error', () => {
    // Without this the "no notes yet" case is indistinguishable from a model
    // that simply had nothing to say, and the third silence disappears.
    expect(questionFor(pdb())).toContain('NOTHING IN MEMORY');
    expect(questionFor(pdb())).toContain('Answer only from my memory');
  });
});
