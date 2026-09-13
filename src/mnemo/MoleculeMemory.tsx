/**
 * The Mnemosyne seam: what this cartridge adds to a structure viewer.
 *
 * Ported from Atlas's `AtlasMemory.tsx`, and its three rules are kept verbatim
 * in spirit because each was a decision rather than a default. What changes is
 * the KEY, and it changes for the better: anatomy has one identifier per part,
 * chemistry has two per structure and one of them is a hash.
 *
 * 1. IT IS A BUTTON, NOT A SUBSCRIPTION. `mnemosyne.query` is an LLM call with
 *    RAG attached (pluginCartridgeActions.ts -> model.infer), so it costs a
 *    cloud inference on a cloud route. Firing one every time a structure is
 *    clicked would bill someone for browsing a library. A retrieval-only host
 *    action would let this panel fill itself in silently; that action does not
 *    exist today and is named as the follow-up rather than faked here.
 *
 * 2. THE ANSWER IS BOUND TO THE STRUCTURE IT WAS ASKED ABOUT. Every state
 *    resets when `entry.id` changes, and a reply that lands after the human has
 *    moved on is DROPPED. Showing haemoglobin's answer under lysozyme's title
 *    is not a stale render, it is a fabricated fact.
 *
 * 3. THE THREE SILENCES ARE THREE DIFFERENT SENTENCES. "Opened outside the
 *    shell", "memory refused the request" and "your memory holds nothing about
 *    this molecule" send a reader to three different next steps. Merged into
 *    one grey line, two of the three people are sent to fix the wrong thing —
 *    and the third, who simply has no notes yet, is told it is broken.
 *
 * The fourth rule is this cartridge's own.
 *
 * 4. THE QUESTION CARRIES THE NAME AND EVERY IDENTIFIER. Notes written during
 *    a lecture say "haemoglobin"; notes copied off a slide say `1HHO`; a paper
 *    pasted into a vault says `P69905`. Asking with only one of them misses the
 *    other two, and the whole argument for this surface is that the identifier
 *    is what survives language, spelling and source.
 */
import { useEffect, useRef, useState } from 'react';
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import { displayName, type Entry } from '../mol/corpus';
import { useI18n } from '../i18n/useI18n';

// Must match "name" in mnemo-plugin.json — the host keys permissions on it.
const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/mnemo-molecule');

type Phase =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'answered'; text: string }
  | { kind: 'empty' }
  | { kind: 'no-host' }
  | { kind: 'failed'; message: string };

/** The host's own words for "you are not embedded" (cartridge-sdk index.ts). */
const NO_HOST = 'No Mnemosyne host';

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

export function MoleculeMemory({ entry }: { entry: Entry | null }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // Guards a reply that lands after the human has already moved to another
  // structure: the promise cannot be cancelled, so the ANSWER is dropped.
  const asked = useRef<string | null>(null);

  useEffect(() => {
    setPhase({ kind: 'idle' });
    asked.current = null;
  }, [entry?.id]);

  // The panel is unmounted with a request in flight whenever the detail column
  // closes. Nothing to abort over postMessage, so mark the token dead.
  useEffect(() => () => { asked.current = null; }, []);

  if (!entry) return null;

  const ask = async () => {
    const tokenId = entry.id;
    asked.current = tokenId;
    setPhase({ kind: 'asking' });
    try {
      const result = await sdk.query(questionFor(entry));
      if (asked.current !== tokenId) return;
      if (result?.success === false) {
        setPhase({ kind: 'failed', message: result.error || 'Memory did not answer.' });
        return;
      }
      const text = (result?.text ?? result?.response ?? result?.content ?? result?.answer ?? '').trim();
      // An empty reply and a "nothing found" reply are the same fact for the
      // reader, and neither is an error. Naming it is the whole point: silence
      // here means "no notes yet", never "this does not work".
      if (!text || /NOTHING IN MEMORY/i.test(text)) {
        setPhase({ kind: 'empty' });
        return;
      }
      setPhase({ kind: 'answered', text });
    } catch (err) {
      if (asked.current !== tokenId) return;
      const message = err instanceof Error ? err.message : String(err);
      // Never swallowed: a cartridge that fails quietly is indistinguishable
      // from one that is thinking.
      console.warn('[molecule] memory query failed:', message);
      setPhase(message.includes(NO_HOST) ? { kind: 'no-host' } : { kind: 'failed', message });
    }
  };

  return (
    <section className="memory">
      <h3>{t('memory.title')}</h3>

      {phase.kind === 'idle' && (
        <>
          <button type="button" className="btn" onClick={ask}>{t('memory.ask')}</button>
          <p className="note">{t('memory.note')}</p>
        </>
      )}

      {phase.kind === 'asking' && (
        <p className="note busy" role="status">{t('memory.reading')}</p>
      )}

      {phase.kind === 'answered' && (
        <>
          <p className="memory-answer">{phase.text}</p>
          <button type="button" className="btn ghost" onClick={ask}>{t('memory.askAgain')}</button>
        </>
      )}

      {phase.kind === 'empty' && (
        <>
          <p className="note">{t('memory.nothing', { name: displayName(entry) })}</p>
          <button type="button" className="btn ghost" onClick={ask}>{t('memory.askAgain')}</button>
        </>
      )}

      {phase.kind === 'no-host' && <p className="note">{t('memory.outside')}</p>}

      {phase.kind === 'failed' && (
        <>
          <p className="note error" role="alert">{t('memory.failed', { why: phase.message })}</p>
          <button type="button" className="btn ghost" onClick={ask}>{t('memory.tryAgain')}</button>
        </>
      )}
    </section>
  );
}

export default MoleculeMemory;
