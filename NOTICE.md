# NOTICE

This cartridge redistributes three works that are not ours. Each line below is a
licence condition, not a courtesy, and each carries **the URL at which the
licence was read**, on 2026-09-09.

## Viewer code — BSD-3-Clause

3Dmol.js, Copyright (c) 2014, University of Pittsburgh and contributors.
https://github.com/3dmol/3Dmol.js

- Licence text reproduced verbatim in `LICENSE.3dmol`, as clause 2 requires.
- Read at: https://raw.githubusercontent.com/3dmol/3Dmol.js/master/LICENSE
- 3Dmol.js itself incorporates code from GLmol, Three.js and jQuery; its licence
  file carries their notices and is reproduced whole rather than excerpted.

## Macromolecular structures — CC0 1.0

> "data files contained in the PDB archive are available under the CC0 1.0
> Universal (CC0 1.0) Public Domain Dedication"

- Source: RCSB Protein Data Bank, https://www.rcsb.org/
- Read at: https://www.rcsb.org/pages/usage-policy
- Coordinates are fetched as BinaryCIF from `models.rcsb.org`; entry metadata
  (title, method, resolution, UniProt accessions, organism) from
  `data.rcsb.org`.
- CC0 requires no attribution. It is credited anyway, in the app's "Sources"
  panel and here, because knowing where a structure came from is part of
  judging it.

## Small-molecule structures — CC BY 4.0

ChEBI (Chemical Entities of Biological Interest), EMBL-EBI.

- Licence: https://creativecommons.org/licenses/by/4.0/
- Read at: https://ftp.ebi.ac.uk/pub/databases/chebi/SDF/LICENSE — the
  CC BY 4.0 text sits in the download directory itself, beside the archives.
- Dataset: `chebi_3_stars.sdf.gz`, the manually curated 3-star subset
  (52,953 entries on 2026-09-09).
- Attribution is rendered in the app's "Sources" panel, always, whichever
  structure is on screen — the cartridge distributes the data whether or not a
  ChEBI entry happens to be selected.

## ⛔ What was deliberately NOT used

**PubChem.** It is free, public, requires no account and is served by the US
government, and it is still not redistributable with our eyes closed. The NCBI's
own policy says that while US-government-created content is public domain,
depositors "may claim patent, copyright, or other intellectual property rights
in all or a portion of the data", and that the NCBI "cannot provide comment or
unrestricted permission concerning the use, copying, or distribution of the
information contained in the molecular databases".

Read at: https://www.ncbi.nlm.nih.gov/home/about/policies/

PDB and ChEBI cover the same ground with licences that state what they permit,
so nothing was lost by leaving PubChem out.

**DrugBank.** CC BY-NC. The non-commercial clause is disqualifying, and this is
a standing direction of the repository (doc 90). The ChEBI records carry a
`DrugBank Database Links` cross-reference field; the corpus builder does not
copy it into anything we ship.

**ChemDoodle Web Components** (GPL-3 outside internal use) and **JSmol/Jmol**
(LGPL) were not used. A Hub cartridge that embeds GPL code becomes GPL, and the
Hub serves commercial software.

## What the app does with all this

| Choice | Why |
|---|---|
| `base: './'` and `assetUrl()` on the runtime fetches | An installed cartridge is served from `mnemo-plugin://app/<id>/`, where a root-absolute asset URL matches no plugin id and 404s. |
| Coordinates ship as `.bcif.gz` | Measured over nine representative structures: 1.01 MB as BinaryCIF+gzip against 1.72 MB as mmCIF+gzip, and 3Dmol parses both to the identical atom count. |
| Coordinates come from `models.rcsb.org`, not `files.rcsb.org` | `files.rcsb.org/download/4V6X.cif` returns HTTP 200 and a well-formed 1.37 MB mmCIF with **zero** coordinate records — RCSB serves metadata only for structures too large for the legacy format. |
| The corpus is 222 of ~283,000 available entries | Shipping everything is impossible, so somebody chose. The choice and its reasoning are in `corpus/` and the count is stated on screen. |
| A resolution that was never reported is `null` | Four of the 105 PDB entries are solution NMR and have no resolution at all. `0 Å` would render them as perfect structures. |
