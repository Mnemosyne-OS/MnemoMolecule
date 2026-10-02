/**
 * listen — the one seam with the host's gesture channel (doc 106 §32).
 *
 * The host never shows the camera nor the hand to a cartridge: it sends
 * intentions (« turn by 12 px », « come closer by 3 % »), and only while
 * this window is full screen.
 */
import { MnemoCartridgeSDK, type MnemoGestureHandlers } from '@mnemosyne_os/cartridge-sdk';
import { CARTRIDGE_ID } from './config';
import { setGrant } from './settings';

const sdk = new MnemoCartridgeSDK(CARTRIDGE_ID);

/**
 * Subscribe to the host's gestures. Returns the unsubscribe.
 *
 * A refusal is logged AND shown in the gesture panel with the host's own
 * reason (permission denied, no host, manifest refused): the person tries a
 * gesture, nothing moves, and only that reason says which of the three it was.
 */
export function listenToGestures(handlers: MnemoGestureHandlers): () => void {
  const sub = sdk.onGestures(handlers);
  sub.ready
    .then(({ takes, actions }) => {
      console.info('[gestures] granted:', takes.join(', '), actions.length ? `+ ${actions.join(', ')}` : '');
      setGrant({ kind: 'granted', takes, actions });
    })
    .catch((err: unknown) => {
      const why = err instanceof Error ? err.message : String(err);
      console.warn('[gestures] none:', why);
      setGrant({ kind: 'refused', why });
    });
  return sub.off;
}
