/**
 * The words of MusicDex's search that are not words on the album: yes/no
 * filters (cd:, ripped:, rated:, mixtape:, classical:, favourites:), numbers
 * (year:, stars:) and the file: enum. The search pills write `-key:` for an
 * exclusion and yes/no (docs/superpowers/specs/2026-10-22-search-pills-design.md);
 * a link or a bookmark may still carry `!key:`, true/false, with/without, y/n,
 * 1/0 or another name of a key (by:, fav:), all understood here.
 */

/** yes/no, and the old words for them. */
const YES = ['yes', 'true', 'with', 'y', '1'];
const NO = ['no', 'false', 'without', 'n', '0'];

/** yes, no, or null for a word that is neither. */
export const boolOf = (value: string): boolean | null => {
  const v = value.trim().replace(/^"|"$/g, '').toLowerCase();
  if (YES.includes(v)) return true;
  if (NO.includes(v)) return false;
  return null;
};

/** The other names of MusicDex's keys, as the search pills know them (schemas/music.ts). */
const ALIASES: Record<string, string> = { by: 'artist', fav: 'favourites', favorites: 'favourites' };

/**
 * A query with `!key:` written `-key:` and each key by its own name: by:Bowie
 * → artist:Bowie. Only outside quotes: title:"Stand by: me" stays as it is.
 */
export const normaliseAlbumQuery = (query: string): string =>
  query.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : part
    .replace(/(^|\s)!([A-Za-z_]+):/g, '$1-$2:')
    .replace(/(^|\s)(-?)([A-Za-z_]+):/g, (whole, space: string, sign: string, key: string) => {
      const name = ALIASES[key.toLowerCase()];
      return name ? `${space}${sign}${name}:` : whole;
    }))).join('');

/** A filter of the query: its sign, its values (the quotes gone) and the words it was written in. */
export interface FilterWord {
  neg: boolean;
  values: string[];
  text: string;
}

/** A value of a filter: a quoted part or anything but a space, as long as it goes. */
const VALUE = `(?:"[^"]*"|[^\\s"])+`;

/** The values of a filter, cut on the commas outside quotes, the quotes gone. */
export const splitFilterValues = (value: string): string[] => {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const c of value) {
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { if (current.trim()) out.push(current.trim()); current = ''; continue; }
    current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

/** Every `key:` or `-key:` of the query standing as a word of its own, with its values. */
export const findFilters = (query: string, key: string): FilterWord[] => {
  const re = new RegExp(`(?:^|(?<=\\s))([-!]?)${key}:(${VALUE})`, 'gi');
  const found: FilterWord[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    found.push({ neg: m[1] !== '', values: splitFilterValues(m[2]), text: m[0] });
  }
  return found;
};

/** The query without these words. */
export const withoutWords = (query: string, words: string[]): string =>
  words.reduce((q, w) => q.replace(w, ' '), query).replace(/\s+/g, ' ').trim();

/**
 * A yes/no filter taken out of the query: what it lets through, true and/or
 * false, every word of it being read (cd:yes -cd:no, cd:yes,no). `allowed` is
 * null when the key is not there, or when one of its values is no yes or no:
 * then its words stay in the query, as before, and find nothing of themselves.
 */
export const takeBoolFilter = (query: string, key: string): { allowed: boolean[] | null; rest: string } => {
  const words = findFilters(query, key);
  if (!words.length) return { allowed: null, rest: query };
  let allowed = [true, false];
  for (const word of words) {
    const values = word.values.map(boolOf);
    if (!values.length || values.includes(null)) return { allowed: null, rest: query };
    const said = new Set(values as boolean[]);
    allowed = allowed.filter(b => (word.neg ? !said.has(b) : said.has(b)));
  }
  return { allowed, rest: withoutWords(query, words.map(w => w.text)) };
};

/** 4, =4, >=4, <3.5, 2-4 as SQL on a column, its values in `params`; null for something else. */
const numberSql = (column: string, value: string, params: unknown[]): string | null => {
  let m = value.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (m) {
    params.push(Number(m[1]), Number(m[2]));
    return `${column} BETWEEN ? AND ?`;
  }
  m = value.match(/^(=|>=|<=|>|<)?(\d+(?:\.\d+)?)$/);
  if (m) {
    params.push(Number(m[2]));
    return `${column} ${m[1] || '='} ?`;
  }
  return null;
};

/**
 * A number filter taken out of the query as SQL: year:1960-1969,>=2020,
 * -stars:<3. Its values are ORed, its sign excludes, each word of it is ANDed.
 * A word with a value that is no number stays in the query, as before.
 */
export const takeNumberFilter = (query: string, key: string, column: string): { clauses: string[]; params: unknown[]; rest: string } => {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const taken: string[] = [];
  for (const word of findFilters(query, key)) {
    const own: unknown[] = [];
    const parts = word.values.map(v => numberSql(column, v, own));
    if (!parts.length || parts.includes(null)) continue;
    const any = parts.length === 1 ? parts[0] as string : `(${parts.join(' OR ')})`;
    clauses.push(word.neg ? `NOT (${any})` : any);
    params.push(...own);
    taken.push(word.text);
  }
  return { clauses, params, rest: withoutWords(query, taken) };
};
