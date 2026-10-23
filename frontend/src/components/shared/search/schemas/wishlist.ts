import apiService from '../../../../services/api';
import bookService from '../../../../services/bookService';
import musicService from '../../../../services/musicService';
import { norm } from '../query';
import type { SearchKey, SearchSchema, SuggestedValue } from '../schema';
import { movieKeys } from './movies';

/**
 * The wish list's keys, as WishListPage reads them (utils/wishlistSearch.ts):
 * its movies are searched by the backend, as FilmDex's, its albums and books
 * in the page. title, genre and year find all three; type keeps one kind;
 * artist finds albums, author books; the other keys are a movie's, and a
 * movie key (not excluded) leaves the albums and books out. The values come
 * from the wish list itself.
 */

type Row = Record<string, unknown>;
interface Wishes { movies: Row[]; albums: Row[]; books: Row[] }

// The wish list read once for a minute: each value suggested comes from it.
let wishes: { at: number; items: Promise<Wishes> } | null = null;
const loadWishes = (): Promise<Wishes> => {
  if (!wishes || Date.now() - wishes.at > 60_000) {
    const list = (p: Promise<unknown>) => p.then(rows => (Array.isArray(rows) ? rows as Row[] : [])).catch(() => []);
    wishes = {
      at: Date.now(),
      items: Promise.all([
        list(apiService.getMoviesByStatus('wish')),
        list(musicService.getAlbumsByStatus('wish')),
        list(bookService.getBooksByStatus('wish')),
      ]).then(([movies, albums, books]) => ({ movies, albums, books })),
    };
  }
  return wishes.items;
};

/** The names a field holds: a list, a JSON list in a string, or words between commas (a movie's genres). */
const namesOf = (value: unknown, commas = false): string[] => {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(v => namesOf(v));
  if (typeof value === 'number') return [String(value)];
  if (typeof value !== 'string') return [];
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.flatMap(v => namesOf(v));
    } catch {
      // A name beginning with a bracket.
    }
  }
  return (commas ? value.split(',') : [value]).map(v => v.trim()).filter(Boolean);
};

/** The values of the wish list's items for a key: which items, which of their fields. */
const FIELDS: Record<string, Array<{ of: keyof Wishes; field: string; commas?: boolean }>> = {
  title: [{ of: 'movies', field: 'title' }, { of: 'albums', field: 'title' }, { of: 'books', field: 'title' }],
  genre: [{ of: 'movies', field: 'genre', commas: true }, { of: 'albums', field: 'genres' }, { of: 'books', field: 'genres' }],
  artist: [{ of: 'albums', field: 'artist' }],
  author: [{ of: 'books', field: 'authors' }],
  actor: [{ of: 'movies', field: 'cast' }],
  director: [{ of: 'movies', field: 'director' }],
  format: [{ of: 'movies', field: 'format' }],
  original_language: [{ of: 'movies', field: 'original_language' }],
  box_set: [{ of: 'movies', field: 'box_set_name' }],
  collection: [{ of: 'movies', field: 'box_set_name' }, { of: 'movies', field: 'user_collections', commas: true }],
};

/** A key's values in the wish list, those containing the words typed, the ones that begin with them first. */
const fromWishes = (key: string) => async (typed: string): Promise<SuggestedValue[]> => {
  const items = await loadWishes();
  const want = norm(typed.replace(/"/g, ''));
  const counts = new Map<string, { value: string; count: number }>();
  for (const { of, field, commas } of FIELDS[key] || []) {
    for (const item of items[of]) {
      for (const name of new Set(namesOf(item[field], commas))) {
        const id = norm(name);
        if (want && !id.includes(want)) continue;
        const seen = counts.get(id);
        if (seen) seen.count++;
        else counts.set(id, { value: name, count: 1 });
      }
    }
  }
  return [...counts.values()]
    .sort((a, b) => ((norm(a.value).startsWith(want) ? 0 : 1) - (norm(b.value).startsWith(want) ? 0 : 1)) || b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 20);
};

const withWishes = (field: string) => (FIELDS[field] ? { suggest: fromWishes(field) } : {});

/** The keys every kind has, said for all three. */
const SHARED: Record<string, string> = {
  title: 'Words of its title',
  genre: 'One of its genres',
  year: 'Its year (a movie’s release, an album’s, a book’s publication)',
};

const movies = movieKeys(withWishes);

const keys: SearchKey[] = [
  { key: 'type', aliases: ['kind'], group: 'Everything', type: 'enum', desc: 'A movie, an album or a book', example: 'type:album', values: [
    { value: 'movie', desc: 'Movies only' }, { value: 'album', desc: 'Albums only' }, { value: 'book', desc: 'Books only' },
  ] },
  ...movies.filter(k => SHARED[k.key]).map(k => ({ ...k, group: 'Everything', desc: SHARED[k.key] })),
  { key: 'artist', group: 'Albums', type: 'text', desc: 'The album’s artist', example: 'artist:"Joni Mitchell"', ...withWishes('artist') },
  { key: 'author', group: 'Books', type: 'text', desc: 'One of the book’s authors', example: 'author:Tolkien', ...withWishes('author') },
  ...movies.filter(k => !SHARED[k.key]).map(k => ({ ...k, group: 'Movies' })),
];

export const wishlistSchema: SearchSchema = {
  section: 'wishlist',
  keys,
  placeholder: 'Search the wish list: words, or a filter like type:album',
  wordsHint: 'In titles, directors, artists, authors and genres',
};
