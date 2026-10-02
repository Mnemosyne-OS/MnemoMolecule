/**
 * The review schedule must save through the merging writer.
 *
 * The host's `state.set` REPLACES the cartridge's whole blob (doc 73), and the
 * gesture speeds live in it too: a review panel that called `state.set` with
 * only its own key would erase the speeds at the next answered card. Nothing
 * mounts the review panel against a store, so this reads its SOURCE, and says
 * so: it proves the call site, not the runtime.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'mnemo', 'ReviewPanel.tsx'), 'utf-8');

describe('the review panel writes through the merging writer', () => {
  it('never calls state.set on its own', () => {
    expect(source).not.toMatch(/['"]state\.set['"]/);
  });
  it('saves its key with writeKey', () => {
    expect(source).toMatch(/writeKey\(KEY,/);
  });
});
