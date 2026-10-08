import { describe, expect, it } from 'vitest';
import { readStore, setStoreInvoker, writeKey, type Invoke } from './store';

/**
 * A host whose state.set REPLACES the blob, as the real one does (doc 73),
 * and whose state.get answers the blob inside an envelope, as the real one does.
 */
function fakeHost(initial: Record<string, unknown> | null, opts: { failGet?: boolean } = {}) {
  let blob = initial;
  const sets: Record<string, unknown>[] = [];
  const invoke: Invoke = async <T,>(action: string, payload?: Record<string, unknown>) => {
    await Promise.resolve();
    if (action === 'state.get') {
      if (opts.failGet) throw new Error('host unreachable');
      return { state: blob, updatedAt: blob === null ? null : '2026-10-02T23:11:18.627Z' } as T;
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

  it('reads the blob inside the envelope, not the envelope', async () => {
    fakeHost({ review: { cards: 3 } });
    expect(await readStore()).toEqual({ review: { cards: 3 } });
  });
});

/** One level of what the wrapped writes left on disk: the previous answer, plus the key written. */
const level = (review: unknown, inner: unknown, at: string | null) => ({ state: inner, updatedAt: at, review });

describe('the blob the wrapped writes left on disk (2026-10-03)', () => {
  // Measured on mnemo-cosmos (this store is a copy of its): cartridge-state/@mnemosyne-plugins%2fmnemo-cosmos.json had this shape ten levels deep,
  // ending on the first write over an empty store: `{ state: null, updatedAt: null, review }`.
  const nested = () => level({ v: 1, best: 3 }, level({ v: 1, best: 2 }, level({ v: 1, best: 1 }, null, null), '2026-10-02T23:10:38.197Z'), '2026-10-02T23:11:16.438Z');

  it('reads the newest review, the one at the first level', async () => {
    fakeHost(nested());
    expect(await readStore()).toEqual({ review: { v: 1, best: 3 } });
  });

  it('the next write lands flat, and stays flat', async () => {
    const host = fakeHost(nested());
    await writeKey('gestures', { turn: 2 });
    expect(host.get()).toEqual({ review: { v: 1, best: 3 }, gestures: { turn: 2 } });
    await writeKey('review', { v: 1, best: 4 });
    expect(host.get()).toEqual({ review: { v: 1, best: 4 }, gestures: { turn: 2 } });
  });

  it('the deepest level, written over an empty store, reads as its review alone', async () => {
    fakeHost(level({ v: 1, best: 1 }, null, null));
    expect(await readStore()).toEqual({ review: { v: 1, best: 1 } });
  });
});
