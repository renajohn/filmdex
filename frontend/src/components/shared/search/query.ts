import type { SearchKey } from './schema';

/**
 * Reading a search string (docs/superpowers/specs/2026-10-22-search-pills-design.md).
 * The search stays one string, for the URL, the localStorage and the parsers of
 * the backend; these functions cut it into words, read each word against a
 * section's keys and write it back as a pill writes it: the key's own name,
 * yes/no, and `-` for an exclusion (the pill shows `!`, the string keeps `-`,
 * which the links and the parsers already know).
 */

/** A word of the query and where it stands in it. */
export interface Token {
  text: string;
  start: number;
  end: number;
}

/** Lower case, without accents: Händel finds handel, Dvořák dvorak. */
export const norm = (s: string): string => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The words of a query, split on the spaces outside quotes, with where each stands. */
export const tokenize = (q: string): Token[] => {
  const out: Token[] = [];
  let start = -1;
  let inQuotes = false;
  for (let i = 0; i <= q.length; i++) {
    const c = q[i];
    if (i === q.length || (/\s/.test(c) && !inQuotes)) {
      if (start >= 0) {
        out.push({ text: q.slice(start, i), start, end: i });
        start = -1;
      }
      continue;
    }
    if (start < 0) start = i;
    if (c === '"') inQuotes = !inQuotes;
  }
  return out;
};

/** A filter's values, split on the commas outside quotes, the quotes gone: `Bach,"Joni Mitchell"`. */
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
  return out;
};

/** A value as the string writes it: between quotes when a space, a comma or a colon would cut it. */
export const quote = (v: string): string => (/[\s,:]/.test(v) ? `"${v}"` : v);

/** yes/no everywhere; the old words stay understood. */
export const BOOL_ALIASES: Record<'yes' | 'no', string[]> = {
  yes: ['yes', 'true', 'with', 'y', '1'],
  no: ['no', 'false', 'without', 'n', '0'],
};

export const boolOf = (v: string): 'yes' | 'no' | null => {
  const n = norm(v);
  if (BOOL_ALIASES.yes.includes(n)) return 'yes';
  if (BOOL_ALIASES.no.includes(n)) return 'no';
  return null;
};

export interface NumberValue {
  op: '=' | '>' | '>=' | '<' | '<=' | 'range';
  a: number;
  b?: number;
}

/** 4, =4, >=4, <3.5, 2-4: a number, a comparison or a range. */
export const parseNumber = (v: string): NumberValue | null => {
  let m = v.trim().match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (m) return { op: 'range', a: Number(m[1]), b: Number(m[2]) };
  m = v.trim().match(/^(=|>=|<=|>|<)?(\d+(?:\.\d+)?)$/);
  if (m) return { op: (m[1] || '=') as NumberValue['op'], a: Number(m[2]) };
  return null;
};

/** How a number reads, in a suggestion: "4 or more", "between 2 and 4". */
export const sayNumber = (n: NumberValue): string => {
  switch (n.op) {
    case 'range': return `Between ${n.a} and ${n.b}`;
    case '>': return `More than ${n.a}`;
    case '>=': return `${n.a} or more`;
    case '<': return `Less than ${n.a}`;
    case '<=': return `${n.a} or less`;
    default: return `Exactly ${n.a}`;
  }
};

export const levenshtein = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
};

// Each list of keys indexed once, by its names and its aliases.
const indexes = new WeakMap<SearchKey[], Map<string, SearchKey>>();
const indexOf = (keys: SearchKey[]): Map<string, SearchKey> => {
  let index = indexes.get(keys);
  if (!index) {
    index = new Map();
    for (const k of keys) {
      index.set(k.key.toLowerCase(), k);
      for (const alias of k.aliases || []) index.set(alias.toLowerCase(), k);
    }
    indexes.set(keys, index);
  }
  return index;
};

/** The key a name stands for, by its name or one of its aliases. */
export const findKey = (name: string, keys: SearchKey[]): SearchKey | undefined => indexOf(keys).get(name.toLowerCase());

/** The key a mistyped name was meant to be, two letters off at most: artst → artist. */
export const nearestKey = (name: string, keys: SearchKey[]): string | null => {
  let best: string | null = null;
  let dist = 3;
  for (const [n, k] of indexOf(keys)) {
    const d = levenshtein(norm(name), n);
    if (d < dist) { dist = d; best = k.key; }
  }
  return best;
};

/** What is wrong with a word, said with `code` between backticks, and the words that would mend it. */
export interface TokenError {
  msg: string;
  fix?: string;
  fixLabel?: string;
}

export interface ParsedToken {
  kind: 'word' | 'filter';
  /** The word as written. */
  text: string;
  /** An exclusion: `!key:` or `-key:`. */
  neg: boolean;
  sign: '' | '!' | '-';
  /** The key as written, before its alias is read. */
  rawKey: string;
  def?: SearchKey;
  /** Its values, the quotes gone. */
  values: string[];
  /** The values as a pill writes them: yes/no for a bool, the listed spelling for an enum. */
  canon?: string[];
  nums?: NumberValue[];
  error?: TokenError;
  /** A key without a value yet: `composer:`. */
  pending?: boolean;
}

const FILTER = /^([-!]?)([A-Za-z_]+):(.*)$/s;

/** One word of the query, read: a plain word, a filter, or a filter with something wrong and a way to mend it. */
export const parseToken = (text: string, keys: SearchKey[]): ParsedToken => {
  const m = text.match(FILTER);
  if (!m) return { kind: 'word', text, neg: false, sign: '', rawKey: '', values: [] };
  const [, sign, rawKey, valueStr] = m;
  const t: ParsedToken = {
    kind: 'filter', text, neg: !!sign, sign: sign as ParsedToken['sign'], rawKey,
    values: valueStr === '' ? [] : splitValues(valueStr),
  };
  const def = findKey(rawKey, keys);
  if (!def) {
    const near = nearestKey(rawKey, keys);
    t.error = near
      ? { msg: `\`${rawKey}\` is not a filter. Did you mean \`${near}\`?`, fix: `${sign ? '-' : ''}${near}:${valueStr}`, fixLabel: `Use ${near}` }
      : { msg: `\`${rawKey}\` is not a filter here.` };
    return t;
  }
  t.def = def;
  t.values = t.values.filter(v => v !== '');
  if (!t.values.length) { t.pending = true; return t; }
  const key = def.key;
  const neg = sign ? '-' : '';
  if (def.type === 'bool') {
    const vs = t.values.map(boolOf);
    if (vs.includes(null)) t.error = { msg: `\`${key}\` takes yes or no.`, fix: `${neg}${key}:yes`, fixLabel: `Use ${key}:yes` };
    else t.canon = vs as string[];
  } else if (def.type === 'enum') {
    const names = (def.values || []).map(v => v.value);
    // An old spelling of yes/no (spiders:without) is the yes/no the enum lists.
    const asListed = (v: string) => names.find(n => norm(n) === norm(v)) || names.find(n => n === boolOf(v));
    const canon = t.values.map(asListed);
    const bad = t.values.find((_, i) => !canon[i]);
    if (bad !== undefined) {
      // A value a letter or two off: offer the one meant.
      let near: string | null = null;
      let dist = 3;
      for (const n of names) { const d = levenshtein(norm(bad), norm(n)); if (d < dist) { dist = d; near = n; } }
      const mended = t.values.map((v, i) => canon[i] || (v === bad && near) || v);
      t.error = {
        msg: `\`${key}\` takes ${names.join(', ')}.`,
        ...(near ? { fix: `${neg}${key}:${mended.map(quote).join(',')}`, fixLabel: `Use ${key}:${near}` } : {}),
      };
    } else {
      t.canon = canon as string[];
    }
  } else if (def.type === 'number') {
    const listed = (def.values || []).map(v => v.value);
    const nums = t.values.map(parseNumber);
    // A word the key lists, in any of its spellings (watched:true is watched:yes).
    const word = (v: string) => listed.find(n => norm(n) === norm(v)) || listed.find(n => n === boolOf(v));
    const bad = t.values.find((v, i) => !nums[i] && !word(v));
    if (bad !== undefined) t.error = { msg: `\`${key}\` takes a number, a range (2-4) or a comparison (>=4).` };
    else {
      t.nums = nums.filter((n): n is NumberValue => !!n);
      t.canon = t.values.map((v, i) => nums[i] ? v : word(v) as string);
    }
  }
  // text, list and date: whatever is typed is a value.
  return t;
};

/** The words a pill writes: the key's own name, yes/no, `-` for an exclusion. A word, or a mistake, as written. */
export const canonical = (t: ParsedToken): string => {
  if (t.kind !== 'filter' || !t.def || t.error || t.pending) return t.text;
  const values = t.canon || t.values;
  return `${t.neg ? '-' : ''}${t.def.key}:${values.map(quote).join(',')}`;
};

/** A whole query as the pills write it. */
export const canonicalQuery = (q: string, keys: SearchKey[]): string =>
  tokenize(q).map(tk => canonical(parseToken(tk.text, keys))).join(' ');

/**
 * How many of the elements, in their order, stand in the first `maxRows` rows,
 * given the top of each (a wrapped flex line: the same top, a row). The field
 * shows these when it is not in use, and "+N" for the others.
 */
export const fitInRows = (tops: number[], maxRows: number, tolerance = 3): number => {
  const rows: number[] = [];
  for (let i = 0; i < tops.length; i++) {
    const top = tops[i];
    if (!rows.some(r => Math.abs(r - top) <= tolerance)) {
      rows.push(top);
      if (rows.length > maxRows) return i;
    }
  }
  return tops.length;
};
