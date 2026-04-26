export interface AlbumFilterInput {
  query?: string;
  artist?: string;
  genre?: string;
  format?: string;
  year_min?: number;
  year_max?: number;
}

const quoteIfNeeded = (v: string): string => {
  if (/[\s,"]/.test(v)) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
};

const yearRange = (min: number | undefined, max: number | undefined): string | null => {
  const lo = typeof min === 'number' && Number.isFinite(min) ? Math.trunc(min) : undefined;
  const hi = typeof max === 'number' && Number.isFinite(max) ? Math.trunc(max) : undefined;
  if (lo !== undefined && hi !== undefined) return `year:${lo}-${hi}`;
  if (lo !== undefined) return `year:>=${lo}`;
  if (hi !== undefined) return `year:<=${hi}`;
  return null;
};

/**
 * Convert MCP-typed input into the album search query string consumed by Album.search.
 * The album search parser only supports a fixed set of fields (artist, title, genre,
 * label, country, mood, track, year). `format` is not natively supported, so it is
 * applied in-memory by the tool handler.
 */
export const normalizeAlbumFilters = (input: AlbumFilterInput | undefined): string => {
  const parts: string[] = [];
  const i = input ?? {};

  if (i.query && i.query.trim().length > 0) {
    parts.push(i.query.trim());
  }
  if (i.artist && i.artist.trim().length > 0) {
    parts.push(`artist:${quoteIfNeeded(i.artist.trim())}`);
  }
  if (i.genre && i.genre.trim().length > 0) {
    parts.push(`genre:${quoteIfNeeded(i.genre.trim())}`);
  }
  const yr = yearRange(i.year_min, i.year_max);
  if (yr) parts.push(yr);

  return parts.join(' ');
};

export const extractAlbumFormat = (input: AlbumFilterInput | undefined): string | null => {
  const v = input?.format;
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
};
