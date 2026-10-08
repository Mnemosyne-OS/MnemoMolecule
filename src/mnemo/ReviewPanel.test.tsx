/**
 * The review panel MOUNTED against a fake host (doc 115 verification pass,
 * 05/10). The host answers `state.get` inside an envelope, as the real one does.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import { setStoreInvoker, type Invoke } from '../gestures/store';
import type { Corpus, PdbEntry } from '../mol/corpus';
import { ReviewPanel } from './ReviewPanel';

const pdb = (id: string, label: string): PdbEntry => ({
  kind: 'pdb', id, family: 'oxygen', why: 'w', label, name: `T ${id}`, entities: [], uniprot: [],
  method: null, resolution: null, released: null, organisms: [], atoms: 1, chains: 1, file: '', bytes: 1,
});
const corpus: Corpus = {
  builtAt: '2026-09-09', counts: { pdb: 4, chebi: 0 }, outOf: { pdb: 0, chebi: 0 }, sources: [],
  structures: [pdb('1HHO', 'Haemoglobin, oxy'), pdb('1MBN', 'Myoglobin'), pdb('4HHB', 'Haemoglobin, deoxy'), pdb('2HHB', 'Haemoglobin, refined')],
};

/** A host whose state.get can hang, and answers `{ state, updatedAt }`. */
function fakeHost(initial: Record<string, unknown>, opts: { hangGet?: boolean; getError?: string } = {}) {
  let blob = initial;
  const sets: Record<string, unknown>[] = [];
  const invoke: Invoke = async <T,>(action: string, payload?: Record<string, unknown>) => {
    await Promise.resolve();
    if (action === 'state.get') {
      if (opts.hangGet) return new Promise<T>(() => {});
      if (opts.getError) throw new Error(opts.getError);
      return { state: blob, updatedAt: '2026-10-05T00:00:00.000Z' } as T;
    }
    if (action === 'state.set') { blob = payload!.state as Record<string, unknown>; sets.push(blob); return undefined as T; }
    throw new Error(action);
  };
  setStoreInvoker(invoke);
  return { get: () => blob, sets };
}

afterEach(() => { vi.restoreAllMocks(); });

const EXISTING = { v: 1, cards: { '1MBN': { b: 3, d: 20000, n: 4 }, '4HHB': { b: 2, d: 20001, n: 2 } }, best: 5 };
const mount = () => render(<ReviewPanel corpus={corpus} onShow={() => {}} onStudyingChange={() => {}} onClose={() => {}} />);

describe('ReviewPanel — the schedule on disk', () => {
  it('🚨 before the schedule is read, no level can be started (an answer then erased the history)', async () => {
    const host = fakeHost({ review: EXISTING }, { hangGet: true });
    mount();
    const all = screen.getByRole('button', { name: /^All/ }) as HTMLButtonElement;
    expect(all.disabled).toBe(true);
    fireEvent.click(all);
    expect(screen.queryByRole('button', { name: '5' })).toBeNull();
    expect(host.sets).toHaveLength(0);
  });

  it('the schedule is read back from the envelope after a reload (it never came back)', async () => {
    fakeHost({ review: EXISTING, gestures: { turn: 2 } });
    mount();
    expect(await screen.findByText(/Studied 2 · Due/)).toBeTruthy();
  });

  it('read first, an answer keeps the history and the other keys', async () => {
    const host = fakeHost({ review: EXISTING, gestures: { turn: 2 } });
    mount();
    await screen.findByText(/Studied 2 · Due/);
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.click(await screen.findByRole('button', { name: '5' }));
    await screen.findByText(/Which one is this/);
    const options = screen.getAllByRole('button').filter((b) => b.className.startsWith('option'));
    fireEvent.click(options[0]!);
    await waitFor(() => expect(host.sets.length).toBe(1));
    const written = host.get() as { review: { cards: Record<string, unknown>; best?: number }; gestures: unknown };
    expect(Object.keys(written.review.cards)).toEqual(expect.arrayContaining(['1MBN', '4HHB']));
    expect(written.review.best).toBe(5);
    expect(written.gestures).toEqual({ turn: 2 });
  });
});

describe('ReviewPanel — an unread store is a dash, and the two read failures are two sentences', () => {
  it('no host', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeHost({}, { getError: 'No Mnemosyne host: "state.get" was invoked outside the shell' });
    mount();
    expect(await screen.findByText(/Open outside Mnemosyne, so answers are not kept/)).toBeTruthy();
    expect(screen.getByText(/Studied — · Due — · Mastered —/)).toBeTruthy();
  });

  it('any other read failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeHost({}, { getError: 'State read failed' });
    mount();
    expect(await screen.findByText(/Your progress could not be read, so answers are not kept/)).toBeTruthy();
  });
});

describe('ReviewPanel — writing the run to memory: three refusals, three sentences', () => {
  async function finishARun() {
    await screen.findByText(/Studied 0/);
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Until I stop/ }));
    await screen.findByText(/Which one is this/);
    const options = screen.getAllByRole('button').filter((b) => b.className.startsWith('option'));
    fireEvent.click(options[0]!);
    fireEvent.click(await screen.findByRole('button', { name: /^Stop$/ }));
    await screen.findByText(/How it went/);
    fireEvent.click(screen.getByRole('button', { name: /Write this session to my memory/ }));
  }

  it('you declined the write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(MnemoCartridgeSDK.prototype, 'invoke').mockImplementation(async (action: string) => {
      if (action === 'permissions.refresh') return { granted: { 'vault:write': false } };
      throw new Error(action);
    });
    fakeHost({});
    mount();
    await finishARun();
    expect((await screen.findByRole('alert')).textContent).toContain('you declined the write');
  });

  it('no host', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(MnemoCartridgeSDK.prototype, 'invoke').mockRejectedValue(new Error('No Mnemosyne host: "permissions.refresh" was invoked outside the shell'));
    fakeHost({});
    mount();
    await finishARun();
    expect((await screen.findByRole('alert')).textContent).toContain('open outside Mnemosyne');
  });

  it('the host refused the permission', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(MnemoCartridgeSDK.prototype, 'invoke').mockResolvedValue({ granted: { 'vault:write': true } });
    vi.spyOn(MnemoCartridgeSDK.prototype, 'ensureSandbox').mockRejectedValue(new Error('Permission denied: vault:write'));
    fakeHost({});
    mount();
    await finishARun();
    expect((await screen.findByRole('alert')).textContent).toContain('not been allowed to write');
  });

  it('a successful write names the vault and hides the button', async () => {
    vi.spyOn(MnemoCartridgeSDK.prototype, 'invoke').mockResolvedValue({ granted: { 'vault:write': true } });
    vi.spyOn(MnemoCartridgeSDK.prototype, 'ensureSandbox').mockResolvedValue({ vault: 'APP_MNEMO_MOLECULE', created: false, unlocked: false });
    const ingest = vi.spyOn(MnemoCartridgeSDK.prototype, 'socialIngest').mockResolvedValue({});
    fakeHost({});
    mount();
    await finishARun();
    expect((await screen.findByRole('status')).textContent).toContain('APP_MNEMO_MOLECULE');
    expect(screen.queryByRole('button', { name: /Write this session to my memory/ })).toBeNull();
    expect(ingest.mock.calls[0]![2]).toBe('MOLECULE_STUDY');
  });
});
