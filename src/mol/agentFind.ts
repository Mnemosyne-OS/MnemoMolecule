/**
 * agentFind — a structure or a family named the way a person says it (doc 149).
 *
 * The orb plans a spoken sentence in ONE model call and never reads Molecule first, so
 * « montre la caféine » reaches an action with the words « caféine », never `CHEBI:27732`.
 * An id still works (other agents call `find` first).
 *
 * Copied from Vitrine Studio's `data/agentFind.ts` (never imported across cartridges), with
 * one change for this domain: the corpus is named in English, so a word is reduced to a
 * rough stem that French and Spanish share with it (« insuline », « insulina » and « insulin »
 * all end as `insulin`; « caféine » and « caffeine » as `cafein`). The same reduction runs on
 * both sides, so it can only make two spellings meet, never invent a word.
 *
 * 🚨 Several matches are REFUSED with their names (AMBIGUOUS), never the first one taken:
 *    the refusal is what the orb's repair call reads to pick the right one. No match is
 *    refused with the names that exist.
 *
 * @module mol/agentFind
 */

/** Lower case, accents off, œ/æ spelled out. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

/**
 * Words that carry no name: articles and the words a sentence wraps a name in.
 * 🪤 Matched BEFORE the accents come off: folded, « thé » is « the ».
 */
const FILLER = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'mon', 'ma', 'mes', 'ce', 'cette', 'ces', 'et', 'en', 'au', 'aux', 'à',
  'the', 'a', 'an', 'of', 'my', 'and', 'el', 'los', 'las', 'del', 'mi', 'y',
  'molécule', 'molécules', 'molecule', 'molecules', 'molécula', 'moléculas', 'structure', 'structures', 'estructura', 'estructuras',
  'famille', 'familles', 'family', 'families', 'familia', 'familias',
]);

/** Words another language spells differently enough that no stem joins them. */
const WORD_SYNONYMS: Record<string, string> = { adn: 'dna', arn: 'rna', arnt: 'trna' };

/**
 * One word, reduced so FR/ES/EN spellings of the same name meet: folded, `ae` → `e`
 * (haemoglobin / hemoglobin), a leading `oe` → `e` (oestrogen / estrogen), doubled letters
 * single (caffeine / caféine), a plural `s`/`x` off, then a final `e`/`a` off
 * (insuline / insulina / insulin).
 */
export function stem(word: string): string {
  let w = fold(word);
  if (WORD_SYNONYMS[w]) return WORD_SYNONYMS[w]!;
  w = w.replace(/ae/g, 'e').replace(/^oe/, 'e').replace(/(\p{L})\1+/gu, '$1');
  if (w.length > 3) w = w.replace(/[sx]$/, '');
  if (w.length > 4) w = w.replace(/[ea]$/, '');
  return w;
}

/** The words of a name, fillers out, each reduced by `stem`. */
export function nameWords(s: string): string[] {
  return s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w))
    .map(stem)
    .filter(Boolean);
}

export interface Named<T> { item: T; id: string; names: string[]; label: string }

const LIST_MAX = 12;
export const listed = (labels: string[]): string => {
  const unique = [...new Set(labels)];
  return unique.length > LIST_MAX ? `${unique.slice(0, LIST_MAX).join(', ')} (+${unique.length - LIST_MAX})` : unique.join(', ');
};

/**
 * The one item `ref` names: its id (any case); else the item one of whose names says exactly
 * the words of `ref`; else the item whose words hold every word of `ref`. `kind` names the
 * error (NO_STRUCTURE, NO_FAMILY…) and the noun said; `hint` is added to a no-match refusal.
 */
export function findNamed<T>(
  entries: ReadonlyArray<Named<T>>,
  ref: string,
  kind: { code: string; noun: string; plural?: string; hint?: string },
): T {
  const raw = ref.trim();
  if (!raw) throw new Error(`BAD_ARG: name the ${kind.noun}`);
  const byId = entries.find((e) => fold(e.id) === fold(raw));
  if (byId) return byId.item;
  const asked = nameWords(raw);
  const all = entries.map((e) => e.label);
  const hint = kind.hint ? `. ${kind.hint}` : '';
  const nouns = kind.plural ?? `${kind.noun}s`;
  if (!asked.length) throw new Error(`${kind.code}: "${raw}" names no ${kind.noun}; ${nouns}: ${listed(all) || 'none'}${hint}`);
  // The whole name said wins over a partial match (« insulin » against « Insulin hexamer with zinc »).
  const whole = entries.filter((e) => e.names.some((n) => nameWords(n).join(' ') === asked.join(' ')));
  if (whole.length === 1) return whole[0]!.item;
  const hits = whole.length > 1 ? whole : entries.filter((e) => {
    const have = new Set(e.names.flatMap(nameWords));
    return asked.every((w) => have.has(w));
  });
  if (hits.length === 1) return hits[0]!.item;
  if (hits.length > 1) throw new Error(`AMBIGUOUS: "${raw}" names several ${nouns}: ${listed(hits.map((e) => e.label))}; say which`);
  throw new Error(`${kind.code}: no ${kind.noun} named "${raw}"; ${nouns}: ${listed(all) || 'none'}${hint}`);
}
