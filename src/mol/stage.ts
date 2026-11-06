/**
 * stage — the live 3D view, reachable by the agent door (doc 149).
 *
 * The viewer's zoom and turn exist only as the hand's moves (doc 106 §32): no button holds
 * them, so there is no setter for the page to pass down. The viewer registers its 3Dmol
 * instance here when it is created and withdraws it when it goes, and the agent's `zoom` and
 * `turn` run the SAME 3Dmol calls the hand runs (`zoom(f)`, `rotate(deg, axis)`, `render()`).
 *
 * A module-level slot rather than a hook: the viewer is mounted on the person's board while
 * the app runs, and a hook added to it would break its hook order under hot reload.
 *
 * @module mol/stage
 */

/** The three 3Dmol calls the agent needs, nothing more. */
export interface StageView {
  zoom: (factor: number) => void;
  rotate: (degrees: number, axis: 'x' | 'y' | 'z') => void;
  render: () => void;
}

let current: StageView | null = null;

/** Called by the viewer when its 3Dmol instance exists (`view`) and when it is torn down (`null`). */
export function registerStage(view: StageView | null, owner?: StageView): void {
  // A late teardown of an older viewer must not withdraw the one that replaced it.
  if (view === null && owner && current !== owner) return;
  current = view;
}

/** Zoom by `factor` (> 1 = closer), as the hand's pinch does. False when no view is there. */
export function zoomStage(factor: number): boolean {
  if (!current || !Number.isFinite(factor) || factor <= 0) return false;
  current.zoom(factor);
  current.render();
  return true;
}

/** Turn by `degrees` around `axis`, as the hand's drag does. False when no view is there. */
export function turnStage(degrees: number, axis: 'x' | 'y'): boolean {
  if (!current || !Number.isFinite(degrees)) return false;
  current.rotate(degrees, axis);
  current.render();
  return true;
}
