/**
 * corpusDrift — the editorial lists and the screen must not drift apart.
 *
 * The corpus is a human's opinion written in JSON, and every one of these
 * checks guards a way that opinion can silently stop matching the app: a family
 * added without a translated name renders its own key; an entry without a label
 * shows a shouty depositor sentence in the quiz; a family that drops to three
 * entries becomes an unaskable tile.
 *
 * These read the REAL files rather than a fixture. A drift test against a copy
 * of the data is a test of the copy.
 */
import { describe, expect, it } from 'vitest';
import macro from '../../corpus/macromolecules.json';
import small from '../../corpus/small-molecules.json';
import { LANGS, STRINGS, type Key } from '../i18n/strings';
import { MIN_FOR_QUIZ } from '../mnemo/levels';

const macroEntries = macro.entries as { id: string; label: string; family: string; why: string }[];
const smallEntries = small.entries as { id: string; family: string; why: string; alias?: string }[];
const allFamilies = [...new Set([...macroEntries, ...smallEntries].map((e) => e.family))];

describe('every family the corpus declares has a name in every language', () => {
  for (const lang of LANGS) {
    it(`${lang} names all ${allFamilies.length} families`, () => {
      const missing = allFamilies.filter((f) => !(`family.${f}` in STRINGS[lang]));
      expect({ lang, missing }).toEqual({ lang, missing: [] });
    });
  }

  it('has no family string left over for a family nobody ships', () => {
    // Dead strings are how a table stops being trustworthy: after two of them
    // nobody believes the table describes the product.
    const declared = Object.keys(STRINGS.en)
      .filter((k) => k.startsWith('family.'))
      .map((k) => k.slice('family.'.length));
    expect(declared.filter((f) => !allFamilies.includes(f))).toEqual([]);
  });
});

describe('every family can actually be studied', () => {
  it(`holds at least ${MIN_FOR_QUIZ} entries, or the quiz cannot ask it fairly`, () => {
    const counts = new Map<string, number>();
    for (const e of [...macroEntries, ...smallEntries]) {
      counts.set(e.family, (counts.get(e.family) ?? 0) + 1);
    }
    const tooSmall = [...counts].filter(([, n]) => n < MIN_FOR_QUIZ);
    expect(tooSmall).toEqual([]);
  });
});

describe('the editorial promises hold', () => {
  it('gives every structure a short label of our own', () => {
    // Without one the list and the quiz fall back to the depositor title, and
    // four full sentences as options give the answer away by length.
    expect(macroEntries.filter((e) => !e.label?.trim()).map((e) => e.id)).toEqual([]);
  });

  it('keeps every label short enough to read in a list', () => {
    const long = macroEntries.filter((e) => e.label.length > 40).map((e) => `${e.id}: ${e.label}`);
    expect(long).toEqual([]);
  });

  it('writes one line of justification per entry, per doc 115 section 4.5', () => {
    const bare = [...macroEntries, ...smallEntries].filter((e) => (e.why ?? '').trim().length < 20);
    expect(bare.map((e) => e.id)).toEqual([]);
  });

  it('never lists the same id twice', () => {
    const ids = [...macroEntries, ...smallEntries].map((e) => e.id);
    expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
  });

  it('uses well-formed identifiers on both sides', () => {
    expect(macroEntries.filter((e) => !/^[0-9][A-Za-z0-9]{3}$/.test(e.id)).map((e) => e.id)).toEqual([]);
    expect(smallEntries.filter((e) => !/^CHEBI:\d+$/.test(e.id)).map((e) => e.id)).toEqual([]);
  });

  it('never gives a compound an alias identical to its own family or id', () => {
    // An alias exists to be a NAME. One that repeats the id is a filled field
    // pretending to be an editorial choice.
    const silly = smallEntries.filter((e) => e.alias && (e.alias === e.id || e.alias === e.family));
    expect(silly).toEqual([]);
  });
});

describe('the built corpus is the one the lists describe', () => {
  it('states the count in a key that exists', () => {
    // `lib.count` is what tells a reader the library is a slice. If the key
    // ever goes, the sentence goes silently with it.
    expect('lib.count' as Key in STRINGS.en).toBe(true);
    expect('lib.outOf' as Key in STRINGS.en).toBe(true);
  });
});

describe('no two level tiles read the same', () => {
  // The review screen shows one tile per source AND one per family, side by
  // side. Two tiles with the same words are two different questions wearing
  // the same label, and a reader cannot tell which one they picked. Found on
  // screen: `lib.chebi` and `family.small` were both "Small molecules".
  for (const lang of LANGS) {
    it(`${lang} gives every tile a distinct label`, () => {
      const dict = STRINGS[lang] as Record<string, string>;
      const labels = [
        dict['lib.all']!, dict['lib.pdb']!, dict['lib.chebi']!,
        ...allFamilies.map((f) => dict[`family.${f}`]!),
      ];
      const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
      expect({ lang, dupes }).toEqual({ lang, dupes: [] });
    });
  }
});
