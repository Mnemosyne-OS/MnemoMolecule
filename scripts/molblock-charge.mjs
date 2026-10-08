/**
 * The net formal charge a V2000 molblock writes (doc 115 verification pass, 05/10).
 *
 * ChEBI leaves its `CHARGE` field out when the charge is 0, and read as « not
 * measured » the card showed « Charge — » on 110 of 117 molecules whose
 * neutrality is written in the very file the cartridge ships. The molblock is
 * the measurement: `M  CHG` lines when present (they then replace the atom
 * block's column, per the V2000 format), else the atom block's charge codes.
 *
 * Returns null only when the block cannot be read (no counts line), never 0
 * for « could not tell ».
 */
const ATOM_CODE = { 0: 0, 1: 3, 2: 2, 3: 1, 4: 0, 5: -1, 6: -2, 7: -3 };

export function molblockCharge(lines) {
  const countsAt = lines.findIndex((l) => /V2000\s*$/.test(l));
  if (countsAt < 0) return null;
  const atoms = Number(lines[countsAt].slice(0, 3));
  if (!Number.isInteger(atoms) || atoms < 0) return null;
  const chg = lines.filter((l) => l.startsWith('M  CHG'));
  if (chg.length > 0) {
    let sum = 0;
    for (const l of chg) {
      const parts = l.slice(6).trim().split(/\s+/).map(Number);
      const n = parts[0];
      for (let i = 0; i < n; i++) sum += parts[2 + 2 * i] ?? 0;
    }
    return sum;
  }
  let sum = 0;
  for (let i = 1; i <= atoms; i++) {
    const line = lines[countsAt + i];
    if (line === undefined) return null;
    sum += ATOM_CODE[Number(line.slice(36, 39))] ?? 0;
  }
  return sum;
}
