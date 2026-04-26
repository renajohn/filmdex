export interface AlbumCompact {
  id: number;
  artist: string | null;
  title: string | null;
  release_year: number | null;
  genre: string | null;
  format: string | null;
  labels: string | null;
  rating: number | null;
  total_duration: number | null;
}

export const ALBUM_COMPACT_COLUMNS: ReadonlyArray<keyof AlbumCompact> = [
  'id',
  'artist',
  'title',
  'release_year',
  'genre',
  'format',
  'labels',
  'rating',
  'total_duration',
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

interface AlbumLike {
  id?: number | null;
  artist?: unknown;
  title?: string | null;
  releaseYear?: number | null;
  genres?: unknown;
  format?: string | null;
  labels?: unknown;
  rating?: number | null;
  totalDuration?: number | null;
}

export const projectAlbum = (a: AlbumLike): AlbumCompact => {
  return {
    id: a.id ?? 0,
    artist: joinList(a.artist),
    title: a.title ?? null,
    release_year: a.releaseYear ?? null,
    genre: joinList(a.genres),
    format: a.format ?? null,
    labels: joinList(a.labels),
    rating: a.rating ?? null,
    total_duration: a.totalDuration ?? null,
  };
};
