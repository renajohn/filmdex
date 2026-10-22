import { getDatabase } from '../database';
import Book from '../models/book';
import BookReading from '../models/bookReading';
import bookService from './bookService';
import type { BookFormatted } from '../types';
import axios from 'axios';
import { googleBooks } from './bookApiService';
import logger from '../logger';
import { extractSeriesFromTitle, normalizeSeriesName, detectBookType } from './utils/bookUtils';
import { plain } from './trackPopularityService';
import { namesSomeone, namesSomething } from '../utils/searchNames';
import { suggestComposer } from '../utils/scoreComposer';
import bnfService from './bnfService';

/**
 * Finding a book as one finds an album or a movie: as one types, a title, an
 * author or a series, in Google Books (with DexVault's key), in a language. A
 * series the words name gets a pill that opens its volumes, numbered, what one
 * has and what is missing; an author, one that opens their books.
 */

const GOOGLE = 'https://www.googleapis.com/books/v1/volumes';
const KEEP_MS = 60 * 60 * 1000;
const kept = new Map<string, { at: number; value: Promise<unknown> }>();

/** For tests: forget what Google said. */
export const forgetBookFinderAnswers = (): void => kept.clear();

export class BookFinderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'BookFinderError';
  }
}

export type BookLanguage = 'fr' | 'en' | 'de' | 'any';
export type BookKind = 'all' | 'book' | 'graphic-novel' | 'score';

/** What Google files a comic or a score under: "Comics & Graphic Novels", "Music". */
const KIND_SUBJECT: Partial<Record<BookKind, string>> = { 'graphic-novel': 'comics', score: 'music' };

export interface BookHave {
  status: 'owned' | 'wish' | 'borrowed';
  id: number;
}

export interface FinderBook {
  googleId: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  year: string | null;
  publisher: string | null;
  language: string | null;
  isbn13: string | null;
  isbn10: string | null;
  cover: string | null;
  pageCount: number | null;
  series: string | null;
  seriesNumber: number | null;
  bookType: 'book' | 'graphic-novel' | 'score';
  description: string | null;
  categories: string[];
  have: BookHave | null;
}

export interface FinderSeries {
  name: string;
  authors: string[];
  covers: string[];
  volumes: number;
}

export interface FinderAuthor {
  name: string;
  covers: string[];
  books: number;
}

interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string; subtitle?: string; authors?: string[]; publisher?: string; publishedDate?: string; description?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>; pageCount?: number; categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }; language?: string;
    seriesInfo?: { bookDisplayNumber?: string };
  };
}

const askGoogle = (params: Record<string, string | number>): Promise<GoogleVolume[]> => {
  const key = JSON.stringify(params);
  const known = kept.get(key);
  if (known && Date.now() - known.at < KEEP_MS) return known.value as Promise<GoogleVolume[]>;
  const value = (async () => {
    // Google answers 503 now and then, the same question a moment later answered.
    for (let attempt = 0; ; attempt++) {
      try {
        const { data } = await googleBooks.get(GOOGLE, { params: { printType: 'books', ...params }, timeout: 10000 });
        return (data?.items || []) as GoogleVolume[];
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 503 && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt)); continue; }
        if (status === 429) throw new BookFinderError('Google Books says no more for today: its quota is spent', 503);
        throw error;
      }
    }
  })();
  kept.set(key, { at: Date.now(), value });
  value.catch(() => kept.delete(key));
  return value;
};

/* ---------- Open Library, when Google does not answer ---------- */

const OL_LANGUAGE: Record<string, string> = { fr: 'fre', en: 'eng', de: 'ger' };
const FROM_OL_LANGUAGE: Record<string, string> = { fre: 'fr', eng: 'en', ger: 'de' };

interface OpenLibraryDoc {
  key: string; title?: string; subtitle?: string; author_name?: string[]; first_publish_year?: number; isbn?: string[];
  cover_i?: number; language?: string[]; publisher?: string[]; number_of_pages_median?: number;
}

/** The same question asked of Open Library, its works shaped as Google's volumes: poorer in French comics, but there. */
const askOpenLibrary = async (params: Record<string, string | number>): Promise<GoogleVolume[]> => {
  const q = String(params.q || '');
  const author = q.match(/^inauthor:"(.*)"$/)?.[1];
  const language = OL_LANGUAGE[String(params.langRestrict || '')];
  const { data } = await axios.get('https://openlibrary.org/search.json', {
    params: {
      ...(author ? { author } : { q }),
      ...(language ? { language } : {}),
      limit: params.maxResults || 30,
      offset: params.startIndex || 0,
      fields: 'key,title,subtitle,author_name,first_publish_year,isbn,cover_i,language,publisher,number_of_pages_median',
    },
    timeout: 10000,
  });
  return ((data?.docs || []) as OpenLibraryDoc[]).map(doc => {
    const isbns = doc.isbn || [];
    const isbn13 = isbns.find(isbn => /^97[89]\d{10}$/.test(isbn));
    const isbn10 = isbns.find(isbn => /^\d{9}[\dX]$/i.test(isbn));
    const lang = (doc.language || []).map(code => FROM_OL_LANGUAGE[code]).find(Boolean);
    return {
      id: `ol:${doc.key}`,
      volumeInfo: {
        title: doc.title,
        subtitle: doc.subtitle,
        authors: doc.author_name,
        publisher: doc.publisher?.[0],
        publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        industryIdentifiers: [...(isbn13 ? [{ type: 'ISBN_13', identifier: isbn13 }] : []), ...(isbn10 ? [{ type: 'ISBN_10', identifier: isbn10 }] : [])],
        pageCount: doc.number_of_pages_median,
        imageLinks: doc.cover_i ? { thumbnail: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` } : undefined,
        language: lang,
      },
    };
  });
};

/** An ISBN alone, as typed or as a barcode reads it: 978-2-264-03937-8, 9782264039378, 2264039377. */
export const isbnIn = (query: string): string | null => {
  const digits = query.replace(/[\s-]/g, '');
  return /^(?:97[89]\d{10}|\d{9}[\dX])$/i.test(digits) ? digits.toUpperCase() : null;
};

/**
 * The edition of an ISBN: Google's, else Open Library's, else the BnF's notice
 * (a French book the others do not know, without a cover).
 */
const byIsbn = async (isbn: string): Promise<Array<Omit<FinderBook, 'have'>>> => {
  const same = (book: Omit<FinderBook, 'have'>) => book.isbn13 === isbn || book.isbn10 === isbn;
  const asked = async (ask: () => Promise<GoogleVolume[]>) => {
    try { return (await ask()).map(toBook).filter((book): book is Omit<FinderBook, 'have'> => Boolean(book)); } catch { return []; }
  };
  const fromGoogle = await asked(() => google({ q: `isbn:${isbn}`, maxResults: 5 }));
  if (fromGoogle.some(same)) return fromGoogle.filter(same).slice(0, 1);
  const edition = await openLibraryEdition(isbn).catch(() => null);
  if (edition) return [edition];
  const notice = await bnfService.byIsbn(isbn).catch(() => null);
  if (!notice) return fromGoogle.slice(0, 1);
  const seriesNumber = Number(notice.seriesNumber?.match(/\d+/)?.[0]) || null;
  return [{
    googleId: `bnf:${isbn}`, title: notice.title, subtitle: notice.subtitle, authors: notice.authors, year: notice.year ? String(notice.year) : null,
    publisher: notice.publisher, language: 'fr', isbn13: isbn.length === 13 ? isbn : null, isbn10: isbn.length === 10 ? isbn : null, cover: null,
    pageCount: notice.pageCount, series: notice.series, seriesNumber, bookType: notice.drawn ? 'graphic-novel' : 'book',
    description: notice.summary, categories: [],
  }];
};

/**
 * An edition of Open Library by its ISBN: its own title, publisher, pages,
 * language and cover, where its search answers with the work and all its ISBNs.
 */
const openLibraryEdition = async (isbn: string): Promise<Omit<FinderBook, 'have'> | null> => {
  const { data } = await axios.get(`https://openlibrary.org/isbn/${isbn}.json`, { timeout: 10000 });
  if (!data?.title) return null;
  const authors = (await Promise.all(((data.authors || []) as Array<{ key: string }>).slice(0, 3).map(author =>
    axios.get(`https://openlibrary.org${author.key}.json`, { timeout: 10000 }).then(r => String(r.data?.name || '')).catch(() => '')))).filter(Boolean);
  const language = ((data.languages || []) as Array<{ key: string }>).map(l => FROM_OL_LANGUAGE[l.key.split('/').pop() || '']).find(Boolean) || null;
  const title = String(data.title);
  const named = extractSeriesFromTitle(title);
  const series = named?.series ?? null;
  const seriesNumber = named?.seriesNumber ?? null;
  return {
    googleId: `ol:${isbn}`, title, subtitle: data.subtitle || null, authors, year: String(data.publish_date || '').match(/\d{4}/)?.[0] || null,
    publisher: data.publishers?.[0] || null, language, isbn13: isbn.length === 13 ? isbn : null, isbn10: isbn.length === 10 ? isbn : null,
    cover: data.covers?.[0] ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg` : null, pageCount: data.number_of_pages || null,
    series, seriesNumber, bookType: detectBookType(isbn, []) as FinderBook['bookType'], description: null, categories: [],
  };
};

/** Google Books first; Open Library when Google fails (it answers "backendFailed" for hours some days). */
const google = async (params: Record<string, string | number>): Promise<GoogleVolume[]> => {
  try {
    return await askGoogle(params);
  } catch (error) {
    logger.warn(`Book finder: Google Books failed (${(error as Error).message}), asking Open Library`);
    return askOpenLibrary(params);
  }
};

const languageParams = (language: BookLanguage): Record<string, string> => (language === 'any' ? {} : { langRestrict: language });

/** Google's langRestrict lets other languages through: a book whose language is known and another is left out. */
const inLanguage = (language: BookLanguage) => (book: { language: string | null }) => language === 'any' || !book.language || book.language === language;

const https = (url: string | undefined | null) => (url ? url.replace(/^http:\/\//, 'https://').replace('&edge=curl', '') : null);

/** A Google volume as the finder shows it: its series and number read off its title when Google has none. */
const toBook = (volume: GoogleVolume): Omit<FinderBook, 'have'> | null => {
  const info = volume.volumeInfo;
  if (!info?.title) return null;
  const isbn = (type: string) => info.industryIdentifiers?.find(id => id.type === type)?.identifier ?? null;
  const extracted = extractSeriesFromTitle(info.title);
  const number = extracted?.seriesNumber ?? (info.seriesInfo?.bookDisplayNumber ? parseInt(info.seriesInfo.bookDisplayNumber, 10) : null);
  const isbn13 = isbn('ISBN_13');
  const categories = info.categories || [];
  return {
    googleId: volume.id,
    title: info.title,
    subtitle: info.subtitle || null,
    authors: info.authors || [],
    year: info.publishedDate ? info.publishedDate.slice(0, 4) : null,
    publisher: info.publisher || null,
    language: info.language || null,
    isbn13,
    isbn10: isbn('ISBN_10'),
    cover: https(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
    pageCount: info.pageCount || null,
    series: extracted?.series || null,
    seriesNumber: Number.isFinite(number) ? number : null,
    bookType: detectBookType(isbn13, [...categories, ...(/bande dessin|graphic novel|comics|manga/i.test(`${info.title} ${categories.join(' ')}`) ? ['Comics & Graphic Novels'] : [])]) as FinderBook['bookType'],
    description: info.description || null,
    categories,
  };
};

/* ---------- What DexVault already has ---------- */

interface HaveIndex { byIsbn: Map<string, BookHave>; bySeries: Map<string, BookHave>; byTitle: Map<string, BookHave> }

const seriesKey = (series: string, number: number) => `${normalizeSeriesName(series)}#${number}`;
const titleKey = (title: string, author: string | undefined) => `${plain(title)}|${plain(author || '')}`;

const haveIndex = (): Promise<HaveIndex> => new Promise((resolve, reject) => {
  getDatabase().all(
    `SELECT id, title, authors, isbn, isbn13, series, series_number, title_status FROM books WHERE title_status IN ('owned', 'wish', 'borrowed')`,
    (err: Error | null, rows: Array<{ id: number; title: string; authors: string | null; isbn: string | null; isbn13: string | null; series: string | null; series_number: number | null; title_status: string }>) => {
      if (err) { reject(err); return; }
      const index: HaveIndex = { byIsbn: new Map(), bySeries: new Map(), byTitle: new Map() };
      for (const row of rows) {
        const have: BookHave = { status: row.title_status as BookHave['status'], id: row.id };
        // What one owns says more than what one wishes.
        const put = (map: Map<string, BookHave>, key: string) => { if (!map.has(key) || have.status === 'owned') map.set(key, have); };
        for (const isbn of [row.isbn, row.isbn13]) if (isbn) put(index.byIsbn, isbn.replace(/[^0-9X]/gi, ''));
        if (row.series && row.series_number) put(index.bySeries, seriesKey(row.series, row.series_number));
        let authors: string[] = [];
        try { authors = JSON.parse(row.authors || '[]'); } catch { authors = row.authors ? [row.authors] : []; }
        put(index.byTitle, titleKey(row.title, authors[0]));
      }
      resolve(index);
    });
});

const withHave = async (books: Array<Omit<FinderBook, 'have'>>): Promise<FinderBook[]> => {
  const index = await haveIndex();
  return books.map(book => ({
    ...book,
    have: (book.isbn13 && index.byIsbn.get(book.isbn13)) || (book.isbn10 && index.byIsbn.get(book.isbn10))
      || (book.series && book.seriesNumber ? index.bySeries.get(seriesKey(book.series, book.seriesNumber)) : undefined)
      || index.byTitle.get(titleKey(book.title, book.authors[0])) || null,
  }));
};

/** One book per ISBN, and one per series number: the edition in the language asked, with a cover, the oldest. */
const dedupe = (books: Array<Omit<FinderBook, 'have'>>) => {
  const seen = new Set<string>();
  return books.filter(book => {
    const key = book.isbn13 || book.isbn10 || book.googleId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * A series is of one kind: Google files Sorceline's third volume as a novel and
 * its sixth as a comic. One volume a comic (or a score), the whole series is.
 */
const oneKindPerSeries = <T extends { series: string | null; bookType: FinderBook['bookType'] }>(books: T[]): T[] => {
  const kind = new Map<string, FinderBook['bookType']>();
  for (const book of books) {
    if (!book.series || book.bookType === 'book') continue;
    kind.set(normalizeSeriesName(book.series), book.bookType);
  }
  return books.map(book => (book.series && kind.has(normalizeSeriesName(book.series)) ? { ...book, bookType: kind.get(normalizeSeriesName(book.series))! } : book));
};

/** The books of the library in a series, shaped as the finder's: they fill in what Google does not know. */
const librarySeries = (wanted: string): Promise<Array<Omit<FinderBook, 'have'>>> => new Promise((resolve, reject) => {
  getDatabase().all(`SELECT * FROM books WHERE series IS NOT NULL AND series_number IS NOT NULL AND title_status IN ('owned', 'wish', 'borrowed')`,
    (err: Error | null, rows: Array<Record<string, unknown>>) => {
      if (err) { reject(err); return; }
      resolve(rows.filter(row => normalizeSeriesName(String(row.series)) === wanted).map(row => {
        const book = Book.formatRow(row as never)!;
        return {
          googleId: `library:${book.id}`, title: book.title, subtitle: book.subtitle || null, authors: book.authors || [],
          year: book.publishedYear ? String(book.publishedYear) : null, publisher: book.publisher || null, language: book.language || null,
          isbn13: book.isbn13 || null, isbn10: book.isbn || null, cover: book.cover || null, pageCount: book.pageCount || null,
          series: book.series || null, seriesNumber: book.seriesNumber || null, bookType: (book.bookType || 'book') as FinderBook['bookType'],
          description: book.description || null, categories: [],
        };
      }));
    });
});

const bySeriesNumber = <T extends { seriesNumber: number | null; year: string | null }>(a: T, b: T) =>
  (a.seriesNumber ?? 9999) - (b.seriesNumber ?? 9999) || (a.year || '9999').localeCompare(b.year || '9999');

/* ---------- Adding, buying ---------- */

export interface AddBookInput {
  book: Partial<FinderBook> & { title: string };
  titleStatus?: string;
  format?: string;
  language?: string | null;
  bookType?: string;
  owner?: string | null;
  priceChf?: number | string | null;
  purchasedAt?: string | null;
  /** A score's composer; suggested from its title when not given. */
  composer?: string | null;
  /** When it was read: a book added from the reading journal. */
  readDate?: string | null;
  /** Added from the reading journal: a reading, of readDate or of none when it is empty. */
  read?: boolean;
}

const FORMATS = ['physical', 'ebook', 'audiobook'];
const KINDS = ['book', 'graphic-novel', 'score'];

const priceOf = (price: number | string | null | undefined): number | null => {
  const value = typeof price === 'string' ? parseFloat(price.replace(',', '.')) : price;
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

/** A Google cover larger than its thumbnail, the thumbnail if the larger one is not there. */
const coversOf = (cover: string | null | undefined) => (!cover ? [] : [
  ...(/books\.google/.test(cover) ? [{ url: cover.replace(/zoom=\d/, 'zoom=0'), source: 'Google Books', type: 'front', priority: 20 }] : []),
  { url: cover, source: /books\.google/.test(cover) ? 'Google Books' : 'Finder', type: 'front', priority: 10 },
]);

const addFound = async (input: AddBookInput, priceChf: number | null): Promise<BookFormatted> => {
  const book = input.book;
  if (!book?.title?.trim()) throw new BookFinderError('A book needs a title', 400);
  // Borrowed: of the library for a while, whose it is in its owner.
  const titleStatus = input.titleStatus === 'owned' || input.titleStatus === 'borrowed' ? input.titleStatus : 'wish';
  const format = FORMATS.includes(String(input.format)) ? String(input.format) : 'physical';
  const bookType = KINDS.includes(String(input.bookType)) ? String(input.bookType) : book.bookType;

  // One already there: a wish (or a book borrowed) bought becomes the book of the library; the same twice is refused.
  const [have] = await withHave([{ googleId: book.googleId || '', title: book.title, subtitle: null, authors: book.authors || [], year: null, publisher: null,
    language: null, isbn13: book.isbn13 || null, isbn10: book.isbn10 || null, cover: null, pageCount: null, series: book.series || null,
    seriesNumber: book.seriesNumber || null, bookType: 'book', description: null, categories: [] }]);
  if (have.have) {
    if ((have.have.status === 'wish' || have.have.status === 'borrowed') && titleStatus === 'owned') {
      return (await buyBooks([have.have.id], { priceChf, purchasedAt: input.purchasedAt, format }))[0];
    }
    if ((input.readDate || input.read) && (have.have.status === 'owned' || have.have.status === 'borrowed')) {
      // A book of the library read (again): a reading of its date, or of none, not a second copy nor the first reading lost.
      const known = await BookReading.list(have.have.id);
      const when = BookReading.day(input.readDate);
      if (!known.some(r => r.readDate === when)) await BookReading.add(have.have.id, when, true);
      return (await Book.findById(have.have.id))!;
    }
    if (have.have.status === 'wish' && titleStatus === 'borrowed') {
      // A wish borrowed rather than bought: the same book, of the library for a while.
      const wished = (await Book.findById(have.have.id))!;
      await Book.update(wished.id, { ...wished, titleStatus: 'borrowed', owner: input.owner || wished.owner, priceChf: null, purchasedAt: null } as never);
      return (await Book.findById(wished.id))!;
    }
    if (have.have.status === titleStatus || have.have.status === 'owned') {
      throw new BookFinderError(have.have.status === 'owned' ? 'This book is already in the library'
        : have.have.status === 'borrowed' ? 'This book is already in the library, borrowed' : 'This book is already on the wish list', 409);
    }
  }

  const added = await bookService.addBook({
    title: book.title,
    subtitle: book.subtitle || null,
    authors: book.authors || [],
    publisher: book.publisher || null,
    publishedYear: book.year ? parseInt(book.year, 10) : null,
    language: input.language || book.language || null,
    isbn: book.isbn10 || null,
    isbn13: book.isbn13 || null,
    series: book.series || null,
    seriesNumber: book.seriesNumber || null,
    pageCount: book.pageCount || null,
    description: book.description || null,
    genres: book.categories || [],
    availableCovers: coversOf(book.cover),
    format,
    bookType,
    owner: input.owner || null,
    titleStatus,
    composer: bookType === 'score' ? (input.composer?.trim() || suggestComposer(book.title, book.authors || [])) : null,
    readDate: input.readDate || null,
    priceChf: titleStatus === 'owned' ? priceChf : null,
    purchasedAt: titleStatus === 'owned' ? input.purchasedAt || new Date().toISOString().slice(0, 10) : null,
  } as never);
  // Read, one does not know when: a reading of no date, for the journal to hold it.
  if (input.read && !BookReading.day(input.readDate) && added?.id) await BookReading.add(added.id, null, true);
  return added;
};


  /** Wished books bought: of the library, the price shared out, the date it was bought. */
const buyBooks = async (ids: number[], purchase: { priceChf?: number | string | null; purchasedAt?: string | null; format?: string | null; language?: string | null; owner?: string | null; bookType?: string | null }): Promise<BookFormatted[]> => {
    const books = ids.map(Number).filter(id => Number.isInteger(id) && id > 0);
    if (!books.length) throw new BookFinderError('Which books were bought?', 400);
    const total = priceOf(purchase.priceChf);
    const each = total !== null ? Math.round((total / books.length) * 100) / 100 : null;
    const bought: BookFormatted[] = [];
    for (const id of books) {
      const book = await Book.findById(id);
      if (!book) throw new BookFinderError(`No book ${id}`, 404);
      await Book.update(id, {
        ...book,
        titleStatus: 'owned',
        format: FORMATS.includes(String(purchase.format)) ? String(purchase.format) : book.format,
        language: purchase.language || book.language,
        owner: purchase.owner !== undefined ? purchase.owner : book.owner,
        bookType: KINDS.includes(String(purchase.bookType)) ? String(purchase.bookType) : book.bookType,
        priceChf: each,
        purchasedAt: purchase.purchasedAt || new Date().toISOString().slice(0, 10),
      } as never);
      bought.push((await Book.findById(id))!);
    }
    return bought;
  };

const bookFinderService = {
  /** The books a search finds, and the series and authors it names. */
  search: async (query: string, language: BookLanguage = 'fr', kind: BookKind = 'all'): Promise<{ books: FinderBook[]; series: FinderSeries[]; authors: FinderAuthor[] }> => {
    const q = query.trim();
    if (q.length < 2) return { books: [], series: [], authors: [] };
    // An ISBN, typed or read off a back's barcode: that edition, whatever its language.
    const isbn = isbnIn(q);
    if (isbn) return { books: await withHave(await byIsbn(isbn)), series: [], authors: [] };
    // A common word ("Elle") drowns a comic among novels: asked for a comic, Google is asked for comics too, those first.
    const subject = KIND_SUBJECT[kind];
    const [narrowed, wide] = await Promise.all([
      subject ? google({ q: `${q} subject:${subject}`, maxResults: 30, ...languageParams(language) }).catch(() => []) : Promise.resolve([] as GoogleVolume[]),
      google({ q, maxResults: 30, ...languageParams(language) }),
    ]);
    const found = oneKindPerSeries(dedupe([...narrowed, ...wide].map(toBook).filter((book): book is Omit<FinderBook, 'have'> => Boolean(book)))
      .filter(inLanguage(language)));
    const books = await withHave(found);

    const seriesFound = new Map<string, FinderSeries & { numbers: Set<number> }>();
    for (const book of found) {
      if (!book.series || !book.seriesNumber) continue;
      const key = normalizeSeriesName(book.series);
      const series = seriesFound.get(key) ?? { name: book.series, authors: book.authors.slice(0, 2), covers: [], volumes: 0, numbers: new Set<number>() };
      series.numbers.add(book.seriesNumber);
      if (book.cover && series.covers.length < 3) series.covers.push(book.cover);
      seriesFound.set(key, series);
    }
    const series = [...seriesFound.values()]
      // A series is two volumes found at least: one alone is often a title read wrong ("Sorceline Journal").
      .filter(s => s.numbers.size >= 2 && namesSomething(q, s.name))
      .map(({ numbers, ...s }) => ({ ...s, volumes: numbers.size }))
      .sort((a, b) => b.volumes - a.volumes)
      .slice(0, 3);

    const authorsFound = new Map<string, FinderAuthor>();
    for (const book of found) {
      for (const name of book.authors.slice(0, 2)) {
        if (!namesSomeone(q, name)) continue;
        const author = authorsFound.get(name) ?? { name, covers: [], books: 0 };
        author.books++;
        if (book.cover && author.covers.length < 3) author.covers.push(book.cover);
        authorsFound.set(name, author);
      }
    }
    // Two books at least: Google's authors are at times a publisher's words ("Sorceline édition").
    const authors = [...authorsFound.values()].filter(a => a.books >= 2).sort((a, b) => b.books - a.books).slice(0, 3);

    return { books, series, authors };
  },

  /**
   * The volumes of a series, in their order: one edition for each number, in
   * the language asked, and the numbers no edition was found for.
   */
  series: async (name: string, author: string | null, language: BookLanguage = 'fr'): Promise<{ name: string; volumes: FinderBook[]; missingNumbers: number[] }> => {
    const wanted = normalizeSeriesName(name);
    if (!wanted) throw new BookFinderError('A series needs a name', 400);
    const q = author ? `${name} ${author}` : name;
    const pages = await Promise.all([0, 40].map(startIndex => google({ q, maxResults: 40, startIndex, ...languageParams(language) }).catch(() => [])));
    const all = dedupe(pages.flat().map(toBook).filter((book): book is Omit<FinderBook, 'have'> => Boolean(book)))
      .filter(inLanguage(language))
      .filter(book => book.series && book.seriesNumber && normalizeSeriesName(book.series) === wanted);
    // One edition per number: the first published one with a cover (a re-edition repeats it).
    const byNumber = new Map<number, Omit<FinderBook, 'have'>>();
    for (const book of all.sort((a, b) => Number(Boolean(b.cover)) - Number(Boolean(a.cover)) || (a.year || '9999').localeCompare(b.year || '9999'))) {
      if (!byNumber.has(book.seriesNumber!)) byNumber.set(book.seriesNumber!, book);
    }
    // What Google does not know of the series but the library has (Sorceline 1 and 2) stands in its place.
    const mine = await librarySeries(wanted);
    for (const book of mine) {
      if (book.seriesNumber && !byNumber.has(book.seriesNumber)) byNumber.set(book.seriesNumber, book);
    }
    const volumes = oneKindPerSeries(await withHave([...byNumber.values()])).sort(bySeriesNumber);
    const highest = Math.max(0, ...volumes.map(v => v.seriesNumber!));
    const missingNumbers = Array.from({ length: highest }, (_, i) => i + 1).filter(n => !byNumber.has(n));
    return { name: volumes[0]?.series || name, volumes, missingNumbers };
  },

  /** An author's books: their series volume by volume, then the others, the oldest first. */
  author: async (name: string, language: BookLanguage = 'fr'): Promise<{ name: string; books: FinderBook[] }> => {
    if (!name.trim()) throw new BookFinderError('An author needs a name', 400);
    const pages = await Promise.all([0, 40].map(startIndex => google({ q: `inauthor:"${name.replace(/"/g, '')}"`, maxResults: 40, startIndex, ...languageParams(language) }).catch(() => [])));
    const found = dedupe(pages.flat().map(toBook).filter((book): book is Omit<FinderBook, 'have'> => Boolean(book)))
      .filter(inLanguage(language))
      .filter(book => book.authors.some(author => namesSomeone(name, author)));
    const books = oneKindPerSeries(await withHave(found));
    return {
      name,
      books: books.sort((a, b) => (a.series || '~').localeCompare(b.series || '~') || bySeriesNumber(a, b)),
    };
  },
  /** A book found, wished or of the library. */
  add: (input: AddBookInput) => addFound(input, priceOf(input.priceChf)),

  /** Several volumes at once (a series' missing ones), the price shared out among them. */
  addMany: async (inputs: AddBookInput[], totalPrice?: number | string | null): Promise<{ added: BookFormatted[]; errors: Array<{ title: string; error: string }> }> => {
    if (!inputs?.length) throw new BookFinderError('Which books?', 400);
    const total = priceOf(totalPrice);
    const each = total !== null ? Math.round((total / inputs.length) * 100) / 100 : null;
    const added: BookFormatted[] = [];
    const errors: Array<{ title: string; error: string }> = [];
    for (const input of inputs) {
      try { added.push(await addFound(input, each)); } catch (error) { errors.push({ title: input.book?.title || '?', error: (error as Error).message }); }
    }
    return { added, errors };
  },

  buy: buyBooks,
};

export default bookFinderService;
