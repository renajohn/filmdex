import { plain } from '../services/trackPopularityService';

/**
 * Whether what one types names someone, without their accents or exact
 * spelling: an artist, a director, an actor, as a search's pills find them.
 */

/** One letter apart at most: a letter more, less or other ("edit" for "edith"). */
const nearlyEqual = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** A word typed is a word of the name: the same, its start (or the name's word the start of it), or one letter apart. */
export const wordMatches = (typed: string, word: string): boolean =>
  typed === word
  || (typed.length >= 3 && word.startsWith(typed))
  || (word.length >= 3 && typed.startsWith(word))
  || (typed.length >= 4 && word.length >= 4 && nearlyEqual(typed, word));

/**
 * The surname alone names a person ("jeunet", "piaf", "jarre"); otherwise at
 * least half the words of the name must be typed ("black" does not name The
 * Black Eyed Peas, whose last word is not typed).
 */
export const namesSomeone = (query: string, name: string): boolean => {
  const typed = plain(query).split(' ').filter(Boolean);
  const words = plain(name).split(' ').filter(word => word.length >= 2 && word !== 'the');
  if (!words.length || !typed.length) return false;
  const last = words[words.length - 1];
  if (words.length > 1 && last.length >= 3 && typed.some(t => wordMatches(t, last))) return true;
  const found = words.filter(word => typed.some(t => wordMatches(t, word))).length;
  return found * 2 >= words.length;
};

/** Whether a search names a saga or a series: any word of three letters or more of its name. */
export const namesSomething = (query: string, name: string): boolean => {
  const typed = plain(query).split(' ').filter(t => t.length >= 3);
  const words = plain(name).split(' ').filter(word => word.length >= 3 && word !== 'the' && word !== 'collection');
  return typed.some(t => words.some(word => wordMatches(t, word)));
};
