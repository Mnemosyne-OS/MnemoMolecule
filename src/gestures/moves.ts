/**
 * moves — a hand step turned into what 3Dmol understands (doc 106 §32).
 *
 * Same speed as the shell's neural map and the Atlas: one screen height of
 * drag turns the molecule half a turn, so a hand feels the same everywhere.
 */

/** Degrees of rotation for `px` of hand drag on a view `viewportH` tall. */
export function dragDegrees(px: number, viewportH: number, speed = 1): number | null {
  if (!Number.isFinite(px) || !Number.isFinite(viewportH) || viewportH <= 0 || !Number.isFinite(speed) || speed <= 0) return null;
  return (px * 180 * speed) / viewportH;
}

/** The zoom factor to hand 3Dmol (> 1 = closer) for a hand factor at a speed. */
export function zoomFactor(factor: number, speed = 1): number | null {
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(speed) || speed <= 0) return null;
  return Math.pow(factor, speed);
}
