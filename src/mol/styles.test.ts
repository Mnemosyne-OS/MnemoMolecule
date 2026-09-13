import { describe, expect, it } from 'vitest';
import {
  canDrawCartoon, defaultStyleFor, isSlowToDraw, kindCanCartoon, SLOW_ATOMS, styleSpec, STYLES,
  type ModelFacts,
} from './styles';

const protein = (atoms = 2396): ModelFacts => ({ atoms, hasResidues: true });
const compound = (atoms = 14): ModelFacts => ({ atoms, hasResidues: false });

describe('a ribbon is never drawn through a molecule that has no residues', () => {
  // Reported from a running shell: TypeError "Cannot read properties of
  // undefined (reading 'trim')", thrown by 3Dmol's own drawCartoon at
  // `next.resn.trim()`. The string `resn` appears ZERO times in its SDF
  // parser, so every atom of all 117 ChEBI entries has resn === undefined.
  it('never emits a cartoon key for a model with no residues', () => {
    expect(styleSpec('cartoon', compound()).spec).not.toHaveProperty('cartoon');
  });

  it('never emits one under a SURFACE either — that crashed too', () => {
    // The surface case draws something underneath so a failed surface still
    // leaves a molecule on screen. On a compound that underlay must not be a
    // cartoon.
    expect(styleSpec('surface', compound()).spec).not.toHaveProperty('cartoon');
    expect(styleSpec('surface', compound()).surface).toBe(true);
  });

  it('emits no cartoon key for ANY style on a residue-less model', () => {
    for (const s of STYLES) {
      expect({ s, spec: styleSpec(s, compound()).spec }).toEqual({
        s, spec: expect.not.objectContaining({ cartoon: expect.anything() }),
      });
    }
  });

  it('still draws something rather than nothing', () => {
    // Degrading to an empty spec would trade a crash for an empty box, which
    // reads as "this molecule has no shape".
    for (const s of STYLES) {
      expect(Object.keys(styleSpec(s, compound()).spec).length).toBeGreaterThan(0);
    }
  });

  it('does draw a ribbon when there ARE residues', () => {
    expect(styleSpec('cartoon', protein()).spec).toHaveProperty('cartoon');
    expect(styleSpec('surface', protein()).spec).toHaveProperty('cartoon');
  });

  it('reads the model, not the file type', () => {
    expect(canDrawCartoon({ atoms: 10, hasResidues: true })).toBe(true);
    expect(canDrawCartoon({ atoms: 100000, hasResidues: false })).toBe(false);
  });
});

describe('the toolbar uses the cheap proxy, before anything is parsed', () => {
  it('offers a ribbon for an experimental structure and not for a compound', () => {
    expect(kindCanCartoon('pdb')).toBe(true);
    expect(kindCanCartoon('chebi')).toBe(false);
  });

  it('says nothing about a structure nobody picked', () => {
    expect(kindCanCartoon(null)).toBe(false);
  });

  it('opens a compound on sticks, since a ribbon would draw nothing', () => {
    expect(defaultStyleFor('chebi')).toBe('sticks');
    expect(defaultStyleFor('pdb')).toBe('cartoon');
  });
});

describe('a draw that is not instant says so', () => {
  it('calls the ribosome slow', () => {
    // Measured click-to-drawn on the shipped file: ~21 s for 237,685 atoms.
    // A silent wait that long reads as a click that never registered.
    expect(isSlowToDraw(237_685)).toBe(true);
  });

  it('calls an ordinary structure fast', () => {
    // 2,396 atoms drew in 144 ms. A notice that fires on everything is a
    // notice nobody reads.
    expect(isSlowToDraw(2_396)).toBe(false);
  });

  it('puts the line exactly where it was measured', () => {
    expect(isSlowToDraw(SLOW_ATOMS)).toBe(false);
    expect(isSlowToDraw(SLOW_ATOMS + 1)).toBe(true);
  });

  it('drops the per-atom stick underlay on a huge model', () => {
    // Measured on the ribosome: the sticks cost 2.1 s of a 14.8 s draw, and a
    // model that size is never left blank by the cartoon alone.
    expect(styleSpec('cartoon', protein(237_685)).spec).not.toHaveProperty('stick');
    expect(styleSpec('cartoon', protein(2_396)).spec).toHaveProperty('stick');
  });
});
