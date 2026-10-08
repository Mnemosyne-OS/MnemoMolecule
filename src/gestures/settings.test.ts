import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SPEED_KEYS } from './config';

const store = vi.hoisted(() => ({
  blob: {} as Record<string, unknown>,
  writes: [] as unknown[],
  read: null as null | (() => Promise<Record<string, unknown>>),
  failWrites: 0,
}));
vi.mock('./store', () => ({
  readStore: () => (store.read ? store.read() : Promise.resolve(store.blob)),
  writeKey: (k: string, v: unknown) => {
    store.writes.push(v);
    if (store.failWrites > 0) { store.failWrites--; return Promise.reject(new Error('disk full')); }
    store.blob = { ...store.blob, [k]: v };
    return Promise.resolve();
  },
}));

beforeEach(() => { vi.resetModules(); store.blob = {}; store.writes = []; store.read = null; store.failWrites = 0; });
const load = () => import('./settings');
const [first, second] = SPEED_KEYS;
const ones = () => Object.fromEntries(SPEED_KEYS.map((k) => [k, 1]));

describe('reading the stored speeds', () => {
  it('a missing or unreadable field takes its default, never 0', async () => {
    const { parseSpeeds } = await load();
    expect(parseSpeeds({ [first]: 2, [second]: 0 })).toEqual({ ...ones(), [first]: 2 });
    expect(parseSpeeds({ [first]: 'fast' })).toEqual(ones());
    expect(parseSpeeds(null)).toEqual(ones());
  });
  it('a speed out of range is brought back into it', async () => {
    const { parseSpeeds, SPEED_MAX, SPEED_MIN } = await load();
    expect(parseSpeeds({ [first]: 99 })[first]).toBe(SPEED_MAX);
    expect(parseSpeeds({ [first]: 0.01 })[first]).toBe(SPEED_MIN);
  });
});

describe('changing a speed', () => {
  it('applies at once and saves on release, once', async () => {
    store.blob = { gestures: { [first]: 1.5 } };
    const m = await load();
    await m.loadSpeeds();
    expect(m.getSpeeds()[first]).toBe(1.5);
    m.setSpeed(first, 2, { save: false });
    m.setSpeed(first, 2.25, { save: false });
    expect(m.getSpeeds()[first]).toBe(2.25);
    expect(store.writes).toHaveLength(0);
    m.setSpeed(first, 2.25);
    expect(store.writes).toEqual([{ ...ones(), [first]: 2.25 }]);
  });

  it('a speed chosen before the stored ones arrive wins, and is saved then', async () => {
    let open!: (v: Record<string, unknown>) => void;
    store.read = () => new Promise((r) => { open = r; });
    const m = await load();
    const loading = m.loadSpeeds();
    m.setSpeed(second, 2);
    open({ gestures: { [second]: 0.5 } });
    await loading;
    expect(m.getSpeeds()[second]).toBe(2);
    expect(store.writes).toEqual([{ ...ones(), [second]: 2 }]);
  });

  it('a pointer-up then a blur on the same value writes once', async () => {
    const m = await load();
    await m.loadSpeeds();
    m.setSpeed(first, 2);
    m.setSpeed(first, 2);
    expect(store.writes).toHaveLength(1);
  });

  it('a release that changes nothing writes nothing', async () => {
    store.blob = { gestures: { [first]: 1.5 } };
    const m = await load();
    await m.loadSpeeds();
    m.setSpeed(first, 1.5);
    expect(store.writes).toHaveLength(0);
  });

  it('after a failed write, the next change tries again and clears the warning', async () => {
    const m = await load();
    await m.loadSpeeds();
    store.failWrites = 1;
    m.setSpeed(first, 2);
    await Promise.resolve(); await Promise.resolve();
    expect(m.getSaveState()).toEqual({ kind: 'unsaved', why: 'disk full' });
    m.setSpeed(first, 2.5);
    await Promise.resolve(); await Promise.resolve();
    expect(store.writes).toHaveLength(2);
    expect(m.getSaveState()).toEqual({ kind: 'ready' });
  });

  it('an unreadable store keeps the speed for the session and says it is not saved', async () => {
    store.read = () => Promise.reject(new Error('no host'));
    const m = await load();
    await m.loadSpeeds();
    m.setSpeed(first, 2);
    expect(m.getSpeeds()[first]).toBe(2);
    expect(store.writes).toHaveLength(0);
    expect(m.getSaveState()).toEqual({ kind: 'unsaved', why: 'no host' });
  });
});

describe('back to 1×', () => {
  it('puts every speed back to 1 and saves it', async () => {
    const m = await load();
    await m.loadSpeeds();
    for (const k of SPEED_KEYS) m.setSpeed(k, 2.5, { save: false });
    m.resetSpeeds();
    expect(m.getSpeeds()).toEqual(ones());
    expect(store.writes.at(-1)).toEqual(ones());
  });
});
