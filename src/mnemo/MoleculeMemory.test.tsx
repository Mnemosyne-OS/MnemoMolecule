/**
 * Taken from the doc 115 verification pass (05/10) — the memory panel MOUNTED. Atlas has
 * AtlasMemory.test.tsx; the Molecule port only tests the two pure helpers,
 * so the three silences and the answer-binding rule had no test at the
 * component level. Doc 115 §8.2 says two of the three silences were never
 * seen on screen either.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import type { PdbEntry } from '../mol/corpus';
import { MoleculeMemory } from './MoleculeMemory';

const pdb = (over: Partial<PdbEntry> = {}): PdbEntry => ({
  kind: 'pdb', id: '1HHO', family: 'oxygen', why: '', label: 'Haemoglobin, oxy',
  name: 'TITLE', entities: [], uniprot: ['P69905'], method: 'X-RAY DIFFRACTION', resolution: 2.1,
  released: '1983-10-27', organisms: ['Homo sapiens'], atoms: 2396, chains: 2,
  file: 'pdb/1HHO.bcif.gz', bytes: 1, ...over,
});

afterEach(() => { vi.restoreAllMocks(); });

describe('the three silences are three sentences', () => {
  it('silence 1 — no host: names the missing shell (jsdom has no parent frame)', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<MoleculeMemory entry={pdb()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask what my notes say/ }));
    expect(await screen.findByText(/open outside Mnemosyne/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(warned).toHaveBeenCalled();
  });

  it('silence 2 — memory refused: an alert with the host reason, and a retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(MnemoCartridgeSDK.prototype, 'query').mockRejectedValue(new Error('Query failed: provider down'));
    render(<MoleculeMemory entry={pdb()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask what my notes say/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('provider down');
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });

  it('silence 2b — a success:false envelope is a refusal too', async () => {
    vi.spyOn(MnemoCartridgeSDK.prototype, 'query').mockResolvedValue({ success: false, error: 'LLM_ABORTED' });
    render(<MoleculeMemory entry={pdb()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask what my notes say/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('LLM_ABORTED');
  });

  it('silence 3 — nothing in memory: no alert, the structure named, ask again offered', async () => {
    vi.spyOn(MnemoCartridgeSDK.prototype, 'query').mockResolvedValue({ success: true, text: 'NOTHING IN MEMORY' });
    render(<MoleculeMemory entry={pdb()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask what my notes say/ }));
    expect(await screen.findByText(/holds nothing about Haemoglobin, oxy yet/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /Ask again/ })).toBeTruthy();
  });

  it('an EMPTY text is the third silence as well, never an "answer"', async () => {
    vi.spyOn(MnemoCartridgeSDK.prototype, 'query').mockResolvedValue({ success: true, text: '   ' });
    render(<MoleculeMemory entry={pdb()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask what my notes say/ }));
    expect(await screen.findByText(/holds nothing about/)).toBeTruthy();
  });

  it('a real answer is shown as the answer, reading the host shape {success, text}', async () => {
    vi.spyOn(MnemoCartridgeSDK.prototype, 'query').mockResolvedValue({ success: true, text: 'Your notes say: allosteric.' });
    render(<MoleculeMemory entry={pdb()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask what my notes say/ }));
    expect(await screen.findByText(/allosteric/)).toBeTruthy();
  });
});

describe('the answer is bound to the structure it was asked about', () => {
  it('drops a reply that lands after the human moved to another structure', async () => {
    let release!: (v: unknown) => void;
    vi.spyOn(MnemoCartridgeSDK.prototype, 'query').mockImplementation(
      () => new Promise((r) => { release = r; }),
    );
    const { rerender } = render(<MoleculeMemory entry={pdb()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask what my notes say/ }));
    expect(await screen.findByText(/Reading your memory/)).toBeTruthy();
    // The human clicks lysozyme while haemoglobin's question is in flight.
    rerender(<MoleculeMemory entry={pdb({ id: '1LYZ', label: 'Lysozyme', uniprot: ['P00698'] })} />);
    release({ success: true, text: 'Haemoglobin is a tetramer.' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Ask what my notes say/ })).toBeTruthy());
    expect(screen.queryByText(/tetramer/)).toBeNull();
  });

  it('sends the question with the name AND every identifier', async () => {
    const q = vi.spyOn(MnemoCartridgeSDK.prototype, 'query').mockResolvedValue({ success: true, text: 'x' });
    render(<MoleculeMemory entry={pdb()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask what my notes say/ }));
    await screen.findByText('x');
    const sent = q.mock.calls[0]![0] as string;
    expect(sent).toContain('Haemoglobin, oxy');
    expect(sent).toContain('PDB 1HHO');
    expect(sent).toContain('UniProt P69905');
  });
});
