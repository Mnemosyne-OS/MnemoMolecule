/**
 * styles.ts — what to hand 3Dmol for a given representation, decided in a pure
 * function so the decision can be tested without a WebGL context.
 *
 * 🚨 THIS FILE EXISTS BECAUSE TWO OF THE FOUR BUTTONS CRASHED THE VIEWER on
 * every small molecule in the corpus — 117 of the 222 entries. Reported from a
 * running shell as `TypeError: Cannot read properties of undefined (reading
 * 'trim')`, thrown from 3Dmol's own `drawCartoon`:
 *
 *     for (var a = 0; a < atoms.length; a++) {
 *       next = atoms[a];
 *       var nextresn = next.resn.trim();      // <- unguarded
 *
 * A ribbon is drawn along a chain of RESIDUES, and 3Dmol reads `atom.resn` with
 * no guard. An SDF record has no residues at all: the string `resn` appears
 * ZERO times in 3Dmol's entire SDF parser, so every atom of every ChEBI entry
 * carries `resn === undefined`. Cartoon threw, and so did Surface, because the
 * surface case drew a cartoon underneath it.
 *
 * That is not a bug to paper over with a try/catch. A ribbon through a molecule
 * with no secondary structure is not a picture of anything, so the honest
 * answer is that the representation does not apply — the toolbar says so and
 * the drawing code refuses it.
 *
 * ⚖️ TWO SOURCES, ON PURPOSE, and they are not the same fact:
 *  - the TOOLBAR keys on `entry.kind`, which is known before anything is
 *    parsed, so a button can be disabled the moment a structure is picked;
 *  - the DRAWING keys on what the parse actually produced, because the kind is
 *    a proxy and the atoms are the truth. A PDB entry that somehow arrived
 *    without residue names must not crash either.
 */

export type Style = 'cartoon' | 'sticks' | 'spheres' | 'surface';

export const STYLES: Style[] = ['cartoon', 'sticks', 'spheres', 'surface'];

/** What 3Dmol is told to draw, and whether a surface goes on top. */
export interface StyleSpec {
  /** The object handed to `viewer.setStyle({}, …)`. */
  spec: Record<string, unknown>;
  /** Whether to call `addSurface` afterwards. */
  surface: boolean;
}

export interface ModelFacts {
  /** How many atoms the parse produced. */
  atoms: number;
  /**
   * Whether ANY atom carries a residue name. False for every SDF record, and
   * the precondition 3Dmol's cartoon renderer reads without checking.
   */
  hasResidues: boolean;
}

/**
 * The atom count above which drawing stops being instant, and above which the
 * per-atom stick underlay stops being worth its cost.
 *
 * MEASURED in a browser on the shipped corpus, click to drawn, cartoon plus
 * sticks: 1,102 atoms 154 ms · 6,907 766 ms · 10,434 1.2 s · 12,385 1.3 s ·
 * 16,222 2.0 s · 23,694 2.6 s · 33,549 3.0 s · 58,870 5.9 s · 237,685 ~21 s.
 * Two seconds is where a person stops assuming a click registered.
 */
export const SLOW_ATOMS = 20_000;

export const isSlowToDraw = (atoms: number): boolean => atoms > SLOW_ATOMS;

/**
 * Whether a ribbon means anything for this model.
 *
 * Not a capability check on the library — a statement about the molecule. A
 * compound with no residues has no backbone to trace.
 */
export const canDrawCartoon = (facts: ModelFacts): boolean => facts.hasResidues;

/** The cheap proxy the toolbar uses, before anything has been parsed. */
export const kindCanCartoon = (kind: 'pdb' | 'chebi' | null): boolean => kind === 'pdb';

/** Which representation makes sense by default for what was just picked. */
export const defaultStyleFor = (kind: 'pdb' | 'chebi' | null): Style =>
  kind === 'chebi' ? 'sticks' : 'cartoon';

const STICKS = { stick: { radius: 0.15 }, sphere: { scale: 0.22 } };

/**
 * The spec for one representation.
 *
 * `cartoon` on a model that cannot take one degrades to sticks rather than
 * throwing. The toolbar should already have prevented the choice; this is the
 * layer that makes it impossible rather than merely unlikely.
 */
export function styleSpec(style: Style, facts: ModelFacts): StyleSpec {
  const ribbon = canDrawCartoon(facts);
  switch (style) {
    case 'sticks':
      return { spec: STICKS, surface: false };

    case 'spheres':
      return { spec: { sphere: { scale: 0.9 } }, surface: false };

    case 'surface':
      // Something is drawn UNDER the surface so a surface that fails to
      // compute still leaves a molecule on screen rather than an empty box —
      // and what goes under depends on what the model can take.
      return {
        spec: ribbon ? { cartoon: { color: 'spectrum' } } : STICKS,
        surface: true,
      };

    case 'cartoon':
    default:
      if (!ribbon) return { spec: STICKS, surface: false };
      // 🪤 A stick per atom is not free at scale: measured on the ribosome the
      // sticks cost 2.1 s of a 14.8 s draw. They exist so a model with little
      // secondary structure is not left blank, and a model of tens of
      // thousands of atoms never is.
      return {
        spec: isSlowToDraw(facts.atoms)
          ? { cartoon: { color: 'spectrum' } }
          : { cartoon: { color: 'spectrum' }, stick: { radius: 0.12 } },
        surface: false,
      };
  }
}
