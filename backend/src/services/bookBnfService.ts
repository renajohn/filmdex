import Book from '../models/book';
import { getDatabase } from '../database';
import bnfService, { type BnfBook } from './bnfService';
import logger from '../logger';

/**
 * A French book completed from the BnF's catalogue once added, in the
 * background: who drew it, who wrote it, its series and volume, its publisher,
 * year and pages, its summary, its notice. Only what it lacks: what it has,
 * from Google or by hand, stays.
 */

type Gained = Array<'artists' | 'authors' | 'series' | 'publisher' | 'year' | 'pages' | 'summary' | 'notice'>;

/** A book the BnF is asked about: French, or of no language said, and not a score. */
const isFrench = (book: { language?: string | null; bookType?: string | null }) =>
  book.bookType !== 'score' && (!book.language || book.language === 'fr');

const empty = (value: unknown) => value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);

/** What the BnF adds to a book, and the book with it. */
export const completed = (book: Record<string, any>, bnf: BnfBook): { changes: Record<string, unknown>; gained: Gained } => {
  const changes: Record<string, unknown> = {};
  const gained: Gained = [];
  if (empty(book.artists) && bnf.artists.length) { changes.artists = bnf.artists; gained.push('artists'); }
  if (empty(book.authors) && bnf.authors.length) { changes.authors = bnf.authors; gained.push('authors'); }
  if (empty(book.series) && bnf.series) {
    changes.series = bnf.series;
    const number = Number(bnf.seriesNumber?.match(/\d+/)?.[0]);
    if (empty(book.seriesNumber) && number) changes.seriesNumber = number;
    gained.push('series');
  }
  if (empty(book.publisher) && bnf.publisher) { changes.publisher = bnf.publisher; gained.push('publisher'); }
  if (empty(book.publishedYear) && bnf.year) { changes.publishedYear = bnf.year; gained.push('year'); }
  if (empty(book.pageCount) && bnf.pageCount) { changes.pageCount = bnf.pageCount; gained.push('pages'); }
  if (empty(book.description) && bnf.summary) { changes.description = bnf.summary; gained.push('summary'); }
  if (bnf.url && !book.urls?.bnf) { changes.urls = { ...(book.urls || {}), bnf: bnf.url }; gained.push('notice'); }
  return { changes, gained };
};

const COLUMNS: Record<string, string> = {
  artists: 'artists', authors: 'authors', series: 'series', seriesNumber: 'series_number', publisher: 'publisher',
  publishedYear: 'published_year', pageCount: 'page_count', description: 'description', urls: 'urls',
};

/** Only the columns completed: a translation of its words written meanwhile stays. */
const write = (bookId: number, changes: Record<string, unknown>): Promise<void> => {
  const keys = Object.keys(changes).filter(key => COLUMNS[key]);
  const values = keys.map(key => (Array.isArray(changes[key]) || (changes[key] && typeof changes[key] === 'object') ? JSON.stringify(changes[key]) : changes[key]));
  return new Promise((resolve, reject) => getDatabase().run(
    `UPDATE books SET ${keys.map(key => `${COLUMNS[key]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...values, new Date().toISOString(), bookId], (err: Error | null) => (err ? reject(err) : resolve())));
};

/** One book completed from the BnF: what it gained, or null when the BnF does not know it. */
const enrichBook = async (bookId: number): Promise<{ found: boolean; gained: Gained }> => {
  const book = await Book.findById(bookId) as Record<string, any> | null;
  if (!book || !isFrench(book)) return { found: false, gained: [] };
  const bnf = await bnfService.find(book as never);
  if (!bnf) return { found: false, gained: [] };
  const { changes, gained } = completed(book, bnf);
  if (gained.length) {
    await write(bookId, changes);
    logger.info(`[BnF] Book ${bookId}: ${gained.join(', ')}`);
  }
  return { found: true, gained };
};

/** One question at a time: the catalogue is a public service. */
let queue: Promise<unknown> = Promise.resolve();
const later = <T>(task: () => Promise<T>): Promise<T> => {
  const next = queue.catch(() => undefined).then(task);
  queue = next;
  return next;
};

/** After a book is added: completed from the BnF in the background, a failure only logged. */
const afterAdding = (bookId: number): void => {
  later(() => enrichBook(bookId)).catch(error => logger.warn(`[BnF] Book ${bookId} not completed: ${(error as Error).message}`));
};

/** Every French book completed from the BnF: what each gained, those not found, those that failed. */
const enrichAll = async (): Promise<{ completed: Array<{ id: number; title: string; gained: Gained }>; notFound: Array<{ id: number; title: string }>; failed: Array<{ id: number; title: string; error: string }> }> => {
  const rows = await new Promise<Array<{ id: number; title: string; language: string | null; book_type: string | null }>>((resolve, reject) =>
    getDatabase().all('SELECT id, title, language, book_type FROM books', (err: Error | null, found: Array<{ id: number; title: string; language: string | null; book_type: string | null }>) =>
      (err ? reject(err) : resolve(found || []))));
  const result = { completed: [] as Array<{ id: number; title: string; gained: Gained }>, notFound: [] as Array<{ id: number; title: string }>, failed: [] as Array<{ id: number; title: string; error: string }> };
  for (const row of rows.filter(r => isFrench({ language: r.language, bookType: r.book_type }))) {
    try {
      const { found, gained } = await later(() => enrichBook(row.id));
      if (!found) result.notFound.push({ id: row.id, title: row.title });
      else if (gained.length) result.completed.push({ id: row.id, title: row.title, gained });
    } catch (error) {
      result.failed.push({ id: row.id, title: row.title, error: (error as Error).message });
    }
  }
  return result;
};

export default { afterAdding, enrichAll, enrichBook };
