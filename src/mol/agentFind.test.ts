/**
 * agentFind — a structure named the way a person says it, in three languages, against the REAL
 * corpus the cartridge ships: several matches are refused with names, never guessed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findNamed, nameWords, stem } from './agentFind';
import { resolveFamily, resolveStructure } from './moleculeAgent';
import { SPOKEN_NAMES } from './spokenNames';
import type { Corpus } from './corpus';

const corpus = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'corpus', 'index.json'), 'utf8')) as Corpus;
const all = corpus.structures;
const idOf = (ref: string) => resolveStructure(all, ref).id;

describe('stem and nameWords', () => {
  it('makes French, Spanish and English spellings of one name meet', () => {
    expect(stem('insuline')).toBe(stem('insulin'));
    expect(stem('insulina')).toBe(stem('insulin'));
    expect(stem('caféine')).toBe(stem('caffeine'));
    expect(stem('hémoglobine')).toBe(stem('haemoglobin'));
    expect(stem('œstrogène')).toBe(stem('estrogen'));
    expect(stem('ADN')).toBe('dna');
  });
  it('drops articles before the accents come off', () => {
    expect(nameWords('la caféine')).toEqual([stem('caffeine')]);
    expect(nameWords('the molecule of water')).toEqual(['water']);
  });
});

describe('findNamed', () => {
  const entries = [
    { item: 'a', id: 'X1', names: ['Vase'], label: 'Vase' },
    { item: 'b', id: 'X2', names: ['Vase bleu'], label: 'Vase bleu' },
    { item: 'c', id: 'X3', names: ['Vase vert'], label: 'Vase vert' },
  ];
  const kind = { code: 'NO_THING', noun: 'thing' };
  it('takes an id, then the whole name over a partial one', () => {
    expect(findNamed(entries, 'x2', kind)).toBe('b');
    expect(findNamed(entries, 'le vase', kind)).toBe('a');
    expect(findNamed(entries, 'bleu', kind)).toBe('b');
  });
  it('refuses several partial matches with their names, and no match with the list', () => {
    expect(() => findNamed(entries.slice(1), 'vases', kind)).toThrow(/^AMBIGUOUS: "vases" names several things: Vase bleu, Vase vert; say which$/);
    expect(() => findNamed(entries, 'pot', kind)).toThrow(/^NO_THING: no thing named "pot"; things: Vase, Vase bleu, Vase vert$/);
  });
});

describe('resolveStructure on the shipped corpus', () => {
  it('finds a small molecule by its French, Spanish or English name', () => {
    expect(idOf('caféine')).toBe('CHEBI:27732');
    expect(idOf('cafeína')).toBe('CHEBI:27732');
    expect(idOf('caffeine')).toBe('CHEBI:27732');
    expect(idOf('aspirine')).toBe('CHEBI:15365');
    expect(idOf("l'eau")).toBe('CHEBI:15377');
    expect(idOf('la vitamine C')).toBe('CHEBI:29073');
    expect(idOf('saccharose')).toBe('CHEBI:17992');
    expect(idOf('paracétamol')).toBe('CHEBI:46195');
  });
  it('finds a protein whose name is said whole, over the complexes that carry it', () => {
    expect(idOf('insuline')).toBe('4INS');
    expect(idOf('myoglobine')).toBe('1MBN');
    expect(idOf('GFP')).toBe('1GFL');
  });
  it('still takes an id and an identifier the names do not carry', () => {
    expect(idOf('chebi:15377')).toBe('CHEBI:15377');
    expect(idOf('1hho')).toBe('1HHO');
    expect(idOf('H2O')).toBe('CHEBI:15377');
  });
  it('refuses a name several structures carry, naming them with their ids', () => {
    expect(() => idOf('hémoglobine')).toThrow(/^AMBIGUOUS: "hémoglobine" names several structures: .*\(1HHO\).*; say which$/);
    expect(() => idOf('hemoglobin')).toThrow(/^AMBIGUOUS/);
  });
  it('refuses an unknown name with names and the way to search', () => {
    expect(() => idOf('kryptonite')).toThrow(/^NO_STRUCTURE: no structure named "kryptonite"; structures: .*Use find to search the library$/);
  });
  it('every spoken name points at a structure the corpus ships, and reaches it', () => {
    const ids = new Set(all.map((e) => e.id));
    for (const [id, names] of Object.entries(SPOKEN_NAMES)) {
      expect(ids.has(id), id).toBe(true);
      for (const n of names) expect(idOf(n), `${n} -> ${id}`).toBe(id);
    }
  });
});

describe('resolveFamily', () => {
  it('takes an id or its label in any of the three languages', () => {
    expect(resolveFamily(all, 'drug')).toBe('drug');
    expect(resolveFamily(all, 'les médicaments')).toBe('drug');
    expect(resolveFamily(all, 'sucres')).toBe('sugar');
    expect(resolveFamily(all, 'azúcares')).toBe('sugar');
    expect(resolveFamily(all, 'hormones')).toBe('hormone');
  });
  it('refuses a family word several families share, and an unknown one with the ids', () => {
    expect(() => resolveFamily(all, 'protéines')).toThrow(/^AMBIGUOUS: "protéines" names several families: .*membrane/);
    expect(() => resolveFamily(all, 'planètes')).toThrow(/^NO_FAMILY: .*drug/);
  });
});
