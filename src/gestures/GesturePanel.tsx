/**
 * GesturePanel — which hand gestures this cartridge takes, whether the host
 * granted them, and how fast each one moves the view (doc 106 §32).
 *
 * It receives its words already translated: the gesture lines are the
 * host's own descriptions (shell locale `gestures.hud.app.*`), so this panel
 * and the shell's cheat-sheet name the same pose the same way.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  SPEED_MAX, SPEED_MIN, SPEED_STEP, getGrant, getSaveState, getSpeeds, loadSpeeds, resetSpeeds,
  setSpeed, subscribeGrant, subscribeSpeeds,
} from './settings';
import type { SpeedKey } from './config';
import './gestures.css';

export interface GesturePanelWords {
  title: string;
  lead: string;
  asking: string;
  granted: string;
  refused: (why: string) => string;
  speeds: string;
  reset: string;
  loading: string;
  unsaved: (why: string) => string;
  inApp: string;
  os: string;
  close: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  words: GesturePanelWords;
  speedRows: { key: SpeedKey; label: string }[];
  appRows: { icon: string; text: string }[];
  osRows: { icon: string; text: string }[];
}

const times = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}×`;

/** Loads the stored speeds as soon as the cartridge mounts it, open or not. */
export function GesturePanel({ open, onClose, words, speedRows, appRows, osRows }: Props) {
  const speeds = useSyncExternalStore(subscribeSpeeds, getSpeeds);
  const save = useSyncExternalStore(subscribeSpeeds, getSaveState);
  const grant = useSyncExternalStore(subscribeGrant, getGrant);
  const closeBtn = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { void loadSpeeds(); }, []);
  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const status = grant.kind === 'granted' ? words.granted : grant.kind === 'refused' ? words.refused(grant.why) : words.asking;

  return (
    <div className="gx-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="gx-panel" role="dialog" aria-modal="true" aria-label={words.title}>
        <header className="gx-head">
          <h2>{words.title}</h2>
          <button ref={closeBtn} type="button" className="gx-close" onClick={onClose} aria-label={words.close}>✕</button>
        </header>
        <p className="gx-lead">{words.lead}</p>
        <p className={`gx-status ${grant.kind}`} role="status">{status}</p>

        <h3>{words.speeds}</h3>
        {save.kind === 'loading' && <p className="gx-note">{words.loading}</p>}
        {speedRows.map((r) => (
          <label key={r.key} className="gx-speed">
            <span className="gx-speed-head"><span>{r.label}</span><span className="gx-speed-value">{times(speeds[r.key])}</span></span>
            {/* One drag is one write: the value follows the thumb, the save
                waits for the release (pointer, key or focus leaving). */}
            <input
              type="range" min={SPEED_MIN} max={SPEED_MAX} step={SPEED_STEP} value={speeds[r.key]}
              onChange={(e) => setSpeed(r.key, Number(e.target.value), { save: false })}
              onPointerUp={(e) => setSpeed(r.key, Number(e.currentTarget.value))}
              onKeyUp={(e) => setSpeed(r.key, Number(e.currentTarget.value))}
              onBlur={(e) => setSpeed(r.key, Number(e.currentTarget.value))}
            />
          </label>
        ))}
        <button type="button" className="gx-reset" onClick={resetSpeeds}>{words.reset}</button>
        {save.kind === 'unsaved' && <p className="gx-note warn" role="alert">{words.unsaved(save.why)}</p>}

        <h3>{words.inApp}</h3>
        <ul className="gx-list">{appRows.map((r) => <li key={r.text}><span aria-hidden>{r.icon}</span>{r.text}</li>)}</ul>
        <h3>{words.os}</h3>
        <ul className="gx-list">{osRows.map((r) => <li key={r.text}><span aria-hidden>{r.icon}</span>{r.text}</li>)}</ul>
      </section>
    </div>
  );
}
