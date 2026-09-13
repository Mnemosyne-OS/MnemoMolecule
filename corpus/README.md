# The corpus is an editorial choice, and this is where it is written down

Atlas does not choose: it ships all of BodyParts3D. Here, shipping everything is
impossible — the PDB holds ~230,000 experimental structures and ChEBI ~53,000
manually curated compounds — so **somebody picked a few hundred**, and that pick
is an opinion about what a biochemistry student meets in their first two years.

An opinion that is not written down cannot be argued with. So every entry in
`macromolecules.json` and `small-molecules.json` carries a `why` line, and in
six months anyone can ask why myoglobin is in and some other protein is not.

## The two halves, and why they come from two databases

| Half | Source | Licence | Format shipped |
|---|---|---|---|
| Macromolecules (proteins, nucleic acids) | RCSB PDB | **CC0 1.0** | `.bcif.gz` |
| Small molecules (amino acids, drugs, cofactors) | ChEBI | **CC BY 4.0** | `.sdf` |

⛔ **PubChem is deliberately absent.** It is free, public and served by the US
government, and it is still not redistributable with our eyes closed: the NCBI
says depositors "may claim patent, copyright, or other intellectual property
rights" in parts of the data and that it "cannot provide … unrestricted
permission concerning the use, copying, or distribution" of it. PDB and ChEBI
cover the same ground with licences that say what they permit. See `NOTICE.md`.

## Regenerating

```
pnpm --filter @mnemosyne-plugins/mnemo-molecule corpus
```

The script downloads, converts and writes `public/corpus/`. It **reports every
entry it could not resolve** and writes none of them silently — a corpus that
quietly shrinks is a library that looks complete and is not.

## Two traps this script exists to avoid

🪤 **A PDB entry can return HTTP 200 and contain zero atoms.** Measured
2026-09-09: `files.rcsb.org/download/4V6X.cif` is a well-formed mmCIF, 1.37 MB,
and has **no coordinate records at all** — RCSB serves metadata only for
structures too large for the legacy PDB-compatible format. A script that checks
the status code and the file size would ship a structure that renders as
nothing. So the builder parses what it fetched and refuses an entry with no
atoms.

🪤 **A resolution that was never reported is not zero.** NMR and some cryo-EM
entries have no resolution. The field is `null`, and the screen renders `—`.
