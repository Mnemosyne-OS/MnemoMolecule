/**
 * store — the cartridge's durable state, one key per feature.
 *
 * The host's `state.set` REPLACES the cartridge's whole blob (doc 73,
 * `writeCartridgeState`). With one writer that was fine; with two (the
 * review schedule and the gesture speeds) each save would erase the other.
 * So every write goes through here: read, merge one key, write, one at a
 * time.
 *
 * A write whose read failed is REFUSED, never sent with only its own key:
 * an unreadable store is not an empty one, and writing over it would erase
 * a review history nobody could see.
 */
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import { CARTRIDGE_ID } from './config';

export type Invoke = <T = unknown>(action: string, payload?: Record<string, unknown>) => Promise<T>;

const sdk = new MnemoCartridgeSDK(CARTRIDGE_ID);
let invoke: Invoke = (action, payload) => sdk.invoke(action, payload);

/** Tests swap the host for a fake. */
export function setStoreInvoker(next: Invoke): void { invoke = next; }

let queue: Promise<unknown> = Promise.resolve();

/** The whole stored blob. Rejects with the host's reason when it cannot be read. */
export async function readStore(): Promise<Record<string, unknown>> {
  const data = await invoke<Record<string, unknown> | null | undefined>('state.get');
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

/**
 * Store `value` under `key`, keeping every other key as it is on disk.
 * Writes run one after the other, so two features saving in the same
 * instant both land.
 */
export function writeKey(key: string, value: unknown): Promise<void> {
  const run = queue.then(async () => {
    const current = await readStore();
    await invoke('state.set', { state: { ...current, [key]: value } });
  });
  // The chain continues after a failure; the caller still sees it.
  queue = run.catch(() => undefined);
  return run;
}
