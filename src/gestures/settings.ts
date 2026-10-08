/**
 * settings — how fast the hand moves this cartridge, and whether the host
 * grants the gestures at all (doc 106 §32).
 *
 * Two small stores the canvas reads on every gesture (never through React
 * state, so a slider never restarts the 3D scene) and the gesture panel
 * renders. The speeds are saved in the cartridge's durable state under one
 * key; the grant is what the host answered this session, never saved.
 */
import { readStore, writeKey } from './store';
import { SPEED_KEYS, type SpeedKey } from './config';

export type Speeds = Record<SpeedKey, number>;

/** Slowest and fastest a gesture can be set: below 0.25× a hand barely moves the view. */
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 3;
/** The slider's step, so a chosen speed reads as a round number. */
export const SPEED_STEP = 0.25;
/** The key the speeds live under in the cartridge's durable state. */
export const SETTINGS_KEY = 'gestures';

const defaults = (): Speeds => Object.fromEntries(SPEED_KEYS.map((k) => [k, 1])) as Speeds;
const clampSpeed = (n: number) => Math.max(SPEED_MIN, Math.min(SPEED_MAX, n));

/**
 * Read a stored blob. A field that is missing or unreadable takes its
 * default; it is never set to 0, which would freeze that gesture.
 */
export function parseSpeeds(raw: unknown): Speeds {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out = defaults();
  for (const k of SPEED_KEYS) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = clampSpeed(v);
  }
  return out;
}

// ── speeds ─────────────────────────────────────────────────────────────────
let speeds: Speeds = defaults();
/** 'loading' until the stored speeds are read; 'unsaved' when they cannot be. */
export type SaveState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'unsaved'; why: string };
let save: SaveState = { kind: 'loading' };
const speedListeners = new Set<() => void>();
const emit = () => { for (const cb of [...speedListeners]) cb(); };

export const getSpeeds = (): Speeds => speeds;
export const getSaveState = (): SaveState => save;
export function subscribeSpeeds(cb: () => void): () => void {
  speedListeners.add(cb);
  return () => { speedListeners.delete(cb); };
}

let loaded: Promise<void> | null = null;
/** A speed chosen before the stored ones arrived: it wins, and is saved then. */
let changedWhileLoading = false;

/** Read the stored speeds once per session. */
export function loadSpeeds(): Promise<void> {
  loaded ??= readStore().then((data) => {
    save = { kind: 'ready' };
    if (changedWhileLoading) persist();
    else {
      speeds = parseSpeeds(data[SETTINGS_KEY]);
      // Only what the store actually holds counts as written: an absent key
      // read as defaults has never been saved.
      lastWritten = data[SETTINGS_KEY] !== undefined ? JSON.stringify(speeds) : null;
    }
    emit();
  }).catch((err: unknown) => {
    const why = err instanceof Error ? err.message : String(err);
    console.warn('[gestures] settings unavailable:', why);
    loadFailed = true;
    save = { kind: 'unsaved', why };
    emit();
  });
  return loaded;
}

/** The speeds last sent to the store: a release that changes nothing (a
 *  pointer-up then a blur on the same slider) writes nothing. */
let lastWritten: string | null = null;
/** The store could not be READ: writing would replace keys we never saw. */
let loadFailed = false;

function persist(): void {
  const snapshot = JSON.stringify(speeds);
  if (snapshot === lastWritten) return;
  lastWritten = snapshot;
  writeKey(SETTINGS_KEY, speeds).then(() => {
    // A write that works again clears the warning a failed one left.
    if (save.kind === 'unsaved') { save = { kind: 'ready' }; emit(); }
  }).catch((err: unknown) => {
    const why = err instanceof Error ? err.message : String(err);
    console.warn('[gestures] settings not saved:', why);
    lastWritten = null;   // the next change tries again
    save = { kind: 'unsaved', why };
    emit();
  });
}

function commit(): void {
  if (save.kind === 'loading') { changedWhileLoading = true; return; }
  // 🚨 After a failed WRITE the next change must try again: gating on
  // 'ready' left every later choice unsaved for the rest of the session.
  if (!loadFailed) persist();
}

/**
 * Change one speed. It applies at once; the save follows, and a failed save
 * is said in the panel rather than undone (the person just chose it).
 * A slider passes `save: false` while it is dragged and saves on release,
 * so one drag is one write and not one per pixel.
 */
export function setSpeed(k: SpeedKey, value: number, opts: { save?: boolean } = {}): void {
  if (!Number.isFinite(value)) return;
  speeds = { ...speeds, [k]: clampSpeed(value) };
  emit();
  if (opts.save !== false) commit();
}

/** Back to 1× everywhere. */
export function resetSpeeds(): void {
  speeds = defaults();
  emit();
  commit();
}

// ── what the host granted ──────────────────────────────────────────────────
export type GrantState =
  | { kind: 'asking' }
  | { kind: 'granted'; takes: string[]; actions: string[] }
  | { kind: 'refused'; why: string };
let grant: GrantState = { kind: 'asking' };
const grantListeners = new Set<() => void>();
export const getGrant = (): GrantState => grant;
export function setGrant(next: GrantState): void {
  grant = next;
  for (const cb of [...grantListeners]) cb();
}
export function subscribeGrant(cb: () => void): () => void {
  grantListeners.add(cb);
  return () => { grantListeners.delete(cb); };
}
