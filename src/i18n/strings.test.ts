import { describe, expect, it } from 'vitest';
import { LANGS, STRINGS, isLang, translate, type Key, type Lang } from './strings';

const keysOf = (l: Lang) => Object.keys(STRINGS[l]).sort();

describe('every language carries every key', () => {
  const english = keysOf('en');

  for (const lang of LANGS) {
    it(`${lang} has exactly the English key set`, () => {
      // A missing key is invisible to whoever does not read that language,
      // which is precisely the person it happens to.
      expect(keysOf(lang)).toEqual(english);
    });
  }

  it('ships the three locales the product actually has', () => {
    expect(LANGS).toEqual(['en', 'fr', 'es']);
  });
});

describe('placeholders agree across languages', () => {
  const holders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

  for (const lang of LANGS) {
    if (lang === 'en') continue;
    it(`${lang} uses the same placeholders as English`, () => {
      // A translation that drops {n} renders a sentence with a hole in it, and
      // one that invents {total} renders the braces.
      for (const key of Object.keys(STRINGS.en) as Key[]) {
        const en = holders((STRINGS.en as Record<string, string>)[key]!);
        const other = holders((STRINGS[lang] as Record<string, string>)[key]!);
        expect({ key, holders: other }).toEqual({ key, holders: en });
      }
    });
  }
});

describe('translate', () => {
  it('fills the placeholders it is given', () => {
    expect(translate('en', 'lib.count', { n: 222 })).toBe('222 structures in this cartridge');
  });

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    // A visible {n} gets reported; a silent gap does not.
    expect(translate('en', 'lib.count', { wrong: 1 })).toContain('{n}');
  });

  it('returns the string untouched when no variables are given', () => {
    expect(translate('fr', 'review.title')).toBe('Révision');
  });

  it('falls back to English rather than rendering the key itself', () => {
    // `review.tooSmall` on screen is worse than an English sentence.
    const dicts = STRINGS as unknown as Record<string, Record<string, string>>;
    const saved = dicts.fr!['review.title'];
    delete dicts.fr!['review.title'];
    try {
      expect(translate('fr', 'review.title')).toBe('Review');
    } finally {
      dicts.fr!['review.title'] = saved!;
    }
  });
});

describe('isLang', () => {
  it('accepts the languages that exist', () => {
    expect(isLang('fr')).toBe(true);
  });

  it('rejects everything else without throwing', () => {
    expect(isLang('de')).toBe(false);
    expect(isLang(undefined)).toBe(false);
    expect(isLang(42)).toBe(false);
  });
});
