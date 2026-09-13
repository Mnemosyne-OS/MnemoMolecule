/**
 * viewer.tsx — the 3D canvas, and the one check that keeps it honest.
 *
 * 3Dmol.js draws; this decides when, and what to say when it cannot.
 *
 * 🚨 A PARSE THAT PRODUCES NOTHING IS SILENT. Hand a text parser a Uint8Array,
 * or a bcif payload that arrived still gzipped, and 3Dmol returns a model with
 * zero atoms and throws nothing at all. On screen that is an empty box, which
 * reads as "this structure has no interesting shape" rather than "this file was
 * not read". So the count is checked, and zero is always said out loud.
 *
 * 🪤 BUT THE FIRST VERSION OF THAT CHECK CRIED WOLF ON 15 STRUCTURES OF 105.
 * Comparing the drawn count to RCSB's `deposited_atom_count` and warning on any
 * difference fired on 1CBN, 1A6M, 1EA5 and twelve more — every one of them
 * perfectly loaded. Measured in the browser across the whole corpus: 90 of 105
 * match exactly, and in the other 15 the shortfall is ALTERNATE CONFORMATIONS.
 * A residue modelled in two positions is deposited twice and drawn once, and in
 * seven of the eight worst cases `deposited - drawn` equals the number of atoms
 * carrying an altLoc flag EXACTLY (1CBN is the eighth and has residues with
 * three conformers, so more are dropped than kept — same mechanism).
 *
 * So the rule is the one the measurement supports: nothing drawn is always an
 * error; a shortfall in a model that HAS alternate conformations is explained
 * and stays quiet; a shortfall in a model with NONE is unexplained and gets
 * both numbers. A warning that fires on one good structure in seven is a
 * warning nobody reads by the second week.
 *
 * 🪤 A viewer is a WebGL context and the browser only grants a handful. It is
 * created once for the life of the component and torn down in the effect's
 * cleanup, never once per structure — and every load carries a token so a slow
 * file that lands after the human has clicked something else is DROPPED rather
 * than drawn under the new title.
 */
import { useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import { loadStructure, parserFor, type Entry } from './corpus';
import { isSlowToDraw, styleSpec, type Style } from './styles';
import { useI18n } from '../i18n/useI18n';

/**
 * How long the load waits for a paint before giving up and drawing anyway.
 * Long enough for a visible window to paint, short enough that a hidden one is
 * not held up in any way a person could notice.
 */
const PAINT_WAIT_MS = 120;

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'drawn'; atoms: number; alternates: number; hasResidues: boolean }
  | { kind: 'failed'; why: string };

interface Props {
  entry: Entry | null;
  style: Style;
  spinning: boolean;
  /** Bumped by the recentre button; the value itself is never read. */
  recentre: number;
}

export function Viewer({ entry, style, spinning, recentre }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const viewer = useRef<ReturnType<typeof $3Dmol.createViewer> | null>(null);
  const token = useRef(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const { t } = useI18n();

  // One WebGL context for the life of the panel.
  useEffect(() => {
    if (!host.current) return;
    let v: ReturnType<typeof $3Dmol.createViewer> | null = null;
    try {
      v = $3Dmol.createViewer(host.current, { backgroundAlpha: 0 });
      viewer.current = v;
    } catch (err) {
      // Never swallowed: a blank rectangle with no message is the least
      // informative failure this surface can produce.
      const why = err instanceof Error ? err.message : String(err);
      console.warn('[molecule] the 3D view could not start:', why);
      setPhase({ kind: 'failed', why });
    }
    return () => {
      // Rule 13/14: the context goes back when the panel does, or a few opens
      // and closes exhaust what the browser will grant.
      token.current += 1;
      try { v?.clear(); } catch { /* already gone with the DOM node */ }
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewer.current || !entry) return;
    const mine = ++token.current;
    setPhase({ kind: 'loading' });
    (async () => {
      try {
        const bytes = await loadStructure(entry);
        // The human has moved on. Drawing now would put this structure under
        // another one's title, which is the worst thing this surface can do.
        if (token.current !== mine) return;
        // 🚨 WAIT FOR A PAINT BEFORE THE SYNCHRONOUS WORK.
        //
        // `addModel` and `render` are synchronous 3Dmol calls, and on the
        // ribosome they block the main thread for about nineteen seconds.
        // `setPhase({kind:'loading'})` above only SCHEDULES a re-render, and
        // the `await` on the fetch resolves in a microtask — which runs BEFORE
        // the browser paints. So the loading note was never drawn once: the tab
        // simply froze on the previous structure with nothing on screen, which
        // is the most alarming thing this surface could do and the exact
        // failure the note exists to prevent. Measured by clicking 4V6X and
        // finding `.viewer-say` absent 120 ms later.
        //
        // Two frames, not one: the first callback runs BEFORE the paint it was
        // scheduled for, so yielding once still beats the pixels to the screen.
        //
        // 🚨 RACED AGAINST A TIMER, because requestAnimationFrame DOES NOT FIRE
        // WHILE THE DOCUMENT IS HIDDEN. Measured in a hidden tab: two nested
        // rAF callbacks had still not run after 3 seconds. A cartridge window
        // behind another one, minimised, or on another desktop is hidden, so
        // the first version of this yield left the viewer saying "Loading…"
        // forever — a far worse failure than the freeze it was written to
        // explain. The yield is a COURTESY, never a precondition.
        await Promise.race([
          new Promise<void>((r) => { requestAnimationFrame(() => requestAnimationFrame(() => r())); }),
          new Promise<void>((r) => { setTimeout(r, PAINT_WAIT_MS); }),
        ]);
        if (token.current !== mine) return;

        // 🪤 The viewer is re-read AFTER the await, never captured before it.
        // React StrictMode runs an effect mount-unmount-mount in development,
        // and HMR does the same in the middle of a load: a viewer captured at
        // the top is then a DEAD context, and drawing into it silently paints
        // nothing while the token check happily reports success. Seen in the
        // console as "1HHO was not drawn: Cannot read properties of undefined".
        const v = viewer.current;
        if (!v) return;
        const { format, binary } = parserFor(entry);
        v.clear();
        const model = v.addModel(binary ? bytes : new TextDecoder().decode(bytes), format);
        // 3Dmol hands back whatever it has; on a torn-down context that is not
        // an array, and `.length` on it throws a message about `undefined` that
        // says nothing about the real cause.
        // Only the two fields this file reads. 3Dmol's atom carries far more;
        // naming just these keeps the dependency on its shape honest and small.
        const drawn: { altLoc?: string; resn?: string }[] = model?.selectedAtoms?.({}) ?? [];
        if (!Array.isArray(drawn)) throw new Error('the viewer returned no atom list');
        // Atoms that belong to an alternate-conformation group. Their presence
        // is what explains a count below the deposited one.
        const alternates = drawn.filter((a) => a.altLoc && a.altLoc !== ' ').length;
        // Whether a ribbon means anything here. Read from the parse, never
        // assumed from the file extension: 3Dmol's cartoon renderer reads
        // `atom.resn` with no guard and throws on a model that has none.
        const hasResidues = drawn.some((a) => typeof a.resn === 'string');
        applyStyle(v, style, { atoms: drawn.length, hasResidues });
        v.zoomTo();
        v.render();
        if (token.current !== mine) return;
        setPhase({ kind: 'drawn', atoms: drawn.length, alternates, hasResidues });
      } catch (err) {
        if (token.current !== mine) return;
        const why = err instanceof Error ? err.message : String(err);
        console.warn(`[molecule] ${entry.id} was not drawn:`, why);
        setPhase({ kind: 'failed', why });
      }
    })();
  }, [entry]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = viewer.current;
    if (!v || phase.kind !== 'drawn') return;
    applyStyle(v, style, { atoms: phase.atoms, hasResidues: phase.hasResidues });
    v.render();
  }, [style, phase.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.spin(spinning ? 'y' : false);
    // Rule 13: the spin is an animation loop, and it stops with the panel.
    return () => { try { v.spin(false); } catch { /* context already gone */ } };
  }, [spinning]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || phase.kind !== 'drawn') return;
    v.zoomTo();
    v.render();
  }, [recentre]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 3Dmol sizes its canvas once, when the viewer is created.
   *
   * 🪤 The shell puts its side columns away when a quiz run starts, which
   * widens this element without any React state of ours changing — and the
   * canvas stayed at its old size, leaving the structure off-screen. Seen by
   * starting a run and looking at an empty stage.
   *
   * Rule 10: the observer is disconnected on unmount.
   */
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const v = viewer.current;
      if (!v) return;
      try { v.resize(); v.render(); } catch { /* context gone with the element */ }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 🎭 Only a DRAWN structure can disagree with its deposit. While loading or
  // after a failure there is no count to compare, and "0 of 2396" would be a
  // measurement nobody took.
  const empty = phase.kind === 'drawn' && phase.atoms === 0;
  const unexplained =
    phase.kind === 'drawn'
    && phase.atoms > 0
    && entry?.kind === 'pdb'
    && phase.atoms !== entry.atoms
    && phase.alternates === 0;

  return (
    <div className="viewer">
      <div className="viewer-canvas" ref={host} />
      {phase.kind === 'loading' && entry && (
        <p className="viewer-say" role="status">
          {/* A wait that says nothing reads as a click that did not register.
              The count is a fact from the index; no duration is predicted,
              because this machine is not the reader's. */}
          {entry.kind === 'pdb' && isSlowToDraw(entry.atoms)
            ? t('view.loadingBig', { id: entry.id, atoms: entry.atoms.toLocaleString() })
            : t('view.loading', { id: entry.id })}
        </p>
      )}
      {phase.kind === 'failed' && (
        <p className="viewer-say viewer-error" role="alert">
          {t('view.failed', { id: entry?.id ?? '?', why: phase.why })}
        </p>
      )}
      {/* Nothing drawn is the failure this check exists for, and it is the one
          that otherwise looks like a structure with no shape. */}
      {empty && (
        <p className="viewer-say viewer-error" role="alert">
          {t('view.nothing', { id: entry?.id ?? '?' })}
        </p>
      )}
      {unexplained && phase.kind === 'drawn' && entry?.kind === 'pdb' && (
        <p className="viewer-say viewer-error" role="alert">
          {t('view.mismatch', { got: phase.atoms, want: entry.atoms })}
        </p>
      )}
    </div>
  );
}

/**
 * One representation at a time. The DECISION is in styles.ts; this only applies
 * it, so the part that can be wrong is the part that can be tested.
 *
 * `setStyle` REPLACES rather than adds, so switching never leaves the previous
 * one underneath. A surface is the exception: it is a separate 3Dmol concept
 * and has to be removed by hand, or every switch through "surface" leaves one
 * more shell around the model until the frame rate dies.
 */
function applyStyle(
  v: ReturnType<typeof $3Dmol.createViewer>,
  style: Style,
  facts: { atoms: number; hasResidues: boolean },
): void {
  v.removeAllSurfaces();
  const { spec, surface } = styleSpec(style, facts);
  v.setStyle({}, spec);
  if (surface) v.addSurface($3Dmol.SurfaceType.VDW, { opacity: 0.72, color: 'white' });
}
