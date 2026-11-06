/**
 * moleculeAgent — the agent's moves are the page's own, and every refusal is named.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ChebiEntry, Corpus, Entry, PdbEntry } from './corpus';
import { moleculeAgentHandlers, readLimit, resolveStructure, type MoleculeAgentContext } from './moleculeAgent';
import { registerStage, type StageView } from './stage';

const pdb = (id: string, label: string, family = 'oxygen'): PdbEntry => ({
  kind: 'pdb', id, family, why: '', label, name: `${label} TITLE`, entities: [], uniprot: [], method: null,
  resolution: null, released: null, organisms: [], atoms: 1, chains: 1, file: `${id}.bcif.gz`, bytes: 1,
});
const chebi = (id: string, name: string, alias: string | null, family = 'small'): ChebiEntry => ({
  kind: 'chebi', id, family, why: '', name, alias, inchikey: null, formula: null, mass: null, charge: null,
  iupac: null, definition: null, atoms: 3, file: `${id}.sdf`, bytes: 1,
});

const entries: Entry[] = [
  pdb('1A3N', 'Haemoglobin'),
  pdb('1MBN', 'Myoglobin'),
  pdb('2HHB', 'Haemoglobin deoxy'),
  chebi('CHEBI:15377', 'water', 'Water'),
  chebi('CHEBI:27732', 'caffeine', null),
];
const corpus: Corpus = { builtAt: '2026', counts: { pdb: 3, chebi: 2 }, outOf: { pdb: 1, chebi: 1 }, sources: [], structures: entries };

function ctx(over: Partial<MoleculeAgentContext> = {}): MoleculeAgentContext {
  return {
    corpus, selected: null, style: 'cartoon', spinning: false, studying: false, reviewing: false,
    query: '', kind: null, family: null,
    pick: vi.fn(), setStyle: vi.fn(), setSpinning: vi.fn(), recentre: vi.fn(),
    setQuery: vi.fn(), setKind: vi.fn(), setFamily: vi.fn(),
    gestOpen: false, setReviewing: vi.fn(), setStudying: vi.fn(), setGestOpen: vi.fn(),
    ...over,
  };
}

describe('resolveStructure', () => {
  it('takes an id, whatever its case', () => {
    expect(resolveStructure(entries, '1a3n').id).toBe('1A3N');
  });
  it('takes an exact name before a partial one', () => {
    expect(resolveStructure(entries, 'haemoglobin').id).toBe('1A3N');
  });
  it('refuses a name that matches several structures, with their ids', () => {
    expect(() => resolveStructure(entries, 'globin')).toThrow(/^AMBIGUOUS: .*1A3N.*2HHB/);
  });
  it('says how to list when nothing matches', () => {
    expect(() => resolveStructure(entries, 'insulin')).toThrow(/^NO_STRUCTURE: .*find/);
  });
});

describe('readLimit', () => {
  it('defaults to 20 and refuses a negative or broken limit', () => {
    expect(readLimit(undefined)).toBe(20);
    expect(() => readLimit(-1)).toThrow(/^BAD_ARG/);
    expect(() => readLimit(0)).toThrow(/^BAD_ARG/);
    expect(() => readLimit(2.5)).toThrow(/^BAD_ARG/);
    expect(() => readLimit(51)).toThrow(/^BAD_ARG/);
  });
});

describe('the handlers', () => {
  it('find answers the total and at most limit rows', () => {
    const r = moleculeAgentHandlers(() => ctx()).find({ text: 'globin', limit: 1 });
    expect(r.total).toBe(3);
    expect(r.structures).toHaveLength(1);
  });

  it('find refuses an unknown family by naming the existing ones', () => {
    expect(() => moleculeAgentHandlers(() => ctx()).find({ family: 'nope' })).toThrow(/^NO_FAMILY: .*oxygen/);
  });

  it('show goes through the library row\'s own pick', () => {
    const c = ctx();
    moleculeAgentHandlers(() => c).show({ structure: 'Myoglobin' });
    expect(c.pick).toHaveBeenCalledWith(entries[1]);
  });

  it('show and filterLibrary are refused while a review run is on', () => {
    const c = ctx({ studying: true });
    const h = moleculeAgentHandlers(() => c);
    expect(() => h.show({ structure: '1A3N' })).toThrow(/^REVIEWING/);
    expect(() => h.filterLibrary({ text: 'water' })).toThrow(/^REVIEWING/);
    expect(c.pick).not.toHaveBeenCalled();
    expect(c.setQuery).not.toHaveBeenCalled();
  });

  it('setStyle refuses a ribbon for a small molecule and anything with nothing shown', () => {
    const none = ctx();
    expect(() => moleculeAgentHandlers(() => none).setStyle({ style: 'sticks' })).toThrow(/^NOTHING_SHOWN/);
    const small = ctx({ selected: entries[3] });
    expect(() => moleculeAgentHandlers(() => small).setStyle({ style: 'cartoon' })).toThrow(/^NO_CARTOON/);
    expect(small.setStyle).not.toHaveBeenCalled();
    moleculeAgentHandlers(() => small).setStyle({ style: 'spheres' });
    expect(small.setStyle).toHaveBeenCalledWith('spheres');
  });

  it('spin and resetView need a structure on the stage', () => {
    const none = ctx();
    expect(() => moleculeAgentHandlers(() => none).spin({ on: true })).toThrow(/^NOTHING_SHOWN/);
    expect(() => moleculeAgentHandlers(() => none).resetView()).toThrow(/^NOTHING_SHOWN/);
    const c = ctx({ selected: entries[0] });
    moleculeAgentHandlers(() => c).spin({ on: true });
    moleculeAgentHandlers(() => c).resetView();
    expect(c.setSpinning).toHaveBeenCalledWith(true);
    expect(c.recentre).toHaveBeenCalledTimes(1);
  });

  it('filterLibrary replaces the whole filter, and "all" clears kind and family', () => {
    const c = ctx({ query: 'old', kind: 'pdb', family: 'oxygen' });
    const r = moleculeAgentHandlers(() => c).filterLibrary({ kind: 'all', family: 'all' });
    expect(c.setQuery).toHaveBeenCalledWith('');
    expect(c.setKind).toHaveBeenCalledWith(null);
    expect(c.setFamily).toHaveBeenCalledWith(null);
    expect(r.listed).toBe(5);
  });
});

describe('the voice handlers (doc 149 §19)', () => {
  const fakeView = (): StageView & { zoom: ReturnType<typeof vi.fn>; rotate: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> } =>
    ({ zoom: vi.fn(), rotate: vi.fn(), render: vi.fn() });

  it('show takes the name a person says and refuses a shared one with names and ids', () => {
    const c = ctx();
    moleculeAgentHandlers(() => c).show({ structure: 'caféine' });
    expect(c.pick).toHaveBeenCalledWith(entries[4]);
    // The whole name said wins over the longer one that holds it.
    moleculeAgentHandlers(() => c).show({ structure: 'hémoglobine' });
    expect(c.pick).toHaveBeenLastCalledWith(entries[0]);
    const twoOnly: Corpus = { ...corpus, structures: [pdb('1HHO', 'Haemoglobin, oxy'), pdb('2HHB', 'Haemoglobin deoxy')] };
    const shared = ctx({ corpus: twoOnly });
    expect(() => moleculeAgentHandlers(() => shared).show({ structure: 'hémoglobine' }))
      .toThrow(/^AMBIGUOUS: "hémoglobine" names several structures: Haemoglobin, oxy \(1HHO\), Haemoglobin deoxy \(2HHB\); say which$/);
    expect(shared.pick).not.toHaveBeenCalled();
  });

  it('showRandom refuses a family word several families share', () => {
    const mixed: Corpus = { ...corpus, structures: [pdb('1A', 'A', 'membrane'), pdb('1B', 'B', 'immune')] };
    expect(() => moleculeAgentHandlers(() => ctx({ corpus: mixed })).showRandom({ family: 'protéines' })).toThrow(/^AMBIGUOUS: .*families: /);
  });

  it('find and filterLibrary take a family by its French name', () => {
    const c = ctx();
    expect(moleculeAgentHandlers(() => c).find({ family: 'transport de l’oxygène' }).total).toBe(3);
    moleculeAgentHandlers(() => c).filterLibrary({ family: 'Métabolites' });
    expect(c.setFamily).toHaveBeenCalledWith('small');
  });

  it('zoom and turn run the 3D view\'s own calls, and refuse when no view runs', () => {
    const v = fakeView();
    registerStage(v);
    const c = ctx({ selected: entries[0] });
    expect(moleculeAgentHandlers(() => c).zoom({ direction: 'in', times: 2 })).toEqual({ zoomed: 'in', times: 2 });
    expect(v.zoom).toHaveBeenCalledWith(1.25 ** 2);
    moleculeAgentHandlers(() => c).turn({ degrees: 90 });
    expect(v.rotate).toHaveBeenCalledWith(90, 'y');
    expect(v.render).toHaveBeenCalledTimes(2);
    expect(() => moleculeAgentHandlers(() => c).zoom({ direction: 'in', times: 9 })).toThrow(/^BAD_ARG/);
    expect(() => moleculeAgentHandlers(() => c).turn({ degrees: 0 })).toThrow(/^BAD_ARG/);
    registerStage(null, v);
    expect(() => moleculeAgentHandlers(() => c).zoom({ direction: 'out' })).toThrow(/^WRITE_FAILED/);
    expect(() => moleculeAgentHandlers(() => c).turn({ degrees: 180, axis: 'x' })).toThrow(/^WRITE_FAILED/);
    expect(() => moleculeAgentHandlers(() => ctx()).zoom({ direction: 'in' })).toThrow(/^NOTHING_SHOWN/);
  });

  it('a late teardown of an old view does not withdraw the new one', () => {
    const old = fakeView();
    const now = fakeView();
    registerStage(old);
    registerStage(now);
    registerStage(null, old);
    moleculeAgentHandlers(() => ctx({ selected: entries[0] })).zoom({ direction: 'out' });
    expect(now.zoom).toHaveBeenCalledWith(1 / 1.25);
    registerStage(null, now);
  });

  it('showRandom picks through the row\'s own pick, never the one shown, and is refused during a run', () => {
    const c = ctx({ selected: entries[3], random: () => 0.99 });
    moleculeAgentHandlers(() => c).showRandom({ kind: 'chebi' });
    expect(c.pick).toHaveBeenCalledWith(entries[4]);
    expect(() => moleculeAgentHandlers(() => ctx({ studying: true })).showRandom({})).toThrow(/^REVIEWING/);
  });

  it('showPanel and closePanel press the page\'s own buttons', () => {
    const c = ctx();
    moleculeAgentHandlers(() => c).showPanel({ panel: 'review' });
    expect(c.setReviewing).toHaveBeenCalledWith(true);
    moleculeAgentHandlers(() => c).showPanel({ panel: 'gestures' });
    expect(c.setGestOpen).toHaveBeenCalledWith(true);
    expect(() => moleculeAgentHandlers(() => c).closePanel({})).toThrow(/^NOTHING_OPEN/);
    const open = ctx({ reviewing: true, studying: true });
    expect(moleculeAgentHandlers(() => open).closePanel({})).toEqual({ closed: ['review'] });
    expect(open.setStudying).toHaveBeenCalledWith(false);
    expect(open.setReviewing).toHaveBeenCalledWith(false);
    expect(open.setGestOpen).not.toHaveBeenCalled();
  });
});
