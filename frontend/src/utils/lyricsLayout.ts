/**
 * Lays a song's words out in stanzas of short lines, as a lyrics app does:
 * the stanzas the text marks, else the choruses it repeats set apart, and a
 * long line cut at the comma nearest its middle.
 */

/** A line this long is cut at a comma when one falls in a good place. */
const LONG_LINE = 40;
/** Neither half of a cut line may be shorter. */
const MIN_PART = 12;
/** The fewest lines a passage must have to count as a chorus when it comes back. */
const MIN_CHORUS = 3;

const TIMESTAMP = /^(\[[^\]]*\])+\s?/;

const words = (line: string): string[] =>
  line.toLocaleLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean);

/**
 * Two lines of the same chorus: the same words, or, for a line of four words
 * or more, the same but for one or two ("and you can" against "so you can").
 */
export const sameLine = (a: string, b: string): boolean => {
  const x = words(a);
  const y = words(b);
  if (x.join(' ') === y.join(' ')) return true;
  if (x.length < 4 || x.length !== y.length) return false;
  return x.filter((word, index) => word !== y[index]).length <= 2;
};

/** Splits on blank lines: the stanzas a text marks itself. */
const byBlankLines = (lines: string[]): string[][] => {
  const stanzas: string[][] = [[]];
  for (const line of lines) {
    if (line.trim()) stanzas[stanzas.length - 1].push(line.trim());
    else if (stanzas[stanzas.length - 1].length > 0) stanzas.push([]);
  }
  return stanzas.filter(stanza => stanza.length > 0);
};

/** A line too slight to open or close a chorus: "Amen, amen" leads into it, it is not part of it. */
const slight = (line: string): boolean => words(line).length < 4;

/**
 * For a text that marks no stanza: each passage of three lines or more that
 * comes back, the longest first, becomes a stanza wherever it is sung, and
 * the lines between them the verses. A passage sung again with a word or two
 * changed is the same chorus.
 */
export const byChoruses = (lines: string[]): string[][] => {
  const n = lines.length;
  const taken = new Array<boolean>(n).fill(false);
  const breaks = new Set<number>();
  const free = (from: number, length: number) => taken.slice(from, from + length).every(used => !used);
  const same = (i: number, j: number, length: number) =>
    Array.from({ length }, (_, k) => k).every(k => sameLine(lines[i + k], lines[j + k]));
  const take = (start: number, length: number) => {
    for (let k = start; k < start + length; k++) taken[k] = true;
    breaks.add(start);
    breaks.add(start + length);
  };

  for (let length = Math.floor(n / 2); length >= MIN_CHORUS; length--) {
    for (let i = 0; i + length <= n; i++) {
      // A chorus starts and ends on a line that says something.
      if (slight(lines[i]) || slight(lines[i + length - 1])) continue;
      // Once a chorus is found, its copies further on may vary; they are
      // compared with it even though its lines are taken.
      const others: number[] = [];
      for (let j = i + length; j + length <= n; j++) {
        if (free(j, length) && same(i, j, length) && others.every(o => j >= o + length)) others.push(j);
      }
      if (others.length === 0) continue;
      if (free(i, length)) take(i, length);
      for (const start of others) take(start, length);
    }
  }

  const stanzas: string[][] = [];
  lines.forEach((line, index) => {
    if (index === 0 || breaks.has(index)) stanzas.push([]);
    stanzas[stanzas.length - 1].push(line);
  });
  return stanzas;
};

/**
 * A long line in two after a comma, or a question or an exclamation mark: at
 * the mark nearest the middle that has three words or more on either side,
 * never after a lone word ("oh,") nor before a quotation ("she tells me,
 * "Worship…"" stays whole). The second half starts with a capital, as a
 * line does.
 */
export const cutLine = (line: string): string[] => {
  if (line.length <= LONG_LINE) return [line];
  const marks = [...line.matchAll(/[,?!;] /g)].map(match => match.index!);
  const candidates = marks.filter((at, index) => {
    const rest = line.slice(at + 2);
    const sinceLast = words(line.slice(index > 0 ? marks[index - 1] + 1 : 0, at + 1)).length;
    return words(line.slice(0, at + 1)).length >= 3 && words(rest).length >= 3 && sinceLast >= 2
      && !/^["“«'‘]/.test(rest) && at + 1 >= MIN_PART && rest.length >= MIN_PART;
  });
  if (candidates.length === 0) return [line];
  const middle = line.length / 2;
  const at = candidates.reduce((best, candidate) => (Math.abs(candidate - middle) < Math.abs(best - middle) ? candidate : best));
  const rest = line.slice(at + 2);
  return [line.slice(0, at + 1), ...cutLine(rest.charAt(0).toLocaleUpperCase() + rest.slice(1))];
};

/**
 * The stanzas to show: those the plain text marks with blank lines, else
 * those the timed lines mark with empty ones, else the choruses found.
 */
export const layOutLyrics = (lyrics: { plain: string | null; synced: string | null }): string[][] => {
  const plain = (lyrics.plain || '').split('\n');
  const timed = (lyrics.synced || '').split('\n').filter(line => TIMESTAMP.test(line)).map(line => line.replace(TIMESTAMP, ''));
  const sources = [plain, timed].filter(lines => lines.some(line => line.trim()));

  const marked = sources.map(byBlankLines).find(stanzas => stanzas.length > 1);
  const stanzas = marked ?? (sources[0] ? byChoruses(byBlankLines(sources[0]).flat()) : []);
  return stanzas.map(stanza => stanza.flatMap(cutLine));
};
