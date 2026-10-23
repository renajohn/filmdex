/**
 * The plain words of a search, as every section reads them: each word found
 * somewhere in what is searched, in any order; a quoted group one term; case,
 * accents and the joined letters (œ, æ, ß, ø, ł) set aside, so that "beyonce"
 * finds Beyoncé and "oeuvres" Œuvres. SQLite folds neither (its replace() calls
 * nest too deep for so many letters), so the filters stay in SQL and the words
 * are read here, on the rows the filters kept.
 */

const JOINED: Record<string, string> = {
  œ: 'oe', æ: 'ae', ß: 'ss', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i',
  '’': "'", '‘': "'", 'ʻ': "'", '`': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '‐': '-', '‒': '-', '–': '-', '—': '-',
};
const JOINED_RE = new RegExp(`[${Object.keys(JOINED).join('')}]`, 'g');

/** Lower case, no accents, the joined letters spelt out, the curly quotes and dashes plain. */
export const fold = (text: string | null | undefined): string =>
  (text || '')
    .toLowerCase()
    .replace(JOINED_RE, c => JOINED[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** The words of a search, folded: split on the spaces outside quotes, a quoted group one word. */
export const searchWords = (text: string | null | undefined): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const c of text || '') {
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (/\s/.test(c) && !inQuotes) {
      if (cur.trim()) out.push(fold(cur.trim()));
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(fold(cur.trim()));
  return out;
};

/** Whether every word is found in one of the texts. */
export const findsAll = (words: string[], texts: Array<string | null | undefined>): boolean => {
  if (!words.length) return true;
  const haystack = fold(texts.filter(Boolean).join('\n'));
  return words.every(word => haystack.includes(word));
};

/** An article before a name: "the" in The Beatles, "l'" in L'Arnaqueur, so that "bea" begins it. */
const ARTICLE = /^(?:(?:the|a|an|le|la|les|un|une|der|die|das|el|il|lo)\s+|l')/;
const BOUNDARY = /[^a-z0-9]/;

/**
 * How well one folded word names one folded text: the text itself (120), its
 * start, an article set aside (100), the start of one of its words (70),
 * anywhere in it (30), not at all (0). The ends of a list ('["…"]') do not count.
 */
const wordScore = (word: string, text: string): number => {
  const t = text.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (!t) return 0;
  if (t === word || t.replace(ARTICLE, '') === word) return 120;
  if (t.startsWith(word) || t.replace(ARTICLE, '').startsWith(word)) return 100;
  let at = t.indexOf(word);
  if (at < 0) return 0;
  while (at >= 0) {
    if (at === 0 || BOUNDARY.test(t[at - 1])) return 70;
    at = t.indexOf(word, at + 1);
  }
  return 30;
};

/**
 * How well the words name a thing whose fields weigh differently (a title 1,
 * a description 0.2): for each word its best field, the words added. A movie
 * whose title begins with the letters typed comes before one that only has
 * them in its comments.
 */
export const matchScore = (words: string[], fields: Array<[string | null | undefined, number]>): number => {
  const folded = fields.map(([text, weight]) => [fold(text), weight] as const);
  return Math.round(words.reduce((total, word) =>
    total + Math.max(0, ...folded.map(([text, weight]) => weight * wordScore(word, text))), 0));
};
