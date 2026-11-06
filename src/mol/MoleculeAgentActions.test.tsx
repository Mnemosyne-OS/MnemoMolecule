/**
 * MoleculeAgentActions — an iframe served an older SDK (no onAgentActions) keeps its window:
 * it warns and serves nothing, it never throws the page down.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { MoleculeAgentContext } from './moleculeAgent';

vi.mock('@mnemosyne_os/cartridge-sdk', () => ({ MnemoCartridgeSDK: class { pluginId = 'x'; } }));

const realParent = window.parent;
afterEach(() => { Object.defineProperty(window, 'parent', { value: realParent, configurable: true }); vi.restoreAllMocks(); });

describe('MoleculeAgentActions', () => {
  it('an SDK without onAgentActions warns instead of breaking the window', async () => {
    Object.defineProperty(window, 'parent', { value: {}, configurable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { MoleculeAgentActions } = await import('./MoleculeAgentActions');
    expect(() => render(<MoleculeAgentActions {...({} as MoleculeAgentContext)} />)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no onAgentActions'));
  });
});
