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
