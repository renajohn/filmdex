import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import Book from '../models/book';
import imageService from './imageService';
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
  /** What its publisher writes of it. */
  description: string | null;
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
        edition: { title: henle.title, composer: henle.composer, publisher: 'G. Henle Verlag', number: henle.number, code, cover: henle.cover, level: henle.level, url: henle.url, description: henle.description },
        works: henle.composer ? await scorePiecesService.suggestFor({ title: henle.title, composer: henle.composer }, new Set()).catch(() => []) : [],
      };
    }
    return { from: 'code', edition: { title: '', composer: null, publisher: number ? 'G. Henle Verlag' : null, number: number ? `HN ${number}` : null, code, cover: null, level: null, url: null, description: null }, works: [] };
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
    edition: { title: chosen.length ? chosen.map(work => work.title).join(' & ') : title, composer, publisher: null, number: null, code: null, cover: null, level: null, url: null, description: null },
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
  description?: string | null;
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
    description: input.description || null,
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

/** The HN number of a score: its ISMN's, else "(HN 383)" in its title, else its Henle page's. */
export const henleNumberOfBook = (book: { isbn13?: string | null; title?: string | null; urls?: Record<string, string> | null }): number | null =>
  henleNumberOf(book.isbn13)
  ?? (Number(String(book.title || '').match(/\bHN\s*(\d{1,4})\b/)?.[1] || book.urls?.henle?.match(/\/HN-(\d+)$/)?.[1] || 0) || null);

/** A shop's listing taken for a description ("Support - Partition Instrumentation - Klavier…"), or a page's menu. */
export const isShopNoise = (text: string | null | undefined): boolean =>
  !String(text || '').trim() || /^\s*(?:Support\s*-\s*Partition|Search\b)/.test(String(text));

/** An image's size in pixels, local or on the web; 0 when unread. */
const pixelsOf = async (source: string | Buffer): Promise<number> => {
  try { const { width = 0, height = 0 } = await sharp(source).metadata(); return width * height; } catch { return 0; }
};
const localCover = (cover: string | null | undefined): string | null => {
  const file = String(cover || '').match(/^\/api\/images\/book\/([^/?]+)$/)?.[1];
  return file ? path.join(imageService.getLocalImagesDir(), 'book', file) : null;
};

export interface HenleRead { url: string | null; level: number | null; cover: boolean; description: boolean }

/**
 * What henle.de says of a score, kept: its page, its level, its words when it
 * has none or only a shop's listing, its cover when larger than the one it has.
 */
const readHenle = async (bookId: number): Promise<HenleRead> => {
  const book = await Book.findById(bookId);
  if (!book || book.bookType !== 'score') throw new ScorePiecesError('No such score', 404);
  const none = { url: book.urls?.henle ?? null, level: book.difficulty ?? null, cover: false, description: false };
  const number = henleNumberOfBook(book);
  if (!number) return none;
  const henle = await henleService.edition(number).catch(() => null);
  if (!henle) return none;
  const description = henle.description && isShopNoise(book.description) ? henle.description : null;
  let coverUrl: string | null = null;
  if (henle.cover) {
    const theirs = await axios.get(henle.cover, { responseType: 'arraybuffer', timeout: 15000 }).then(r => pixelsOf(Buffer.from(r.data))).catch(() => 0);
    const file = localCover(book.cover);
    const ours = file && fs.existsSync(file) ? await pixelsOf(file) : 0;
    if (theirs > ours) coverUrl = henle.cover;
  }
  await bookService.updateBook(book.id, {
    ...book,
    urls: { ...(book.urls || {}), henle: henle.url },
    difficulty: henle.level ?? book.difficulty ?? null,
    ...(description ? { description } : {}),
    ...(coverUrl ? { coverUrl } : {}),
  } as never);
  return { url: henle.url, level: henle.level ?? book.difficulty ?? null, cover: !!coverUrl, description: !!description };
};

/** A Henle score's page and level, read once from henle.de, with its words and cover. */
const henleOf = async (bookId: number): Promise<{ url: string | null; level: number | null; changed?: boolean }> => {
  const book = await Book.findById(bookId);
  if (!book || book.bookType !== 'score') throw new ScorePiecesError('No such score', 404);
  if (book.urls?.henle) return { url: book.urls.henle, level: book.difficulty ?? null };
  const { url, level, cover, description } = await readHenle(bookId);
  return { url, level, changed: cover || description };
};

/** Every Henle score read again from henle.de: what each gained. */
const henleAll = async (): Promise<Array<{ id: number; title: string } & HenleRead>> => {
  const scores = await all<{ id: number; title: string; isbn13: string | null; urls: string | null }>(`SELECT id, title, isbn13, urls FROM books WHERE book_type = 'score'`);
  const result: Array<{ id: number; title: string } & HenleRead> = [];
  for (const score of scores) {
    let urls: Record<string, string> | null = null;
    try { urls = score.urls ? JSON.parse(score.urls) : null; } catch { /* none */ }
    if (!henleNumberOfBook({ ...score, urls })) continue;
    try { result.push({ id: score.id, title: score.title, ...(await readHenle(score.id)) }); } catch (error) {
      logger.warn(`henle.de for score ${score.id}: ${(error as Error).message}`);
    }
  }
  return result;
};

export default { lookup, create, henleOf, henleAll };
