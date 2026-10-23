/**
 * The registry of a section's search keys (docs/superpowers/specs/2026-10-22-search-pills-design.md):
 * everything about a key in one place, its name, its aliases, its group, its
 * type, its words, its values and where its suggestions come from. The field's
 * suggestions, its tooltips, its checks and the words its pills write all read
 * it; nothing is copied in App.tsx any more.
 */

/**
 * - text: free words (an artist, a title): never wrong, suggestions from the collection.
 * - list: free too, but from a short list (an owner, a collection): its `values` and its `suggest`.
 * - bool: yes or no; true/false, with/without, y/n, 1/0 are understood and written yes/no.
 * - enum: one of its `values`, anything else is a mistake to show.
 * - number: 4, >=4, <3, 2-4, 3.5; its `shortcuts` offered.
 * - date: 2024-01-01 with >, <…, or words (today, week…): not checked, its `shortcuts` offered.
 */
export type SearchKeyType = 'text' | 'list' | 'bool' | 'enum' | 'number' | 'date';

/** A value a key offers, with what it means: yes/no, lossless, >=4. */
export interface SearchValue {
  value: string;
  desc?: string;
}

/** A value found in the collection, as a key's `suggest` hands it. */
export interface SuggestedValue {
  value: string;
  count?: number;
  desc?: string;
}

export interface SearchKey {
  /** Its name, as the string writes it: composer, original_language. */
  key: string;
  /** Other names understood, written back as `key`: fav for favourites, lang for original_language. */
  aliases?: string[];
  /** The heading it stands under in the empty field's menu: Who, What, When… */
  group: string;
  type: SearchKeyType;
  /** What it finds, in a few words: "A composer of one of its tracks". */
  desc: string;
  /** An example of it written in full, shown beside it: composer:Bach. */
  example?: string;
  /** For bool, enum and list keys: the values it takes, with what each means. */
  values?: SearchValue[];
  /** For number and date keys: the values offered (>=4, 1960-1969, week). */
  shortcuts?: SearchValue[];
  /** The values of the collection that contain the words typed (all of them for ''). */
  suggest?: (typed: string) => Promise<SuggestedValue[]>;
  /**
   * Whether a plain word typed looks among its values too (bach → composer:Bach).
   * Off for titles and tracks: too many, and the plain words find them anyway.
   */
  valuesForWords?: boolean;
}

/** A thing a few letters may name, which the menu opens: an album, a movie, a book. */
export interface SearchGuess {
  id: number;
  /** Its name, as the menu shows it and the grey rest completes it. */
  label: string;
  /** Who and when, under it: "The Beatles · 1969". */
  sub?: string;
  /** A small picture of it: a cover, a poster. */
  image?: string;
}

/**
 * What a few letters most likely name, offered first in the menu, each kind
 * under its heading, the heading holding the best one first: people, who
 * become a pill of one of their keys (artist:, composer:), and things, which
 * open (docs/superpowers/specs/2026-10-23-search-guess, variant A).
 */
export type SearchGuessGroup =
  | { section: string; kind: 'pill'; keys: string[] }
  | {
    section: string;
    kind: 'open';
    find: (typed: string) => Promise<SearchGuess[]>;
    open: (guess: SearchGuess) => void;
    /** The key Tab writes its name in, as a pill: title:"A Good Day to Die Hard". */
    key: string;
  };

export interface SearchSchema {
  /** Its name, for the recent searches and the tests: music, movies, books, scores, wishlist. */
  section: string;
  keys: SearchKey[];
  placeholder: string;
  /** What plain words search, said under the word in the menu. */
  wordsHint?: string;
  /** What a few letters may name, guessed first: without it, the keys' values as they come. */
  guesses?: SearchGuessGroup[];
}

/** A bool key's two values, with what each means. */
export const yesNo = (yes: string, no: string): SearchValue[] => [
  { value: 'yes', desc: yes },
  { value: 'no', desc: no },
];

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The values in rows of an autocomplete endpoint, which answer `[{ [field]: value }]`:
 * a value may be a JSON list held in a string (a movie's cast, an album's
 * artists, genres and labels, a book's authors and tags), or a number (a year).
 * Each name once, without the quotes some carry, those containing `typed`.
 */
export const valuesFromRows = (rows: unknown, field: string, typed = ''): string[] => {
  if (!Array.isArray(rows)) return [];
  const found: string[] = [];
  const add = (value: unknown) => {
    if (value == null || value === '' || value === 'undefined') return;
    if (Array.isArray(value)) { value.forEach(add); return; }
    if (typeof value === 'number') { found.push(String(value)); return; }
    if (typeof value !== 'string') return;
    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) { parsed.forEach(add); return; }
      } catch {
        // Not a list after all: a name that begins with a bracket.
      }
    }
    found.push(value.replace(/^["']|["']$/g, '').trim());
  };
  for (const row of rows) add(row && typeof row === 'object' ? (row as Record<string, unknown>)[field] : row);
  const want = plain(typed.replace(/"/g, ''));
  const seen = new Set<string>();
  return found.filter(value => {
    const key = plain(value);
    if (!value || seen.has(key) || (want && !key.includes(want))) return false;
    seen.add(key);
    return true;
  });
};

/**
 * A key's `suggest` from an autocomplete endpoint (musicService, bookService,
 * apiService's getAutocompleteSuggestions): its values containing the words
 * typed, the ones that begin with them first. `describe` says something of a
 * value from its row (a collection or a box set); a failure offers nothing.
 */
export const suggestFrom = (
  load: (field: string, typed: string) => Promise<unknown>,
  field: string,
  { describe, limit = 20 }: { describe?: (row: Record<string, unknown>) => string | undefined; limit?: number } = {},
) => async (typed: string): Promise<SuggestedValue[]> => {
  let rows: unknown;
  try {
    rows = await load(field, typed.replace(/"/g, ''));
  } catch {
    return [];
  }
  const descs = new Map<string, string>();
  if (describe && Array.isArray(rows)) {
    for (const row of rows as Array<Record<string, unknown>>) {
      const name = row?.[field];
      const desc = row && describe(row);
      if (typeof name === 'string' && desc) descs.set(name, desc);
    }
  }
  const want = plain(typed);
  return valuesFromRows(rows, field, typed)
    .sort((a, b) => (plain(a).startsWith(want) ? 0 : 1) - (plain(b).startsWith(want) ? 0 : 1))
    .slice(0, limit)
    .map(value => (descs.has(value) ? { value, desc: descs.get(value) } : { value }));
};
