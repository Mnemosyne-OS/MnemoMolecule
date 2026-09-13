/**
 * ReviewPanel — pick a level, pick a length, get asked, see how it went, and
 * file the run in your memory.
 *
 * Four screens, one panel: LEVELS -> LENGTH -> RUN -> RESULTS.
 *
 * This is the surface that makes the cartridge a memory tool rather than a
 * viewer. It shows a structure without naming it, offers four candidates from
 * the same family, and files the answer against a PDB or ChEBI id — stable
 * across languages, spellings and databases, so a card written today still
 * means the same thing next year.
 *
 * Two stores, on purpose, because they answer different questions:
 *
 *  - the SCHEDULE lives in the host-side state mirror (doc 73). Machinery:
 *    boxes and day numbers, rewritten on every answer, nobody should read it.
 *  - the RUN goes into this cartridge's own vault as one chronicle a human
 *    would want back. That is the half the chat can answer from, and it is
 *    written on a GESTURE: an ingest is permanent and shared with every future
 *    agent, so never automatically and never one row per answer.
 *
 * The panel's job is to never overstate. Progress never read shows `—`, not
 * `0`. With no host the quiz still runs and the panel SAYS answers are not
 * kept. A level too small for four honest options is offered as unavailable
 * WITH its count, instead of going grey for a reason nobody can see. Every
 * figure on the results screen — streak, accuracy, time — is a quantity that
 * was measured; there is no invented currency beside them in the same typeface.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import type { Corpus, Entry } from '../mol/corpus';
import {
  emptyState, grade, nextQuestion, parseState, progress, sessionNote, stateSize, STUDY_SPINE,
  type Askable, type Question, type ReviewState,
} from './review';
import { ALL_LEVEL, askablePool, canStudy, CHEBI_LEVEL, levelProgress, levelsOf, PDB_LEVEL, type Level } from './levels';
import {
  duration, endRun, isComplete, LENGTHS, lengthLabel, rankOf, record, runStats, startRun,
  type Rank, type Run, type RunLength,
} from './session';
import { useI18n } from '../i18n/useI18n';
import type { Key } from '../i18n/strings';

const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/mnemo-molecule');

/** Where the schedule lives inside the cartridge's host-side mirror. */
const KEY = 'review';

/** session.ts names a rank; the strings table words it. */
const RANK_KEY: Record<Rank, Key> = {
  Perfect: 'rank.perfect', Excellent: 'rank.excellent', Solid: 'rank.solid',
  'Getting there': 'rank.getting', 'Worth another pass': 'rank.again',
};

type Store =
  | { kind: 'loading' }
  | { kind: 'ready'; state: ReviewState }
  | { kind: 'unsaved'; state: ReviewState; why: string };

type Saving =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; vault: string; unlocked: boolean }
  | { kind: 'failed'; why: string };

interface Props {
  corpus: Corpus;
  /** Puts the structure being asked about on the 3D stage. */
  onShow: (entry: Entry) => void;
  /**
   * True while a run is on, so the shell can get out of the way.
   *
   * 🚨 Found on screen, not in a test: with the library and the identity card
   * still up, the question answers itself. The card NAMES the structure and the
   * list HIGHLIGHTS it. The panel cannot fix that from inside itself — it has
   * to tell the shell, exactly as Atlas does.
   */
  onStudyingChange: (studying: boolean) => void;
  onClose: () => void;
}

export function ReviewPanel({ corpus, onShow, onStudyingChange, onClose }: Props) {
  const { t } = useI18n();
  const [store, setStore] = useState<Store>({ kind: 'loading' });
  const [level, setLevel] = useState<Level | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answered, setAnswered] = useState<{ picked: string; correct: boolean } | null>(null);
  const [saving, setSaving] = useState<Saving>({ kind: 'idle' });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const held = store.kind === 'loading' ? emptyState() : store.state;
  const entries = corpus.structures;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const levels = levelsOf(corpus);
  const finished = !!run && isComplete(run);

  // The shell hides its own panels while a run is on, and gets them back the
  // moment it ends — INCLUDING on unmount, or closing the cartridge mid-run
  // would leave the window stripped with no way to bring the library back.
  useEffect(() => {
    onStudyingChange(!!run && !finished);
    return () => onStudyingChange(false);
  }, [run, finished, onStudyingChange]);

  const levelName = (lv: Level) =>
    lv.id === ALL_LEVEL ? t('lib.all')
      : lv.id === PDB_LEVEL ? t('lib.pdb')
        : lv.id === CHEBI_LEVEL ? t('lib.chebi')
          : t(`family.${lv.id}` as Key);
  const refusal = (lv: Level) => {
    const v = canStudy(lv);
    return v.ok ? '' : t(v.why === 'empty' ? 'review.empty' : 'review.tooSmall', { n: v.n });
  };

  // ── the schedule ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    sdk.invoke<Record<string, unknown>>('state.get')
      .then((data) => {
        if (cancelled || !alive.current) return;
        setStore({ kind: 'ready', state: parseState(data?.[KEY]) });
      })
      .catch((err: unknown) => {
        if (cancelled || !alive.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        // Never swallowed: a cartridge that fails quietly is indistinguishable
        // from one that is working.
        console.warn('[molecule] review state unavailable:', msg);
        setStore({
          kind: 'unsaved',
          state: emptyState(),
          why: msg.includes('No Mnemosyne host') ? t('review.noHost') : t('review.noLoad'),
        });
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const write = (next: ReviewState) => {
    if (store.kind === 'unsaved') { setStore({ ...store, state: next }); return; }
    setStore({ kind: 'ready', state: next });
    sdk.invoke('state.set', { state: { [KEY]: next } }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[molecule] review state not saved:', msg);
      if (alive.current) setStore({ kind: 'unsaved', state: next, why: t('review.notSaved') });
    });
  };

  // ── asking ───────────────────────────────────────────────────────────────
  const ask = useCallback((lv: Level, state: ReviewState, asked: ReadonlySet<string>) => {
    const q = nextQuestion(askablePool(entries, lv), state, Date.now(), (Math.random() * 2 ** 31) | 0, 4, asked);
    setAnswered(null);
    setQuestion(q);
    const subject = q && byId.get(q.subject.id);
    if (subject) onShow(subject);
  }, [entries, onShow]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (len: RunLength) => {
    if (!level) return;
    setSaving({ kind: 'idle' });
    setRun(startRun(len, Date.now()));
    ask(level, held, new Set());
  };

  const backToLevels = () => {
    setLevel(null); setRun(null); setQuestion(null); setAnswered(null);
  };

  const answer = (picked: Askable) => {
    if (!question || answered || !run) return;
    const correct = picked.id === question.subject.id;
    setAnswered({ picked: picked.id, correct });

    const card = grade(held.cards[question.subject.id], correct, Date.now());
    const nextRun = record(run, { ...question.subject, correct, n: card.n });
    setRun(nextRun);
    // A new answer invalidates the receipt from the last save: the note on disk
    // no longer describes this run.
    setSaving({ kind: 'idle' });

    const best = Math.max(held.best ?? 0, nextRun.bestStreak);
    write({ v: 1, cards: { ...held.cards, [question.subject.id]: card }, best });
  };

  // ── filing the run as a memory ───────────────────────────────────────────
  const saveRun = async () => {
    if (!run) return;
    const note = sessionNote(run.answers, {
      scopeName: level ? levelName(level) : t('lib.all'),
      now: Date.now(),
    });
    if (!note) return; // nothing happened, so there is nothing to record
    setSaving({ kind: 'busy' });
    try {
      // Permissions are read when the app boots. A cartridge that gained
      // `vault:write` after that is refused everything, and the refusal comes
      // from a layer BELOW the consent dialog: the host checks the manifest it
      // holds in memory, which is the old one, and never gets as far as asking
      // the human. `permissions.refresh` makes it re-read the manifests from
      // disk and then ask — so the dialog appears on this gesture, which is
      // where it belongs. (Measured on Atlas: the first save after adding the
      // permission failed on a cartridge whose manifest declared it.)
      const refreshed = await sdk.invoke<{ granted?: Record<string, boolean> }>(
        'permissions.refresh', { permissions: ['vault:write'] },
      );
      if (refreshed?.granted?.['vault:write'] === false) {
        if (alive.current) setSaving({ kind: 'failed', why: t('review.why.declined') });
        return;
      }
      const { vault, unlocked } = await sdk.ensureSandbox();
      await sdk.socialIngest(vault, note, STUDY_SPINE);
      if (alive.current) setSaving({ kind: 'done', vault, unlocked });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[molecule] run not written to memory:', msg);
      if (!alive.current) return;
      // Three refusals, three sentences. Merged into one they send people to
      // fix the wrong thing, and two of the three are not their fault at all.
      setSaving({
        kind: 'failed',
        why: msg.includes('No Mnemosyne host')
          ? t('review.why.noHost')
          : /permission/i.test(msg)
            ? t('review.why.noPermission')
            : msg,
      });
    }
  };

  // ── what the numbers are allowed to say ──────────────────────────────────
  // `—` while nothing has been READ, not merely while loading. When the store
  // could not be reached, "Studied 0" is a claim about someone's history that
  // nobody measured.
  const known = store.kind === 'ready' || Object.keys(held.cards).length > 0;
  const p = store.kind !== 'loading' && known ? progress(held, Date.now()) : null;
  const size = store.kind !== 'loading' ? stateSize(held) : null;
  const stats = run ? runStats(run, Date.now()) : null;
  const askedIds = new Set(run?.answers.map((a) => a.id) ?? []);

  const screen: 'levels' | 'length' | 'run' | 'results' =
    !level ? 'levels' : !run ? 'length' : finished ? 'results' : 'run';

  return (
    <section className="review" aria-label={t('review.title')}>
      <header className="review-head">
        {level ? (
          <button type="button" className="btn ghost" onClick={backToLevels}>{t('review.back')}</button>
        ) : (
          <h2>{t('review.title')}</h2>
        )}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>{t('review.close')}</button>
      </header>

      {store.kind === 'unsaved' && <p className="note caution">{store.why}</p>}
      {size?.tight && (
        <p className="note caution">{t('review.tight', { pct: Math.round(size.ratio * 100) })}</p>
      )}

      {screen === 'levels' && (
        <>
          <p className="progress">
            {/* 🎭 Unread progress is a dash, never a zero. */}
            {p
              ? `${t('review.studied')} ${p.seen} · ${t('review.due')} ${p.due} · ${t('review.mastered')} ${p.mastered}`
              : `${t('review.studied')} — · ${t('review.due')} — · ${t('review.mastered')} —`}
          </p>
          <p className="note">{t('review.pickLevel')}</p>
          <ul className="levels">
            {levels.map((lv) => {
              const ok = canStudy(lv).ok;
              const lp = levelProgress(lv, entries, held, Date.now());
              return (
                <li key={lv.id}>
                  <button
                    type="button"
                    className="level-tile"
                    disabled={!ok}
                    onClick={() => setLevel(lv)}
                  >
                    <span className="level-name">{levelName(lv)}</span>
                    <span className="level-total">{lv.total}</span>
                    {/* A store nobody read reports nothing rather than 0 of n. */}
                    <span className="level-sub">
                      {p ? `${lp.studied}/${lv.total} · ${lp.mastered} ${t('review.mastered')}` : '—'}
                    </span>
                    {!ok && <span className="level-sub caution">{refusal(lv)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {screen === 'length' && (
        <>
          <p className="note">{t('review.pickLength')}</p>
          <div className="chips">
            {LENGTHS.map((n) => (
              <button key={String(n)} type="button" className="chip" onClick={() => begin(n)}>
                {lengthLabel(n) ?? t('review.endless')}
              </button>
            ))}
          </div>
        </>
      )}

      {screen === 'run' && question && run && (
        <>
          <p className="run-count">
            {run.answers.length}{run.length === null ? '' : ` / ${run.length}`}
          </p>
          <p className="which">{t('review.which')}</p>
          <ul className="options">
            {question.options.map((o) => {
              const state = !answered ? ''
                : o.id === question.subject.id ? 'right'
                  : o.id === answered.picked ? 'wrong' : 'dim';
              return (
                <li key={o.id}>
                  <button type="button" className={`option ${state}`} onClick={() => answer(o)}>
                    {o.name}
                  </button>
                </li>
              );
            })}
          </ul>
          {answered && (
            <div className="chips">
              <button type="button" className="btn" onClick={() => ask(level!, held, askedIds)}>
                {t('review.next')}
              </button>
              {run.length === null && (
                <button type="button" className="btn ghost" onClick={() => setRun(endRun(run))}>
                  {t('review.stop')}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {screen === 'run' && !question && (
        <p className="note caution">{t('review.empty')}</p>
      )}

      {screen === 'results' && stats && (
        <>
          <h3>{t('review.results')}</h3>
          <p className="rank">
            {/* 🎭 No answers means no rank. Inventing one would pass judgement
                on someone who has not done anything yet. */}
            {rankOf(stats.accuracy) ? t(RANK_KEY[rankOf(stats.accuracy)!]) : '—'}
          </p>
          <ul className="stats">
            <li>{t('review.asked')} <b>{stats.asked}</b></li>
            <li>{t('review.right')} <b>{stats.right}</b></li>
            <li>{t('review.accuracy')} <b>{stats.accuracy === null ? '—' : `${Math.round(stats.accuracy * 100)}%`}</b></li>
            <li>{t('review.streak')} <b>{stats.bestStreak}</b></li>
            <li>{t('review.time')} <b>{duration(stats.elapsedMs)}</b></li>
          </ul>
          {stats.missed.length > 0 && (
            <>
              <p className="note">{t('review.missed')}</p>
              <ul className="missed">
                {stats.missed.map((m) => <li key={m.id}>{m.name} <span className="note">{m.id}</span></li>)}
              </ul>
            </>
          )}
          <div className="chips">
            <button type="button" className="btn ghost" onClick={backToLevels}>{t('review.again')}</button>
            {saving.kind !== 'done' && (
              <button type="button" className="btn" disabled={saving.kind === 'busy'} onClick={saveRun}>
                {saving.kind === 'busy' ? t('review.saving') : t('review.save')}
              </button>
            )}
          </div>
          {saving.kind === 'done' && (
            <p className="note" role="status">
              {t(saving.unlocked ? 'review.savedUnlocked' : 'review.saved', { vault: saving.vault })}
            </p>
          )}
          {saving.kind === 'failed' && (
            <p className="note error" role="alert">{t('review.saveFailed', { why: saving.why })}</p>
          )}
        </>
      )}
    </section>
  );
}

export default ReviewPanel;
