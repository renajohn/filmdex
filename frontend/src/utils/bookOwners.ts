import { quote, splitValues, tokenize } from '../components/shared/search/query';

/**
 * BookDex's owner buttons (Alice, Oriane, No owner) and the search's owner pill
 * say the same thing, read from and written to the one search string:
 * `owner:Alice`, `owner:Alice,Oriane` (either's), `owner:none` (no one's).
 * An exclusion (`-owner:Alice`, or `!owner:` as typed) lights no button.
 */

const OWNER = /^([-!]?)owner:(.*)$/is;

interface OwnerWord {
  index: number;
  neg: boolean;
  names: string[];
}

const ownerWords = (q: string): { words: string[]; owners: OwnerWord[] } => {
  const words = tokenize(q).map(t => t.text);
  const owners: OwnerWord[] = [];
  words.forEach((w, index) => {
    const m = w.match(OWNER);
    if (!m) return;
    owners.push({ index, neg: !!m[1], names: m[2] === '' ? [] : splitValues(m[2]).filter(Boolean) });
  });
  return { words, owners };
};

/** The names the buttons show chosen: those of the first owner filter that is not an exclusion. */
export const chosenOwners = (q: string): string[] => ownerWords(q || '').owners.find(o => !o.neg)?.names || [];

export const isOwnerIn = (names: string[], owner: string) => names.some(n => n.toLowerCase() === owner.toLowerCase());

const ownerWord = (names: string[]) => `owner:${names.map(quote).join(',')}`;

/**
 * The search with these owners chosen, in the place of the owner pill (or first
 * when there was none); none chosen takes the pill away. With `replace`, every
 * other owner filter goes too, its exclusions included: a click says whose books.
 */
export const withOwners = (q: string, names: string[], { replace = false } = {}): string => {
  const { words, owners } = ownerWords(q || '');
  const first = owners.find(o => !o.neg);
  const drop = new Set(replace ? owners.map(o => o.index) : first ? [first.index] : []);
  const word = names.length ? ownerWord(names) : '';
  const at = first ? first.index : -1;
  const out: string[] = [];
  words.forEach((w, i) => {
    if (i === at) { if (word) out.push(word); return; }
    if (!drop.has(i)) out.push(w);
  });
  if (at < 0 && word) out.unshift(word);
  return out.join(' ');
};

/**
 * A click on an owner's button: the search shows that owner's books alone, or
 * nothing of owners again when it already did. An Alt-click adds the name to the
 * pill or takes it away from it.
 */
export const clickOwner = (q: string, owner: string, toggle: boolean): string => {
  const chosen = chosenOwners(q);
  const on = isOwnerIn(chosen, owner);
  if (toggle) {
    return withOwners(q, on ? chosen.filter(n => n.toLowerCase() !== owner.toLowerCase()) : [...chosen, owner]);
  }
  return withOwners(q, on && chosen.length === 1 ? [] : [owner], { replace: true });
};
