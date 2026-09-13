/**
 * page.tsx — the shell: a library on the left, a structure in the middle, what
 * it is and what you already know about it on the right.
 *
 * Three states, never two (rule 11): reading the catalogue, failing to read it,
 * and having read it. The failure names what went wrong instead of leaving the
 * frame blank, because a cartridge is an iframe and blank is the least
 * informative thing this shell can produce.
 *
 * ✂️ The count is stated and so is what it is a count OF. 222 structures out
 * of ~283,000 available is a chosen slice, and a library that looks complete
 * and is not makes the person who notices conclude the SEARCH is broken.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { displayName, familiesOf, loadCorpus, type Corpus, type Entry } from './corpus';
import { byName, search } from './library';
import { IdentityCard } from './IdentityCard';
import { Viewer } from './viewer';
import { defaultStyleFor, kindCanCartoon, STYLES, type Style } from './styles';
import { MoleculeMemory } from '../mnemo/MoleculeMemory';
import { useI18n } from '../i18n/useI18n';
import type { Key } from '../i18n/strings';

// The quiz is a whole second screen and most opens never reach it. Splitting it
// keeps the first paint to the viewer and the list.
const ReviewPanel = lazy(() => import('../mnemo/ReviewPanel').then((m) => ({ default: m.ReviewPanel })));

type Load =
  | { kind: 'loading' }
  | { kind: 'failed'; why: string }
  | { kind: 'ready'; corpus: Corpus };

export function Page() {
  const { t } = useI18n();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selected, setSelected] = useState<Entry | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Entry['kind'] | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>('cartoon');
  const [spinning, setSpinning] = useState(false);
  const [recentre, setRecentre] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  // 🚨 A run must not be able to read its own answer off the screen. The
  // identity card NAMES the structure and the library HIGHLIGHTS it, so while
  // a run is on the shell keeps the stage and puts both away.
  const [studying, setStudying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCorpus()
      .then((corpus) => { if (!cancelled) setLoad({ kind: 'ready', corpus }); })
      .catch((err: unknown) => {
        const why = err instanceof Error ? err.message : String(err);
        // Never swallowed: the frame would otherwise be white with no reason.
        console.warn('[molecule] corpus not loaded:', why);
        if (!cancelled) setLoad({ kind: 'failed', why });
      });
    return () => { cancelled = true; };
  }, []);

  const all = load.kind === 'ready' ? load.corpus.structures : [];
  const families = useMemo(() => familiesOf(all), [all]);
  const shown = useMemo(
    () => search(all, { query, kind, family }).sort(byName),
    [all, query, kind, family],
  );

  // Picking a structure resets the representation to what suits it: cartoon
  // draws nothing at all for a small molecule, so keeping the previous choice
  // would hand someone an empty box for a reason they cannot see.
  const pick = (e: Entry) => {
    setSelected(e);
    setStyle(defaultStyleFor(e.kind));
  };

  if (load.kind === 'loading') return <main className="boot"><p role="status">{t('app.loading')}</p></main>;
  if (load.kind === 'failed') {
    return <main className="boot"><p role="alert" className="error">{t('app.failed', { why: load.why })}</p></main>;
  }

  const { corpus } = load;

  return (
    <main className={`shell${studying ? ' studying' : ''}${reviewing ? ' reviewing' : ''}`}>
      <aside className="library">
        <div className="library-head">
          <input
            className="search"
            value={query}
            placeholder={t('lib.search')}
            aria-label={t('lib.search')}
            onChange={(ev) => setQuery(ev.target.value)}
          />
          <div className="chips">
            <button type="button" className={`chip ${kind === null ? 'on' : ''}`} onClick={() => setKind(null)}>
              {t('lib.all')}
            </button>
            <button type="button" className={`chip ${kind === 'pdb' ? 'on' : ''}`} onClick={() => setKind('pdb')}>
              {t('lib.pdb')} · {corpus.counts.pdb}
            </button>
            <button type="button" className={`chip ${kind === 'chebi' ? 'on' : ''}`} onClick={() => setKind('chebi')}>
              {t('lib.chebi')} · {corpus.counts.chebi}
            </button>
          </div>
          <div className="chips families">
            <button type="button" className={`chip ${family === null ? 'on' : ''}`} onClick={() => setFamily(null)}>
              {t('lib.all')}
            </button>
            {families.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`chip ${family === f.id ? 'on' : ''}`}
                onClick={() => setFamily(family === f.id ? null : f.id)}
              >
                {t(`family.${f.id}` as Key)} · {f.total}
              </button>
            ))}
          </div>
        </div>

        <ul className="list">
          {shown.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`entry ${selected?.id === e.id ? 'on' : ''}`}
                onClick={() => pick(e)}
              >
                <span className="entry-name">{displayName(e)}</span>
                <span className="entry-id">{e.id}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="note pad">{t('lib.noMatch', { q: query })}</li>}
        </ul>

        <footer className="library-foot">
          <p className="note">{t('lib.count', { n: corpus.structures.length })}</p>
          {/* ✂️ The slice announces itself. */}
          <p className="note">{t('lib.outOf', { pdb: corpus.outOf.pdb, chebi: corpus.outOf.chebi })}</p>
          <details>
            <summary>{t('src.title')}</summary>
            <ul className="sources">
              {corpus.sources.map((s) => (
                <li key={s.name}>
                  {s.name} — {s.licence}<br />
                  <span className="note">{s.url}</span>
                </li>
              ))}
            </ul>
            <p className="note">{t('src.built', { date: corpus.builtAt })}</p>
          </details>
        </footer>
      </aside>

      <section className="stage">
        <div className="toolbar">
          {STYLES.map((s) => {
            // 🚨 A ribbon is drawn along a chain of residues, and a small
            // molecule has none — 3Dmol throws rather than drawing nothing.
            // The button is disabled and SAYS why, because a control that goes
            // grey for a reason nobody can see is its own defect.
            const meaningless = s === 'cartoon' && !!selected && !kindCanCartoon(selected.kind);
            return (
              <button
                key={s}
                type="button"
                className={`chip ${style === s ? 'on' : ''}`}
                disabled={!selected || meaningless}
                title={meaningless ? t('view.noCartoon') : undefined}
                onClick={() => setStyle(s)}
              >
                {t(`view.${s}` as Key)}
              </button>
            );
          })}
          <button
            type="button"
            className={`chip ${spinning ? 'on' : ''}`}
            aria-pressed={spinning}
            disabled={!selected}
            onClick={() => setSpinning((v) => !v)}
          >
            {t('view.spin')}
          </button>
          <button type="button" className="chip" disabled={!selected} onClick={() => setRecentre((n) => n + 1)}>
            {t('view.reset')}
          </button>
          <span className="spacer" />
          {!reviewing && (
            <button type="button" className="btn" onClick={() => setReviewing(true)}>{t('review.open')}</button>
          )}
        </div>
        <Viewer entry={selected} style={style} spinning={spinning} recentre={recentre} />
        {!selected && <p className="note pad">{t('lib.empty')}</p>}
      </section>

      <aside className="detail">
        {selected ? (
          <>
            <IdentityCard entry={selected} />
            <MoleculeMemory entry={selected} />
          </>
        ) : (
          <p className="note pad">{t('lib.empty')}</p>
        )}
      </aside>

      {reviewing && (
        <Suspense fallback={null}>
          <ReviewPanel
            corpus={corpus}
            onShow={pick}
            onStudyingChange={setStudying}
            onClose={() => { setStudying(false); setReviewing(false); }}
          />
        </Suspense>
      )}
    </main>
  );
}
