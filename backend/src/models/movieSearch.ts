import { statusSql, Topic, WarningStatus } from '../warnings/rules';

/**
 * FilmDex's search, read (docs/superpowers/specs/2026-10-22-search-pills-design.md).
 * The search is one string: plain words, and filters `key:value`, which the
 * field of pills writes and the links of the app inject (actor:"Tom Hanks",
 * spiders:no). The same vocabulary everywhere:
 * - `-key:` (or `!key:`) excludes;
 * - `key:a,b` is one or the other, `"…"` keeps spaces, commas and colons in a value;
 * - yes/no, with true/false, with/without, y/n, 1/0 still understood;
 * - numbers: 7, >=7, <7.5, 7-8 (a range), and words for dates.
 * A key not known stays a plain word, as does a value a key cannot take
 * (spiders:maybe), so that nothing is silently dropped; a key without a value
 * yet (`actor:`, `year:>=`) is left out, the field being typed.
 */

type Bool = 'yes' | 'no';

const BOOL_WORDS: Record<string, Bool> = {
  yes: 'yes', true: 'yes', with: 'yes', y: 'yes', '1': 'yes',
  no: 'no', false: 'no', without: 'no', n: 'no', '0': 'no',
};

export const boolOf = (v: string): Bool | null => BOOL_WORDS[v.trim().toLowerCase()] ?? null;

interface NumberSpec {
  op: '=' | '>' | '>=' | '<' | '<=' | 'range';
  a: number;
  b?: number;
}

/** 7, =7, >=7, <7.5, 7-8. */
export const parseNumberSpec = (v: string): NumberSpec | null => {
  const s = v.trim();
  let m = s.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return { op: 'range', a: Math.min(a, b), b: Math.max(a, b) };
  }
  m = s.match(/^(=|>=|<=|>|<)?(\d+(?:\.\d+)?)$/);
  if (m) return { op: (m[1] || '=') as NumberSpec['op'], a: Number(m[2]) };
  return null;
};

type TextColumn = 'actor' | 'director' | 'title' | 'genre' | 'format' | 'original_language' | 'media_type';
type NumberColumn = 'year' | 'imdb_rating' | 'tmdb_rating' | 'rotten_tomato_rating' | 'recommended_age' | 'price' | 'watched';

/** The keys, by kind; `lang` is short for original_language. */
const TEXT_KEYS: TextColumn[] = ['actor', 'director', 'title', 'genre', 'format', 'original_language', 'media_type'];
const COLLECTION_KEYS = ['collection', 'box_set'] as const;
const NUMBER_KEYS: NumberColumn[] = ['year', 'imdb_rating', 'tmdb_rating', 'rotten_tomato_rating', 'recommended_age', 'price', 'watched'];
const ALIASES: Record<string, string> = { lang: 'original_language' };

export const MOVIE_SEARCH_KEYS = [
  ...TEXT_KEYS, ...COLLECTION_KEYS, ...NUMBER_KEYS, 'has_comments', 'spiders', 'snakes', 'last_watched',
] as const;

const known = new Set<string>(MOVIE_SEARCH_KEYS);

/** A date bound: the date as a prefix (2024, 2024-05, 2024-05-17) and how it compares. */
interface DateSpec {
  op: '=' | '>' | '>=' | '<' | '<=';
  date: string;
}

export type MovieSearchFilter =
  | { kind: 'text'; key: TextColumn; negate: boolean; values: string[] }
  | { kind: 'collection'; key: 'collection' | 'box_set'; negate: boolean; values: string[] }
  | { kind: 'number'; key: NumberColumn; negate: boolean; values: NumberSpec[] }
  /** watched:yes, watched:no: watched at all or never. */
  | { kind: 'watchedBool'; negate: boolean; values: Bool[] }
  | { kind: 'comments'; negate: boolean; values: Bool[] }
  | { kind: 'warning'; key: Topic; negate: boolean; values: WarningStatus[] }
  | { kind: 'lastWatched'; negate: boolean; values: DateSpec[] };

export interface ParsedMovieSearch {
  filters: MovieSearchFilter[];
  /** The plain words, each a term all must find (a quoted group is one term). */
  words: string[];
}

/** The words of a query, split on the spaces outside quotes. */
export const tokenize = (q: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const c of q) {
    if (/\s/.test(c) && !inQuotes) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    if (c === '"') inQuotes = !inQuotes;
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
};

/** A filter's values, split on the commas outside quotes, the quotes gone. */
export const splitValues = (s: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const c of s) {
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out.filter(v => v !== '');
};

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (today: Date, days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return localDate(d);
};

/** today, yesterday, week, month, year, or a date (2024, 2024-05, 2024-05-17) with >, >=, <, <=. */
const parseDateSpec = (v: string, today: Date): DateSpec | null => {
  const s = v.trim().toLowerCase();
  switch (s) {
    case 'today': return { op: '=', date: localDate(today) };
    case 'yesterday': return { op: '=', date: daysAgo(today, 1) };
    case 'week': return { op: '>=', date: daysAgo(today, 7) };
    case 'month': return { op: '>=', date: daysAgo(today, 30) };
    case 'year': {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      return { op: '>=', date: localDate(d) };
    }
  }
  const m = s.match(/^(=|>=|<=|>|<)?(\d{4}(?:-\d{2}(?:-\d{2})?)?)$/);
  return m ? { op: (m[1] || '=') as DateSpec['op'], date: m[2] } : null;
};

const WARNING_VALUES: Record<string, WarningStatus> = { unknown: 'unknown', '?': 'unknown' };

/** One filter read, or null when a value is not one its key takes. */
const readFilter = (key: string, negate: boolean, values: string[], today: Date): MovieSearchFilter | null => {
  const all = <T>(read: (v: string) => T | null): T[] | null => {
    const out = values.map(read);
    return out.some(v => v === null) ? null : (out as T[]);
  };
  if ((TEXT_KEYS as string[]).includes(key)) return { kind: 'text', key: key as TextColumn, negate, values };
  if (key === 'collection' || key === 'box_set') return { kind: 'collection', key, negate, values };
  if (key === 'watched') {
    // A number first (watched:1 is once, watched:0 never), then yes/no.
    const nums = all(parseNumberSpec);
    if (nums) return { kind: 'number', key: 'watched', negate, values: nums };
    const bools = all(boolOf);
    return bools ? { kind: 'watchedBool', negate, values: bools } : null;
  }
  if ((NUMBER_KEYS as string[]).includes(key)) {
    const nums = all(parseNumberSpec);
    return nums ? { kind: 'number', key: key as NumberColumn, negate, values: nums } : null;
  }
  if (key === 'has_comments') {
    const bools = all(boolOf);
    return bools ? { kind: 'comments', negate, values: bools } : null;
  }
  if (key === 'spiders' || key === 'snakes') {
    const statuses = all(v => {
      const unknown = WARNING_VALUES[v.trim().toLowerCase()];
      if (unknown) return unknown;
      const b = boolOf(v);
      return b === 'yes' ? 'with' : b === 'no' ? 'without' : null;
    });
    return statuses ? { kind: 'warning', key, negate, values: statuses as WarningStatus[] } : null;
  }
  if (key === 'last_watched') {
    const dates = all(v => parseDateSpec(v, today));
    return dates ? { kind: 'lastWatched', negate, values: dates } : null;
  }
  return null;
};

const FILTER = /^([-!]?)([A-Za-z_]+):(.*)$/s;
/** A value not finished yet: nothing, or an operator alone. */
const UNFINISHED = /^(>=|<=|>|<|=)?$/;

/** The filters and the plain words of a FilmDex search. */
export const parseMovieSearch = (text: string, today: Date = new Date()): ParsedMovieSearch => {
  const filters: MovieSearchFilter[] = [];
  const words: string[] = [];
  for (const token of tokenize(text.trim())) {
    const m = token.match(FILTER);
    const key = m ? (ALIASES[m[2].toLowerCase()] ?? m[2].toLowerCase()) : '';
    if (!m || !known.has(key)) {
      const word = token.replace(/"/g, '').trim();
      if (word) words.push(word);
      continue;
    }
    const raw = m[3];
    if (UNFINISHED.test(raw.replace(/"/g, '').trim())) continue;
    const filter = readFilter(key, !!m[1], splitValues(raw), today);
    if (filter) filters.push(filter);
    else words.push(token.replace(/"/g, ''));
  }
  return { filters, words };
};

const NUMBER_SQL: Record<NumberColumn, string> = {
  year: `CAST(strftime('%Y', m.release_date) AS INTEGER)`,
  imdb_rating: 'm.imdb_rating',
  tmdb_rating: 'm.tmdb_rating',
  rotten_tomato_rating: 'm.rotten_tomato_rating',
  recommended_age: 'm.recommended_age',
  price: 'm.price',
  watched: 'COALESCE(m.watch_count, 0)',
};

const TEXT_SQL: Record<Exclude<TextColumn, 'title'>, string> = {
  actor: 'm.cast',
  director: 'm.director',
  genre: 'm.genre',
  format: 'm.format',
  original_language: 'm.original_language',
  media_type: 'm.media_type',
};

const like = (v: string) => `%${v}%`;

/**
 * The SQL of the filters and the words, to add to a WHERE (each part begins
 * with AND), and its parameters. The values of a filter are one or the other
 * (OR), the filters and the words all (AND); an exclusion is NOT the filter,
 * a movie without the field counting as not matching it (-genre:Horror keeps
 * the movies without a genre).
 */
export const movieSearchSql = ({ filters, words }: ParsedMovieSearch): { sql: string; params: unknown[] } => {
  const params: unknown[] = [];
  const parts: string[] = [];
  const either = (clauses: string[]) => (clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`);

  for (const f of filters) {
    let clause: string;
    switch (f.kind) {
      case 'text':
        clause = either(f.values.map(v => {
          if (f.key === 'title') {
            params.push(like(v), like(v));
            return '(m.title LIKE ? OR m.original_title LIKE ?)';
          }
          params.push(like(v));
          return `${TEXT_SQL[f.key]} LIKE ?`;
        }));
        break;
      case 'collection':
        clause = `EXISTS (
          SELECT 1 FROM movie_collections mc_f
          JOIN collections c_f ON mc_f.collection_id = c_f.id
          WHERE mc_f.movie_id = m.id${f.key === 'box_set' ? ` AND c_f.type = 'box_set'` : ''}
            AND ${either(f.values.map(v => { params.push(like(v)); return 'c_f.name LIKE ?'; }))}
        )`;
        break;
      case 'number': {
        const col = NUMBER_SQL[f.key];
        clause = either(f.values.map(n => {
          if (n.op === 'range') {
            params.push(n.a, n.b);
            return `${col} BETWEEN ? AND ?`;
          }
          params.push(n.a);
          return `${col} ${n.op} ?`;
        }));
        break;
      }
      case 'watchedBool':
        clause = either(f.values.map(b => (b === 'yes' ? 'COALESCE(m.watch_count, 0) > 0' : 'COALESCE(m.watch_count, 0) = 0')));
        break;
      case 'comments':
        clause = either(f.values.map(b => (b === 'yes'
          ? `(m.comments IS NOT NULL AND m.comments != '')`
          : `(m.comments IS NULL OR m.comments = '')`)));
        break;
      case 'warning':
        // The topic comes from a closed list (spiders, snakes), the statuses are bound.
        clause = `${statusSql(f.key)} IN (${f.values.map(s => { params.push(s); return '?'; }).join(', ')})`;
        break;
      case 'lastWatched':
        clause = either(f.values.map(d => {
          params.push(d.date.length, d.date);
          return `substr(m.last_watched, 1, ?) ${d.op} ?`;
        }));
        break;
    }
    parts.push(f.negate ? ` AND NOT COALESCE(${clause}, 0)` : ` AND ${clause}`);
  }

  for (const word of words) {
    parts.push(` AND (
      m.title LIKE ? OR
      m.original_title LIKE ? OR
      m.director LIKE ? OR
      m.comments LIKE ? OR
      EXISTS (
        SELECT 1 FROM movie_collections mc2
        JOIN collections c2 ON mc2.collection_id = c2.id
        WHERE mc2.movie_id = m.id AND c2.name LIKE ?
      )
    )`);
    const term = like(word);
    params.push(term, term, term, term, term);
  }

  return { sql: parts.join(''), params };
};
