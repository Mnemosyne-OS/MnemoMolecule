/**
 * The question MoleculeMemory sends to the host, pure. Its own module: a .tsx
 * that exports a component AND plain functions is the pair React Fast Refresh
 * refuses (every save above it reloaded the whole cartridge).
 */
import { displayName, type Entry } from '../mol/corpus';

/**
 * Every key a reader's notes might carry for this structure.
 *
 * Exported and pure because it is the part worth pinning in a test: a question
 * that quietly stops carrying the accession still LOOKS like it works, and
 * only misses the notes that were the reason to build this.
 */
export function keysFor(entry: Entry): string[] {
  if (entry.kind === 'pdb') {
    // The experiment first, then the protein. Both, always — one names the
    // structure on screen and the other names what it is a structure OF.
    return [`PDB ${entry.id}`, ...entry.uniprot.map((u) => `UniProt ${u}`)];
  }
  const out = [entry.id];
  if (entry.inchikey) out.push(`InChIKey ${entry.inchikey}`);
  if (entry.formula) out.push(entry.formula);
  return out;
}

/** The sentence sent to the host. Pure, for the same reason. */
export function questionFor(entry: Entry): string {
  const names = entry.kind === 'chebi' && entry.alias && entry.alias !== entry.name
    ? `${entry.alias} (also called ${entry.name})`
    : displayName(entry);
  return (
    `What do my own notes say about ${names} — ${keysFor(entry).join(', ')}? ` +
    'Answer only from my memory. If my memory holds nothing about it, say exactly: NOTHING IN MEMORY.'
  );
}
