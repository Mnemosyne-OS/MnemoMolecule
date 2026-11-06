/**
 * MoleculeAgentActions — serves Molecule's agent actions (doc 149) while this window is open.
 *
 * A CHILD that renders nothing, never a hook in Page: Page is mounted on the person's board while
 * the app runs, and a hook added to it breaks the order of its hooks under hot reload. The
 * handlers live in `moleculeAgent.ts`; this only keeps their view of the page fresh (a ref
 * written every render) and subscribes ONCE.
 */
import { useEffect, useRef } from 'react';
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import { CARTRIDGE_ID } from '../gestures/config';
import { moleculeAgentHandlers, type MoleculeAgentContext } from './moleculeAgent';

const sdk = new MnemoCartridgeSDK(CARTRIDGE_ID);
const inShell = (): boolean => typeof window !== 'undefined' && window.parent !== window;

export function MoleculeAgentActions(props: MoleculeAgentContext) {
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    // outside the shell nobody calls (a plain tab, the tests): no subscription, no timer
    if (!inShell()) return undefined;
    if (typeof sdk.onAgentActions !== 'function') {
      // An iframe served an older SDK build: it must not take the window down.
      console.warn('[Molecule] this SDK build has no onAgentActions; reload the cartridge to serve agent actions');
      return undefined;
    }
    const sub = sdk.onAgentActions(moleculeAgentHandlers(() => latest.current));
    sub.ready.catch((err: unknown) => console.warn('[Molecule] agent actions not served:', err instanceof Error ? err.message : err));
    return () => sub.off();
  }, []);

  return null;
}
