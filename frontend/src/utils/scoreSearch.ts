import { boolOf, norm, parseToken, tokenize } from '../components/shared/search/query';
import { scoresSchema } from '../components/shared/search/schemas/scores';
import type { Score } from '../services/bookSectionsService';

/**
 * What the header's search asks of the scores, read in the browser with the
 * keys of schemas/scores: composer:… (none: the anthologies and methods),
 * publisher:…, pdf, heard (its pieces in the music) and contents (its pieces
 * known) yes or no, and any words of the score. A comma is either value
 * (composer:Bach,Handel), `-` or `!` all but (-composer:Bach, !pdf:yes); the
 * old words (true/false, with/without, y/n, 1/0) read as yes/no. A key with no
 * value yet, or a value it cannot take, asks nothing; a key it does not know is
 * a word.
 */
export const scoreMatcher = (text: string): ((score: Score) => boolean) => {
  const tests: Array<(score: Score) => boolean> = [];
  for (const { text: word } of tokenize(text || '')) {
    const t = parseToken(word, scoresSchema.keys);
    if (t.kind === 'filter' && t.def) {
      if (t.pending || t.error) continue;
      const one = test(t.def.key, t.canon || t.values);
      if (one) tests.push(t.neg ? score => !one(score) : one);
      continue;
    }
    const value = norm(word.replace(/"/g, ''));
    if (value) tests.push(score => everything(score).includes(value));
  }
  return score => tests.every(one => one(score));
};

const everything = (score: Score) =>
  norm(`${score.title} ${score.composer || ''} ${(score.authors || []).join(' ')} ${score.publisher || ''}`);

/** One filter's test: either of its values. */
const test = (key: string, values: string[]): ((score: Score) => boolean) | null => {
  const wanted = values.map(norm);
  const named = (of: (score: Score) => string | null | undefined) => (score: Score) => {
    const name = norm(of(score) || '');
    return wanted.some(v => (v === 'none' ? !name.trim() : name.includes(v)));
  };
  const yes = (has: (score: Score) => boolean) => {
    const bools = values.map(boolOf);
    return (score: Score) => bools.some(b => (b === 'yes') === has(score));
  };
  switch (key) {
    case 'composer': return named(score => score.composer);
    case 'publisher': return named(score => score.publisher);
    case 'pdf': return yes(score => !!score.ebookFile);
    case 'heard': return yes(score => !!score.heardCount);
    case 'contents': return yes(score => !!score.pieceCount);
    default: return null;
  }
};
