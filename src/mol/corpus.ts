/**
 * corpus.ts — what is in the box, and how a structure file gets out of it.
 *
 * Everything here is offline. `public/corpus/` was written by
 * `scripts/build-corpus.mjs` and travels inside the cartridge; nothing in this
 * file reaches the network, on purpose, because the whole argument of this
 * surface is that it works with the cable pulled out.
 *
 * Two rules live here rather than in the screen that renders them.
 *
 * 1. AN ENTRY IS TWO LEVELS OF IDENTITY AND THEY ARE NEVER MERGED. `1HHO` is
 *    one EXPERIMENT — a crystal, a resolution, a year, a team. `P69905` is the
 *    PROTEIN that experiment was done on. Writing "Haemoglobin" above `1HHO`
 *    with nothing saying it is one structure OF that protein states something
 *    false about the world, in the same way an anatomy atlas would by putting
 *    the liver's answer under the heart's title.
 *
 * 2. A NUMBER NOBODY REPORTED IS NOT ZERO. Four of the 105 PDB entries are
 *    solution NMR and have no resolution at all. `0.0 A` renders them as
 *    perfect structures; `—` says nobody measured one.
 */
import { assetUrl } from './asset-url';

export type Kind = 'pdb' | 'chebi';

/** A macromolecule: one experiment, on one or more proteins. */
export interface PdbEntry {
  kind: 'pdb';
  /** The experiment. Four characters, never reassigned. */
  id: string;
  family: string;
  /** Why this entry is in the corpus at all. Editorial, written by a human. */
  why: string;
  /**
   * OUR short teaching name, chosen in the editorial list. It is what the
   * library and the quiz show, because the depositors' title is a full
   * sentence ("A NOVEL, HIGHLY STABLE FOLD OF...") that neither scans in a
   * list nor works as a quiz option — four of those and the longest one is
   * visibly the answer.
   */
  label: string;
  /** The depositors' own title for the experiment. Never replaced by `label`. */
  name: string;
  /** One description per polymer entity, e.g. the alpha and beta chains. */
  entities: string[];
  /** The PROTEIN(S). Empty for a DNA-only or peptide-only entry, and empty is not a failure. */
  uniprot: string[];
  method: string | null;
  /** Angstroms, or null when the method reports none. NEVER 0. */
  resolution: number | null;
  released: string | null;
  organisms: string[];
  /** What RCSB says was deposited. The viewer checks what it parsed against this. */
  atoms: number;
  chains: number | null;
  file: string;
  /** Size on disk, gzipped. What this entry costs you to carry offline. */
  bytes: number;
}

/** A small molecule: one compound, identified by a hash of its own structure. */
export interface ChebiEntry {
  kind: 'chebi';
  id: string;
  family: string;
  why: string;
  /** ChEBI's own name. Sometimes systematic. */
  name: string;
  /** OUR common name, shown BESIDE the ChEBI one, never instead of it. */
  alias: string | null;
  /**
   * 27 characters, a hash of the InChI string, so two people who draw the same
   * molecule in two programs get the same key. The first 14 encode the
   * constitution and the rest the stereochemistry, which is why a 14-character
   * prefix finds the stereoisomers of one molecule.
   */
  inchikey: string | null;
  formula: string | null;
  mass: number | null;
  charge: number | null;
  iupac: string | null;
  definition: string | null;
  atoms: number | null;
  file: string;
  /** Size on disk. SDF records are small and are not compressed. */
  bytes: number;
}

export type Entry = PdbEntry | ChebiEntry;

export interface Corpus {
  builtAt: string;
  counts: { pdb: number; chebi: number };
  /** ✂️ What the corpus is a slice OF. The screen says this out loud. */
  outOf: { pdb: string; chebi: string };
  sources: { name: string; licence: string; url: string }[];
  structures: Entry[];
}

export async function loadCorpus(): Promise<Corpus> {
  const r = await fetch(assetUrl('corpus/index.json'));
  if (!r.ok) throw new Error(`the structure catalogue could not be loaded (HTTP ${r.status})`);
  const c = (await r.json()) as Corpus;
  if (!Array.isArray(c?.structures) || !c.structures.length) {
    throw new Error('the structure catalogue is empty');
  }
  return c;
}

/**
 * The bytes of one structure, already un-gzipped.
 *
 * Static hosts serve `.gz` either as a compressed response the browser decodes
 * for us, or as a gzip FILE with no Content-Encoding at all. This shell is the
 * second case — its `mnemo-plugin://` handler sets no encoding header — while
 * the vite dev server may be the first. Sniffing the magic number covers both
 * without asking which one we are in. (Same reasoning as Atlas's
 * decodeModelResponse; the check is on the payload, never on the headers.)
 */
export async function loadStructure(entry: Entry): Promise<Uint8Array> {
  const r = await fetch(assetUrl(`corpus/${entry.file}`));
  if (!r.ok) throw new Error(`${entry.id} could not be loaded (HTTP ${r.status})`);
  const payload = await r.arrayBuffer();
  const sig = new Uint8Array(payload, 0, Math.min(2, payload.byteLength));
  if (sig[0] === 0x1f && sig[1] === 0x8b) {
    const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new Uint8Array(payload);
}

/**
 * What 3Dmol should be told the payload is.
 *
 * BinaryCIF must reach it as bytes and SDF as text; handing a Uint8Array to a
 * text parser produces a model with zero atoms and no error, which is the
 * quietest way this could fail.
 */
export const parserFor = (entry: Entry): { format: string; binary: boolean } =>
  entry.kind === 'pdb' ? { format: 'bcif', binary: true } : { format: 'sdf', binary: false };

/** A file size, for the card. Same rule as everything else: unknown is a dash. */
export const sizeText = (bytes: number | null): string => {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
};

/**
 * The label a human reads.
 *
 * Ours in both halves — the editorial `label` for a structure, the `alias` for
 * a compound ChEBI files under a systematic name — and the source's own words
 * are still printed on the identity card underneath. This is the ONE place
 * that decides, so the list, the quiz options and the memory question can
 * never disagree about what a structure is called.
 */
export const displayName = (e: Entry): string =>
  e.kind === 'chebi' ? (e.alias ?? e.name) : (e.label || e.name);

/**
 * A resolution, as text.
 *
 * 🎭 `null` is `—`. A structure solved by NMR has no resolution; a structure at
 * 3.5 A does not show side chains reliably and looks exactly like one at 1.0 A
 * on screen, so the number is what carries that, and it must never be invented.
 */
export const resolutionText = (r: number | null): string => (r === null ? '—' : `${r.toFixed(2)} Å`);

/** A mass, same rule. */
export const massText = (m: number | null): string => (m === null ? '—' : `${m.toFixed(3)} Da`);

/**
 * The families present in a corpus, largest first, with their counts.
 *
 * DERIVED, never a hand-written list: adding an entry to the editorial file
 * must not require remembering to add its family here too, and a family that
 * loses all its entries must stop appearing rather than showing an empty tile.
 */
export function familiesOf(entries: Entry[]): { id: string; total: number }[] {
  const n = new Map<string, number>();
  for (const e of entries) n.set(e.family, (n.get(e.family) ?? 0) + 1);
  return [...n].map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}
