import { norm, parseNumber, parseToken, quote, tokenize, type NumberValue } from '../components/shared/search/query';
import { wishlistSchema } from '../components/shared/search/schemas/wishlist';

/**
 * The wish list's search (components/shared/search/schemas/wishlist.ts). Its
 * movies are searched by the backend, as FilmDex's: what is sent there is the
 * search without the wish list's own keys (type, artist, author). Its albums
 * and books are searched here:
 * - plain words: each one in a title, an artist or an author, a genre, a
 *   catalogue number, a barcode, an ISBN or a series;
 * - title, genre, year: the album's or the book's, one value or another,
 *   `-` (or `!`) to exclude;
 * - type keeps or leaves out a kind, artist finds albums only, author books only;
 * - a movie's key (actor, spiders…) leaves the albums and books out, unless
 *   it is excluded (-actor:X: an album has no actor, it stays).
 */

type Item = Record<string, any>;
type Kind = 'movie' | 'album' | 'book';
type Match = (item: Item) => boolean;

export interface WishlistSearch {
  /** The search to send for the movies: null when no movie can match, '' for all of them. */
  movieQuery: string | null;
  matchAlbum: Match;
  matchBook: Match;
}

const has = (texts: unknown[], value: string): boolean => {
  const want = norm(value);
  return texts.some(t => t != null && norm(Array.isArray(t) ? t.join(', ') : String(t)).includes(want));
};

const inNumbers = (n: unknown, specs: NumberValue[]): boolean => {
  const x = typeof n === 'number' ? n : parseInt(String(n ?? ''), 10);
  if (!Number.isFinite(x)) return false;
  return specs.some(s => {
    switch (s.op) {
      case 'range': return x >= s.a && x <= (s.b as number);
      case '>': return x > s.a;
      case '>=': return x >= s.a;
      case '<': return x < s.a;
      case '<=': return x <= s.a;
      default: return x === s.a;
    }
  });
};

const ALBUM_WORDS = (a: Item) => [a.title, a.artist, a.genres, a.catalogNumber, a.barcode];
const BOOK_WORDS = (b: Item) => [b.title, b.authors, b.genres, b.isbn, b.isbn13, b.series];

/** The wish list's own keys, which the backend does not know. */
const OWN_KEYS = new Set(['type', 'artist', 'author']);
const SHARED_KEYS = new Set(['title', 'genre', 'year']);

export const parseWishlistSearch = (searchText: string): WishlistSearch => {
  const keys = wishlistSchema.keys;
  const kinds = new Set<Kind>(['movie', 'album', 'book']);
  const movieWords: string[] = [];
  const album: Match[] = [];
  const book: Match[] = [];

  for (const { text } of tokenize(searchText.trim())) {
    const t = parseToken(text, keys);
    if (t.kind === 'word' || !t.def || t.error) {
      // A plain word, or a filter not read: a word for all three.
      const word = text.replace(/"/g, '');
      movieWords.push(text);
      album.push(a => has(ALBUM_WORDS(a), word));
      book.push(b => has(BOOK_WORDS(b), word));
      continue;
    }
    if (t.pending) continue;
    const key = t.def.key;
    const values = t.canon || t.values;
    const keep = (m: Match): Match => (t.neg ? item => !m(item) : m);
    if (!OWN_KEYS.has(key)) {
      movieWords.push(`${t.neg ? '-' : ''}${key}:${values.map(quote).join(',')}`);
    }
    if (key === 'type') {
      const named = new Set(values as Kind[]);
      for (const kind of ['movie', 'album', 'book'] as Kind[]) if (named.has(kind) === t.neg) kinds.delete(kind);
    } else if (key === 'title') {
      album.push(keep(a => values.some(v => has([a.title], v))));
      book.push(keep(b => values.some(v => has([b.title, b.subtitle], v))));
    } else if (key === 'genre') {
      album.push(keep(a => values.some(v => has([a.genres], v))));
      book.push(keep(b => values.some(v => has([b.genres], v))));
    } else if (key === 'year') {
      const specs = t.nums || values.map(parseNumber).filter((n): n is NumberValue => !!n);
      album.push(keep(a => inNumbers(a.releaseYear, specs)));
      book.push(keep(b => inNumbers(b.publishedYear, specs)));
    } else if (key === 'artist') {
      album.push(keep(a => values.some(v => has([a.artist], v))));
      if (!t.neg) { kinds.delete('movie'); kinds.delete('book'); }
    } else if (key === 'author') {
      book.push(keep(b => values.some(v => has([b.authors], v))));
      if (!t.neg) { kinds.delete('movie'); kinds.delete('album'); }
    } else if (!SHARED_KEYS.has(key) && !t.neg) {
      // A movie's key: no album or book has it.
      kinds.delete('album');
      kinds.delete('book');
    }
  }

  const all = (list: Match[]): Match => item => list.every(m => m(item));
  return {
    movieQuery: kinds.has('movie') ? movieWords.join(' ') : null,
    matchAlbum: kinds.has('album') ? all(album) : () => false,
    matchBook: kinds.has('book') ? all(book) : () => false,
  };
};
