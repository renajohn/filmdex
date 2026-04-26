export interface BookFilterInput {
  query?: string;
  author?: string;
  genre?: string;
  read?: boolean;
}

const quoteIfNeeded = (v: string): string => {
  if (/[\s,"]/.test(v)) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
};

/**
 * Convert MCP-typed input into the book search query string consumed by Book.search.
 * The book search parser supports: title, author, artist, isbn, series, owner,
 * format, language, genre, tag, type, title_status, year, rating, has_ebook.
 *
 * The `read` filter has no native predicate in the parser, so it is applied
 * in-memory by the tool handler against `readDate`.
 */
export const normalizeBookFilters = (input: BookFilterInput | undefined): string => {
  const parts: string[] = [];
  const i = input ?? {};

  if (i.query && i.query.trim().length > 0) {
    parts.push(i.query.trim());
  }
  if (i.author && i.author.trim().length > 0) {
    parts.push(`author:${quoteIfNeeded(i.author.trim())}`);
  }
  if (i.genre && i.genre.trim().length > 0) {
    parts.push(`genre:${quoteIfNeeded(i.genre.trim())}`);
  }

  return parts.join(' ');
};

export const extractReadFilter = (input: BookFilterInput | undefined): boolean | null => {
  return typeof input?.read === 'boolean' ? input.read : null;
};
