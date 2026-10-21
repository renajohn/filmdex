import Book from '../models/book';
import { getDatabase } from '../database';
import bookService from './bookService';
import musicbrainzService from './musicbrainzService';
import henleService, { henleNumberOf } from './henleService';
import scorePiecesService, { ScorePiecesError, type PieceSuggestion } from './scorePiecesService';
import logger from '../logger';

/**
 * Adding a score in one go: from a title or the ISMN on its back, its works
 * (its pieces, the recordings of the music) and its edition (Henle's title,
 * number, cover and level when the ISMN is Henle's); then kept, its pieces with it.
 */

export interface ScoreEdition {
  title: string;
  composer: string | null;
  publisher: string | null;
  /** The publisher's number: HN 383. */
  number: string | null;
  /** The ISMN or ISBN on its back. */
  code: string | null;
  cover: string | null;
  level: number | null;
  /** Its page at its publisher's. */
  url: string | null;
}

export interface ScoreLookup {
  edition: ScoreEdition;
  works: PieceSuggestion[];
  /** Where the edition comes from: Henle's site, or only the words typed. */
  from: 'henle' | 'code' | 'words';
}

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const codeOf = (query: string): string | null => {
  const digits = query.replace(/[\s-]/g, '');
  return /^(?:979|978)\d{10}$/.test(digits) ? digits : null;
};

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> => new Promise((resolve, reject) => {
  getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows || [])));
});

/** A composer as the scores already write them: "Frédéric Chopin", not MusicBrainz's "Fryderyk Chopin". */
const asTheScoresWrite = async (name: string): Promise<string> => {
  const known = (await all<{ composer: string }>(`SELECT DISTINCT composer FROM books WHERE book_type = 'score' AND composer IS NOT NULL`)).map(row => row.composer);
  const surname = plain(name.split(' ').slice(-1)[0]);
  return known.find(other => plain(other.split(' ').slice(-1)[0]) === surname) || name;
};

/**
 * The composer words name: one whose surname they hold, the most of
 * MusicBrainz's works for them are by; or, naming none, the composer of a work
 * whose title holds every word ("kinderszenen"), never a guess ("romantic sketchbook").
 */
const composerOf = async (query: string): Promise<string | null> => {
  const hits = (await musicbrainzService.searchWorks(query, 15).catch(() => [])).filter(hit => hit.score >= 70 && hit.composers.length);
  const counts = new Map<string, number>();
  for (const hit of hits) for (const name of hit.composers) counts.set(name, (counts.get(name) || 0) + 1);
  const words = plain(query);
  const named = [...counts.keys()].filter(name => words.includes(plain(name.split(' ').slice(-1)[0])))
    .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));
  if (named.length) return asTheScoresWrite(named[0]);
  // Of the works whose title holds every word, the composer of the most: Schumann's Kinderszenen and its thirteen pieces, not another's.
  const significant = words.split(/\s+/).filter(word => word.length >= 4);
  if (!significant.length) return null;
  const titled = new Map<string, number>();
  for (const hit of hits.filter(h => h.score >= 80 && significant.every(word => plain(h.title).includes(word)))) {
    for (const name of hit.composers) titled.set(name, (titled.get(name) || 0) + 1);
  }
  const best = [...titled].sort((a, b) => b[1] - a[1])[0];
  return best ? asTheScoresWrite(best[0]) : null;
};

/** A score to add, from what was typed or scanned. */
const lookup = async (query: string): Promise<ScoreLookup> => {
  const words = query.trim();
  if (words.length < 2) throw new ScorePiecesError('A title, a composer or its ISMN', 400);
  const code = codeOf(words);
  if (code) {
    const number = henleNumberOf(code);
    const henle = number ? await henleService.edition(number).catch(error => { logger.warn(`henle.de not read: ${(error as Error).message}`); return null; }) : null;
    if (henle) {
      return {
        from: 'henle',
        edition: { title: henle.title, composer: henle.composer, publisher: 'G. Henle Verlag', number: henle.number, code, cover: henle.cover, level: henle.level, url: henle.url },
        works: henle.composer ? await scorePiecesService.suggestFor({ title: henle.title, composer: henle.composer }, new Set()).catch(() => []) : [],
      };
    }
    return { from: 'code', edition: { title: '', composer: null, publisher: number ? 'G. Henle Verlag' : null, number: number ? `HN ${number}` : null, code, cover: null, level: null, url: null }, works: [] };
  }
  const composer = await composerOf(words);
  // The work's words: the typed ones without the composer's name.
  const title = composer
    ? words.split(/\s+/).filter(word => !composer.split(' ').some(name => plain(name) === plain(word))).join(' ') || words
    : words;
  const works = composer ? await scorePiecesService.suggestFor({ title, composer }, new Set()).catch(error => {
    logger.warn(`Works for "${words}" not found: ${(error as Error).message}`);
    return [] as PieceSuggestion[];
  }) : [];
  const chosen = works.filter(work => work.likely !== false);
  return {
    from: 'words',
    edition: { title: chosen.length ? chosen.map(work => work.title).join(' & ') : title, composer, publisher: null, number: null, code: null, cover: null, level: null, url: null },
    works,
  };
};

export interface NewScore {
  title?: string;
  composer?: string | null;
  publisher?: string | null;
  number?: string | null;
  code?: string | null;
  cover?: string | null;
  level?: number | null;
  url?: string | null;
  priceChf?: number | string | null;
  purchasedAt?: string | null;
  titleStatus?: 'owned' | 'borrowed';
  owner?: string | null;
  workIds?: string[];
}

/** "Préludes, Premier livre (HN 383)": the publisher's number in its title, as the scores have it. */
export const titleWithNumber = (title: string, number: string | null | undefined) =>
  (number && !title.includes(number) ? `${title} (${number})` : title).trim();

/** The score kept, its cover fetched, its pieces with it. */
const create = async (input: NewScore): Promise<{ id: number }> => {
  const title = (input.title || '').trim();
  if (!title) throw new ScorePiecesError('A score needs a title', 400);
  const code = input.code ? codeOf(input.code) : null;
  const price = typeof input.priceChf === 'string' ? parseFloat(input.priceChf.replace(',', '.')) : input.priceChf;
  const borrowed = input.titleStatus === 'borrowed';
  const book = await bookService.addBook({
    title: titleWithNumber(title, input.number),
    authors: [],
    publisher: input.publisher || null,
    isbn13: code,
    bookType: 'score',
    format: 'physical',
    composer: input.composer || null,
    difficulty: input.level ?? null,
    urls: input.url ? { henle: input.url } : {},
    availableCovers: input.cover ? [{ url: input.cover, source: 'Henle', type: 'front', priority: 30 }] : [],
    titleStatus: borrowed ? 'borrowed' : 'owned',
    owner: input.owner || null,
    priceChf: borrowed || !Number.isFinite(price as number) ? null : Math.round((price as number) * 100) / 100,
    purchasedAt: borrowed ? null : input.purchasedAt || new Date().toISOString().slice(0, 10),
  } as never);
  if (input.workIds?.length) await scorePiecesService.addPieces(book.id, { workIds: input.workIds });
  return { id: book.id };
};

/** A Henle score's page and level, read once from henle.de by the number its ISMN holds. */
const henleOf = async (bookId: number): Promise<{ url: string | null; level: number | null }> => {
  const book = await Book.findById(bookId);
  if (!book || book.bookType !== 'score') throw new ScorePiecesError('No such score', 404);
  if (book.urls?.henle) return { url: book.urls.henle, level: book.difficulty ?? null };
  const number = henleNumberOf(book.isbn13);
  if (!number) return { url: null, level: null };
  const henle = await henleService.edition(number).catch(() => null);
  if (!henle) return { url: null, level: null };
  await Book.update(book.id, { ...book, urls: { ...(book.urls || {}), henle: henle.url }, difficulty: henle.level ?? book.difficulty ?? null } as never);
  return { url: henle.url, level: henle.level ?? book.difficulty ?? null };
};

export default { lookup, create, henleOf };
