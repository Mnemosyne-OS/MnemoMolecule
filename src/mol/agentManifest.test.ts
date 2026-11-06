/**
 * Molecule's agent actions (doc 149): the manifest's declaration passes the HOST's own check,
 * every declared action has its handler (a declared action without one would be offered to
 * agents and fail), and the limit it declares is the one the handler enforces.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentActionsFromManifest } from '../../../infinity-edition/src/main/plugins/cartridgeAgentActions';
import { FIND_LIMIT } from './moleculeAgent';

const root = join(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'mnemo-plugin.json'), 'utf8')) as unknown;
const source = readFileSync(join(root, 'src', 'mol', 'moleculeAgent.ts'), 'utf8');
const block = source.slice(source.indexOf('// agent-actions:begin'), source.indexOf('// agent-actions:end'));
const handlers = [...block.matchAll(/^ {4}(\w+): (?:async )?\(/gm)].map((m) => m[1]);

function declared() {
  const r = agentActionsFromManifest(manifest);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("Molecule's agent actions", () => {
  it("pass the host's check of the manifest", () => {
    const r = agentActionsFromManifest(manifest);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  });

  it('every declared action has its handler, and no handler is undeclared', () => {
    expect(handlers.length).toBeGreaterThan(5);
    expect([...handlers].sort()).toEqual(declared().map((a) => a.id).sort());
  });

  it('nothing spends credits, and only status and find are reads', () => {
    expect(declared().filter((a) => a.effect === 'spend')).toEqual([]);
    expect(declared().filter((a) => a.effect === 'read').map((a) => a.id).sort()).toEqual(['find', 'status']);
  });

  it("find's declared limit is the one the handler enforces", () => {
    const find = declared().find((a) => a.id === 'find')!;
    expect(find.params.limit).toMatchObject({ minimum: FIND_LIMIT.min, maximum: FIND_LIMIT.max });
  });
});
