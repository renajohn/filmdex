export interface BookCompact {
  id: number;
  title: string | null;
  authors: string | null;
  series: string | null;
  series_number: number | null;
  published_year: number | null;
  genre: string | null;
  format: string | null;
  read: boolean;
  rating: number | null;
}

export const BOOK_COMPACT_COLUMNS: ReadonlyArray<keyof BookCompact> = [
  'id',
  'title',
  'authors',
  'series',
  'series_number',
  'published_year',
  'genre',
  'format',
  'read',
  'rating',
];

const joinList = (values: unknown): string | null => {
  if (values == null) return null;
  if (Array.isArray(values)) {
    const filtered = values
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(v => v.length > 0);
    return filtered.length > 0 ? filtered.join(', ') : null;
  }
  if (typeof values === 'string') {
    const s = values.trim();
    return s.length > 0 ? s : null;
  }
  return null;
};

interface BookLike {
  id?: number | null;
  title?: string | null;
  authors?: unknown;
  series?: string | null;
  seriesNumber?: number | null;
  publishedYear?: number | null;
  genres?: unknown;
  format?: string | null;
  readDate?: string | null;
  rating?: number | null;
}

export const projectBook = (b: BookLike): BookCompact => {
  const readDate = b.readDate ?? null;
  return {
    id: b.id ?? 0,
    title: b.title ?? null,
    authors: joinList(b.authors),
    series: b.series ?? null,
    series_number: b.seriesNumber ?? null,
    published_year: b.publishedYear ?? null,
    genre: joinList(b.genres),
    format: b.format ?? null,
    read: readDate !== null && readDate !== '',
    rating: b.rating ?? null,
  };
};
