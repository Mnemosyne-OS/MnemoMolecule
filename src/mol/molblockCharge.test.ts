/**
 * The charge a molblock writes (doc 115 verification pass, 05/10): ChEBI omits
 * CHARGE when it is 0, and the card showed « — » on 110 neutral molecules.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — build script, no types
import { molblockCharge } from '../../scripts/molblock-charge.mjs';

const block = (atoms: string[], extra: string[] = []) => ['', '  test', '', ` ${String(atoms.length).padStart(2)}  0  0     0  0            999 V2000`, ...atoms, ...extra, 'M  END'];
const atom = (el: string, code = 0) => `    0.0000    0.0000    0.0000 ${el.padEnd(3)} 0  ${code}  0  0  0  0           0  0  0`;

describe('molblockCharge', () => {
  it('no charge written anywhere is a MEASURED 0', () => {
    expect(molblockCharge(block([atom('C'), atom('O')]))).toBe(0);
  });
  it('M  CHG lines are summed, and replace the atom block', () => {
    expect(molblockCharge(block([atom('N', 3), atom('O', 5)], ['M  CHG  2   1   1   2  -1']))).toBe(0);
    expect(molblockCharge(block([atom('N'), atom('C')], ['M  CHG  1   1   1']))).toBe(1);
  });
  it('without M  CHG, the atom block codes count (3 = +1, 5 = -1)', () => {
    expect(molblockCharge(block([atom('N', 3), atom('C')]))).toBe(1);
    expect(molblockCharge(block([atom('O', 5)]))).toBe(-1);
  });
  it('an unreadable block is unknown, never 0', () => {
    expect(molblockCharge(['no', 'counts', 'line'])).toBeNull();
  });
  it('the shipped index carries a charge for every small molecule, equal to its file', () => {
    const root = join(__dirname, '..', '..', 'public', 'corpus');
    const idx = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as { structures: { kind: string; file: string; charge: number | null }[] };
    for (const e of idx.structures.filter((x) => x.kind === 'chebi')) {
      expect(e.charge).toBe(molblockCharge(readFileSync(join(root, e.file), 'utf8').split(/\r?\n/)));
    }
  });
});
