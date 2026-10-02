import { describe, expect, it } from 'vitest';
import { readStore, setStoreInvoker, writeKey, type Invoke } from './store';

/** A host whose state.set REPLACES the blob, as the real one does (doc 73). */
function fakeHost(initial: Record<string, unknown> | null, opts: { failGet?: boolean } = {}) {
  let blob = initial;
  const sets: Record<string, unknown>[] = [];
  const invoke: Invoke = async <T,>(action: string, payload?: Record<string, unknown>) => {
    await Promise.resolve();
    if (action === 'state.get') {
      if (opts.failGet) throw new Error('host unreachable');
      return blob as T;
    }
    if (action === 'state.set') {
      blob = payload!.state as Record<string, unknown>;
      sets.push(blob);
      return undefined as T;
    }
    throw new Error(action);
  };
  setStoreInvoker(invoke);
  return { get: () => blob, sets };
}

describe('one blob, two features', () => {
  it('saving the gesture speeds keeps the review history', async () => {
    const host = fakeHost({ review: { cards: 3 } });
    await writeKey('gestures', { turn: 2 });
    expect(host.get()).toEqual({ review: { cards: 3 }, gestures: { turn: 2 } });
  });

  it('two saves in the same instant both land', async () => {
    const host = fakeHost({});
    await Promise.all([writeKey('review', { cards: 1 }), writeKey('gestures', { turn: 2 })]);
    expect(host.get()).toEqual({ review: { cards: 1 }, gestures: { turn: 2 } });
  });

  it('an unreadable store is never written over', async () => {
    const host = fakeHost({ review: { cards: 9 } }, { failGet: true });
    await expect(writeKey('gestures', { turn: 2 })).rejects.toThrow('host unreachable');
    expect(host.sets).toHaveLength(0);
  });

  it('a failed save does not stop the next one', async () => {
    fakeHost({}, { failGet: true });
    await expect(writeKey('a', 1)).rejects.toThrow();
    const host = fakeHost({});
    await writeKey('b', 2);
    expect(host.get()).toEqual({ b: 2 });
  });

  it('an empty host reads as an empty blob', async () => {
    fakeHost(null);
    expect(await readStore()).toEqual({});
  });
});
