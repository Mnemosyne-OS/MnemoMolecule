/**
 * build-corpus.mjs — turns the two editorial lists into what the cartridge ships.
 *
 * Run: pnpm --filter @mnemosyne-plugins/mnemo-molecule corpus
 * Writes: public/corpus/index.json, public/corpus/pdb/<ID>.bcif.gz,
 *         public/corpus/chebi/<id>.sdf
 *
 * Everything here exists because a corpus can fail in ways that look like
 * success, and three of those were MEASURED on 2026-09-09 before this was
 * written.
 *
 * 1. A PDB ENTRY CAN RETURN 200 AND CONTAIN NO ATOMS. `4V6X.cif` from
 *    files.rcsb.org is 1.37 MB of well-formed mmCIF with zero coordinate
 *    records: RCSB serves metadata only for structures too large for the
 *    legacy PDB-compatible format. A builder that trusts the status code and
 *    the byte count ships a structure that renders as an empty box. So the
 *    coordinates come from models.rcsb.org (BinaryCIF, complete for every
 *    entry) and the expected atom count travels in the index, where the viewer
 *    can check what it actually parsed against what was deposited.
 *
 * 2. A MISSING ENTRY IS REPORTED, NEVER DROPPED. If an id 404s or comes back
 *    without atoms, this script says so by name and exits non-zero. A corpus
 *    that silently shrinks is a library that looks complete and is not, and
 *    the person who notices concludes the SEARCH is broken.
 *
 * 3. A RESOLUTION NOBODY REPORTED IS `null`. NMR entries have none, and some
 *    cryo-EM entries have none. `0` would render as a perfect structure.
 *
 * BinaryCIF, gzipped, was chosen on a measurement rather than a reputation:
 * over nine representative structures, bcif.gz totalled 1.01 MB against
 * 1.72 MB for cif.gz — 41% smaller — and 3Dmol.js parses both to the identical
 * atom count (verified in a browser, 1HHO: 2,396 atoms from all four of cif,
 * cif.gz, bcif, bcif.gz).
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGunzip } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const OUT = join(app, 'public', 'corpus');
const CACHE = join(app, '.corpus-cache');

/** ChEBI ships one 59 MB archive; we download it once and keep it out of git. */
const CHEBI_SDF_URL = 'https://ftp.ebi.ac.uk/pub/databases/chebi/SDF/chebi_3_stars.sdf.gz';
const CHEBI_SDF = join(CACHE, 'chebi_3_stars.sdf.gz');

const failures = [];
const fail = (what, why) => { failures.push(`${what}: ${why}`); console.error(`  !! ${what} — ${why}`); };

/**
 * A GET with three attempts.
 *
 * The RCSB API answers ~250 times in one build and a handful of those come
 * back as a transport failure with no status at all. Measured on the first
 * full run: three entity queries out of 340 failed that way, and a builder
 * that gives up on the first one reports a missing UniProt accession that is
 * not missing.
 */
async function getJson(url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      // A 404 is an ANSWER, not a transport failure: retrying cannot change it,
      // and the caller needs the status to look the entry up in the obsolete
      // holdings.
      if (r.status === 404) throw Object.assign(new Error('HTTP 404'), { status: 404 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      if (err.status === 404) throw err;
      last = err;
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw last;
}

/**
 * Why an id 404s — and this is the correction the first run forced.
 *
 * A PDB id is never REASSIGNED, which is what makes it a good key. It can
 * still be OBSOLETED and superseded: `1FDX` (ferredoxin, 1976) was removed in
 * 2000 and replaced by `1DUR`; `1QLA` was removed in 2006 for `2BS2`. Both
 * were in the first editorial list and both 404'd.
 *
 * ⛔ The replacement is REPORTED, never substituted. A superseded entry is a
 * different experiment — different crystal, different resolution, different
 * year — and quietly swapping it would put a structure on screen that nobody
 * chose, under a justification written about another one.
 */
async function replacementFor(id) {
  try {
    const h = await getJson(`https://data.rcsb.org/rest/v1/holdings/removed/${id}`, 1);
    const by = h?.rcsb_repository_holdings_removed?.id_codes_replaced_by;
    return Array.isArray(by) && by.length ? by.join(', ') : null;
  } catch { return null; }
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

// ── macromolecules ─────────────────────────────────────────────────────────

/**
 * One PDB entry, fetched and described.
 *
 * The identity is TWO levels and they are never merged: `id` is one
 * experiment — a crystal, a resolution, a year, a team — and `uniprot` is the
 * protein that experiment was done on. Writing the protein's name above the
 * experiment's id, with nothing saying it is one structure OF that protein,
 * states something false about the world.
 */
async function fetchPdb(entry) {
  const id = entry.id.toUpperCase();
  const meta = await getJson(`https://data.rcsb.org/rest/v1/core/entry/${id}`);
  const info = meta.rcsb_entry_info ?? {};
  const atoms = info.deposited_atom_count;
  if (!atoms) throw new Error('the RCSB entry reports no deposited atoms');

  // UniProt accessions, one query per polymer entity. A structure of a complex
  // legitimately carries several; a nucleic-acid-only entry carries none, and
  // none is not a failure.
  const uniprot = [];
  const chainNames = [];
  const organisms = [];
  const nEntities = info.polymer_entity_count ?? 0;
  for (let i = 1; i <= nEntities; i++) {
    try {
      const pe = await getJson(`https://data.rcsb.org/rest/v1/core/polymer_entity/${id}/${i}`);
      for (const acc of pe.rcsb_polymer_entity_container_identifiers?.uniprot_ids ?? []) {
        if (!uniprot.includes(acc)) uniprot.push(acc);
      }
      const d = pe.rcsb_polymer_entity?.pdbx_description;
      if (d && !chainNames.includes(d)) chainNames.push(d);
      // Which organism this protein came from. Myoglobin is a sperm whale and
      // haemoglobin is human, and a student who reads "myoglobin" without that
      // is being taught a slightly wrong fact.
      const org = pe.rcsb_entity_source_organism?.[0]?.scientific_name;
      if (org && !organisms.includes(org)) organisms.push(org);
    } catch (err) {
      // Named, never swallowed: an entity we could not read means the identity
      // panel will be missing an accession, and the report has to say so.
      fail(`${id} entity ${i}`, err.message);
    }
  }

  // Same three attempts as the metadata: the coordinate host flakes too, and a
  // transport failure there costs a whole structure rather than one accession.
  let raw;
  {
    let last;
    for (let i = 0; i < 3 && !raw; i++) {
      try {
        const coords = await fetch(`https://models.rcsb.org/${id.toLowerCase()}.bcif`);
        if (!coords.ok) throw new Error(`coordinates HTTP ${coords.status}`);
        raw = Buffer.from(await coords.arrayBuffer());
      } catch (err) { last = err; await new Promise((res) => setTimeout(res, 400 * (i + 1))); }
    }
    if (!raw) throw last;
  }
  if (raw.length < 1024) throw new Error(`coordinates are ${raw.length} bytes — too small to be a structure`);

  await mkdir(join(OUT, 'pdb'), { recursive: true });
  const file = join(OUT, 'pdb', `${id}.bcif.gz`);
  await pipeline(Readable.from(raw), createGzip({ level: 9 }), createWriteStream(file));
  const gz = (await stat(file)).size;

  // 🎭 Resolution is an array when reported and absent otherwise. `null` here,
  // an em dash on screen. Never 0.
  const resArr = info.resolution_combined;
  const resolution = Array.isArray(resArr) && typeof resArr[0] === 'number' ? resArr[0] : null;

  return {
    kind: 'pdb',
    id,
    family: entry.family,
    why: entry.why,
    // OUR short teaching name, and THEIR title. Both, never one: the list and
    // the quiz need a label a human can scan, and the depositors' own title is
    // the thing that says which experiment this actually is.
    label: entry.label ?? id,
    name: meta.struct?.title ?? id,
    entities: chainNames,
    uniprot,
    method: meta.exptl?.map((e) => e.method).join(', ') || null,
    resolution,
    released: meta.rcsb_accession_info?.initial_release_date?.slice(0, 10) ?? null,
    organisms,
    atoms,
    chains: info.deposited_polymer_entity_instance_count ?? null,
    file: `pdb/${id}.bcif.gz`,
    bytes: gz,
  };
}

// ── small molecules ────────────────────────────────────────────────────────

async function ensureChebi() {
  await mkdir(CACHE, { recursive: true });
  if (await exists(CHEBI_SDF)) return;
  console.log('  downloading ChEBI 3-star SDF (~59 MB, once)…');
  const r = await fetch(CHEBI_SDF_URL);
  if (!r.ok) throw new Error(`ChEBI SDF HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(CHEBI_SDF));
}

/**
 * Streams the ChEBI archive once and keeps only the records we asked for.
 *
 * ⛔ The DrugBank cross-reference field is deliberately NOT carried into the
 * shipped corpus. DrugBank's dataset is CC BY-NC and unusable here; a bare
 * accession is a fact rather than their data, but there is no reason to carry
 * it, and not carrying it is the version nobody has to argue about.
 */
async function readChebi(wanted) {
  const found = new Map();
  const want = new Set(wanted);
  let mol = [];
  let field = null;
  const props = {};

  const rl = createInterface({ input: createReadStream(CHEBI_SDF).pipe(createGunzip()), crlfDelay: Infinity });
  let inMol = true;
  for await (const line of rl) {
    if (line === '$$$$') {
      const id = props['ChEBI ID'];
      if (id && want.has(id)) {
        found.set(id, {
          molblock: mol.join('\n'),
          name: props['ChEBI NAME'] ?? id,
          formula: props['FORMULA'] ?? null,
          mass: props['MASS'] ? Number(props['MASS']) : null,
          charge: props['CHARGE'] !== undefined ? Number(props['CHARGE']) : null,
          inchikey: props['INCHIKEY'] ?? null,
          smiles: props['SMILES'] ?? null,
          iupac: props['IUPAC_NAME'] ?? null,
          definition: props['DEFINITION'] ?? null,
        });
      }
      mol = []; field = null; inMol = true;
      for (const k of Object.keys(props)) delete props[k];
      continue;
    }
    if (line.startsWith('> <')) { inMol = false; field = line.slice(3, line.indexOf('>', 3)); continue; }
    if (inMol) { mol.push(line); continue; }
    if (field) {
      if (line.trim() === '') { field = null; continue; }
      props[field] = props[field] ? `${props[field]}\n${line}` : line;
    }
  }
  return found;
}

async function main() {
  console.log('== corpus builder ==');
  // A floor on the one destructive call in this script. `OUT` is derived from
  // import.meta.url so it cannot be empty today, but a recursive delete with no
  // guard on its argument is one refactor away from resolving to the process
  // cwd, and this one runs unattended.
  if (!OUT.endsWith(join('public', 'corpus'))) {
    throw new Error(`refusing to delete ${OUT}: that is not the corpus directory`);
  }
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const macro = JSON.parse(await readFile(join(app, 'corpus', 'macromolecules.json'), 'utf8'));
  const small = JSON.parse(await readFile(join(app, 'corpus', 'small-molecules.json'), 'utf8'));

  console.log(`\n-- ${macro.entries.length} PDB entries`);
  const structures = [];
  for (const e of macro.entries) {
    try {
      const rec = await fetchPdb(e);
      structures.push(rec);
      process.stdout.write(`  ${rec.id} ${String(rec.atoms).padStart(7)} atoms ${String(Math.round(rec.bytes / 1024)).padStart(6)} KB\n`);
    } catch (err) {
      if (err.status === 404 || /HTTP 404/.test(err.message)) {
        const by = await replacementFor(e.id);
        fail(e.id, by
          ? `HTTP 404 — this entry was OBSOLETED and superseded by ${by}. Decide in corpus/macromolecules.json whether the replacement is the structure you meant; it is a different experiment.`
          : 'HTTP 404 and it is not in the removed holdings either');
      } else {
        fail(e.id, err.message);
      }
    }
  }

  console.log(`\n-- ${small.entries.length} ChEBI entries`);
  await ensureChebi();
  const byId = await readChebi(small.entries.map((e) => e.id));
  await mkdir(join(OUT, 'chebi'), { recursive: true });
  for (const e of small.entries) {
    const rec = byId.get(e.id);
    if (!rec) { fail(e.id, 'not present in the ChEBI 3-star archive'); continue; }
    // A record with no connection table has no structure to draw. Refuse it
    // rather than shipping a molecule that renders as nothing.
    if (!/V2000|V3000/.test(rec.molblock)) { fail(e.id, 'no connection table in the record'); continue; }
    const sdf = `${rec.molblock}\n$$$$\n`;
    const slug = e.id.replace('CHEBI:', '');
    await writeFile(join(OUT, 'chebi', `${slug}.sdf`), sdf, 'utf8');
    structures.push({
      kind: 'chebi',
      id: e.id,
      family: e.family,
      why: e.why,
      name: rec.name,
      alias: e.alias ?? null,
      inchikey: rec.inchikey,
      formula: rec.formula,
      mass: Number.isFinite(rec.mass) ? rec.mass : null,
      charge: Number.isFinite(rec.charge) ? rec.charge : null,
      iupac: rec.iupac,
      definition: rec.definition,
      atoms: countMolAtoms(rec.molblock),
      file: `chebi/${slug}.sdf`,
      bytes: Buffer.byteLength(sdf),
    });
  }

  const index = {
    builtAt: new Date().toISOString().slice(0, 10),
    counts: {
      pdb: structures.filter((s) => s.kind === 'pdb').length,
      chebi: structures.filter((s) => s.kind === 'chebi').length,
    },
    // ✂️ The screen says this out loud. A library that looks complete and is
    // not makes people conclude the search is broken.
    outOf: { pdb: 'about 230,000 experimental structures in the PDB', chebi: '52,953 manually curated ChEBI entries' },
    sources: [
      { name: 'RCSB PDB', licence: 'CC0 1.0', url: 'https://www.rcsb.org/pages/usage-policy' },
      { name: 'ChEBI (EMBL-EBI)', licence: 'CC BY 4.0', url: 'https://ftp.ebi.ac.uk/pub/databases/chebi/SDF/LICENSE' },
    ],
    structures,
  };
  await writeFile(join(OUT, 'index.json'), JSON.stringify(index), 'utf8');

  const total = structures.reduce((n, s) => n + s.bytes, 0);
  console.log(`\n== ${structures.length} entries, ${(total / 1048576).toFixed(2)} MB on disk`);
  const pdbOnly = structures.filter((s) => s.kind === 'pdb');
  if (pdbOnly.length) {
    const big = pdbOnly.reduce((a, b) => (a.bytes > b.bytes ? a : b));
    const small2 = pdbOnly.reduce((a, b) => (a.bytes < b.bytes ? a : b));
    console.log(`   largest  ${big.id} ${(big.bytes / 1048576).toFixed(2)} MB (${big.atoms} atoms)`);
    console.log(`   smallest ${small2.id} ${(small2.bytes / 1024).toFixed(0)} KB (${small2.atoms} atoms)`);
  }
  if (failures.length) {
    console.error(`\n!! ${failures.length} entr${failures.length === 1 ? 'y' : 'ies'} could not be built:`);
    for (const f of failures) console.error(`   ${f}`);
    process.exitCode = 1;
  }
}

/** Atom count from a V2000 counts line. Absent or unreadable is null, not 0. */
function countMolAtoms(molblock) {
  const lines = molblock.split('\n');
  if (lines.length < 4) return null;
  const n = Number.parseInt(lines[3].slice(0, 3), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

main().catch((err) => { console.error(err); process.exit(1); });
