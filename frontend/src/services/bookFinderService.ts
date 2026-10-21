/**
 * Finding a book as one types (backend bookFinderService): Google Books in a
 * language, the series and authors a search names; adding, several, buying.
 */

export type BookLanguage = 'fr' | 'en' | 'de' | 'any';
export type BookKind = 'all' | 'book' | 'graphic-novel' | 'score';
export type BookFormat = 'physical' | 'ebook' | 'audiobook';

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
  have: { status: 'owned' | 'wish' | 'borrowed'; id: number } | null;
}

export interface FinderSeries { name: string; authors: string[]; covers: string[]; volumes: number }
export interface FinderAuthor { name: string; covers: string[]; books: number }

export interface BookEdition {
  bookType: Exclude<BookKind, 'all'>;
  format: BookFormat;
  language: string;
  owner?: string;
  priceChf?: string;
  purchasedAt?: string;
}

const json = async <T>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error((data as { error?: string }).error || `HTTP error! status: ${response.status}`), { status: response.status });
  return data as T;
};
const post = <T>(url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(response => json<T>(response));
const query = (params: Record<string, string | null | undefined>) =>
  Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');

const bookFinderService = {
  search: (q: string, language: BookLanguage, kind: BookKind, signal?: AbortSignal) =>
    fetch(`/api/books/finder/search?${query({ q, language, kind })}`, { signal })
      .then(response => json<{ books: FinderBook[]; series: FinderSeries[]; authors: FinderAuthor[] }>(response)),

  series: (name: string, author: string | null, language: BookLanguage) =>
    fetch(`/api/books/finder/series?${query({ name, author, language })}`)
      .then(response => json<{ name: string; volumes: FinderBook[]; missingNumbers: number[] }>(response)),

  author: (name: string, language: BookLanguage) =>
    fetch(`/api/books/finder/authors?${query({ name, language })}`).then(response => json<{ name: string; books: FinderBook[] }>(response)),

  add: (book: FinderBook, titleStatus: 'owned' | 'wish', edition: BookEdition) =>
    post<{ id: number; title: string }>('/api/books/finder/books', { book, titleStatus, ...edition }),

  addMany: (books: FinderBook[], titleStatus: 'owned' | 'wish', edition: BookEdition) =>
    post<{ added: Array<{ id: number; title: string }>; errors: Array<{ title: string; error: string }> }>('/api/books/finder/books/batch', {
      books: books.map(book => ({ book, titleStatus, ...edition, priceChf: undefined })), priceChf: edition.priceChf,
    }),

  buy: (bookIds: number[], edition: BookEdition) =>
    post<Array<{ id: number; title: string }>>('/api/books/finder/buy', { bookIds, ...edition }),
};

export default bookFinderService;
