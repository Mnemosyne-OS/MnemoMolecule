# Molecule

An offline explorer of molecular structures, wired to your own memory.

Turn a protein in 3D, read the experiment behind it — method, resolution, year,
organism — and ask what your own notes already say about it. Then let it quiz
you: it hides a structure's name, asks which one it is, and remembers when to
ask again.

Nothing here reaches the network. The structures travel inside the cartridge.

## Why it exists

Atlas made the human body a spatial index into your own memory, because every
anatomical part carries an FMA identifier that is stable across languages,
spellings and sources. Chemistry has that twice over, and one of the two is
better than FMA:

| Object | Key | Example |
|---|---|---|
| An experiment | **PDB ID** | `1HHO` |
| A protein | **UniProt accession** | `P69905` |
| A biological small molecule | **ChEBI ID** | `CHEBI:15377` |
| **Any molecule at all** | **InChIKey** | `XLYOFNOQVPJJNP-UHFFFAOYSA-N` |

An InChIKey is not *assigned* by an authority — it is **computed from the
structure**. Two people drawing the same molecule in two programs in two
countries get the same 27 characters. That is what turns a viewer into an index:
notes written in a lecture say "haemoglobin", notes copied off a slide say
`1HHO`, a paper pasted into a vault says `P69905`, and the memory question
carries all of them.

## 🚨 A structure is not a molecule

`1HHO` is not "haemoglobin". It is **one experiment** — a particular crystal, a
particular resolution, a particular year and team. `P69905` is the protein. The
identity card shows **both levels, named**, and says which is which, because
writing the protein's name over the experiment's id states something false about
the world.

The same discipline runs through the rest of the screen:

- A resolution nobody reported renders `—`, never `0.00 Å`. Four of the 105 PDB
  entries are solution NMR and have none at all.
- A resolution that *is* reported and is coarse gets a sentence. A 3.5 Å
  structure and a 1.0 Å structure produce the identical picture on screen, so
  without that sentence the picture is the only evidence a reader has.
- The library says how many structures it holds **and what that is a slice of**.
  222 of about 283,000 is a chosen subset, and a library that looks complete and
  is not makes the person who notices conclude the search is broken.

## What is in the box

| | Count | Source | Licence |
|---|---|---|---|
| Experimental structures | 105 | RCSB PDB | **CC0 1.0** |
| Small molecules | 117 | ChEBI (EMBL-EBI) | **CC BY 4.0** |

13.8 MB on disk. The largest is the human 80S ribosome (`4V6X`, 237,685 atoms,
2.88 MB) and the smallest is crambin (`1CRN`, 327 atoms, 16 KB).

The choice of *which* 222 is an opinion, so it is written down: `corpus/` holds
both editorial lists with **one line of justification per entry**. See
`corpus/README.md`.

⛔ PubChem is deliberately absent, and `NOTICE.md` says why in the NCBI's own
words. PDB and ChEBI cover the same ground with licences that state what they
permit.

## The viewer

**3Dmol.js**, BSD-3-Clause, chosen on a measurement rather than a reputation.
Built with the same vite and the same structure loaded:

| | bundle | gzip |
|---|---|---|
| 3Dmol.js 2.5.5 | **588 kB** | 170 kB |
| Mol\* 5.11.0, headless core | 2,907 kB | 824 kB |
| Mol\* 5.11.0, with its React UI | 3,557 kB | 1,011 kB |

Structures ship as **BinaryCIF, gzipped**: 1.01 MB against 1.72 MB for
mmCIF+gzip over nine representative entries, and 3Dmol parses both to the
identical atom count.

## Installing

This cartridge is not in MnemoHub yet. Install it by pointing Mnemosyne OS at
this repository, from MnemoHub's dev cartridges section.

⚠️ Only the **first** cartridge installed that way is free. From the second one
on, an active Engramm licence is required (`DEV_LINK_LICENSE_REQUIRED`).
Cartridges installed from MnemoHub itself do not count against that slot.

Nothing is built, downloaded or compiled on your machine: `dist/` is committed
to this repository and is read straight off your disk.

## What it asks for, and why

- **It reads your memory, and it writes only its own.** The cartridge asks for
  `vault:read` and `vault:write`. The write permission exists for one thing:
  saving a revision run into the cartridge's own sandbox vault, on your gesture.
  It never writes to your other vaults. A sandbox vault is a store the cartridge
  owns, and making anything in it permanent is a decision you make in the shell,
  not one the cartridge can take.
- **Asking your memory costs an inference.** The memory panel runs a model over
  your own vaults, so on a cloud route it is billed. It is a button you press,
  never a panel that fills itself.

## Building it

```bash
scripts/setup-mnemo-molecule.sh
```

That guards against installing while the app is running, takes a cross-session
lock, builds the cartridge SDK, typechecks, tests and builds.

To rebuild the corpus after editing `corpus/*.json`:

```bash
pnpm --filter @mnemosyne-plugins/mnemo-molecule corpus
```

It downloads a 59 MB ChEBI archive once into `.corpus-cache/` (gitignored) and
**reports every entry it could not resolve** instead of dropping it.

## What has not been proven

The cartridge has been seen running against its own production build: the
library, the 3D view, the identity card, the format sniffing, and a full quiz
run. It has **not** been run inside the Mnemosyne shell. Everything that talks
to the host — the memory button, the review schedule, writing a session to a
vault — has only been exercised in its no-host branch, which is the branch that
says so out loud.
