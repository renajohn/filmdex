import { describe, expect, it } from 'vitest';
import type { Score } from '../services/bookSectionsService';
import { scoreMatcher } from './scoreSearch';

const score = (id: number, title: string, fields: Partial<Score> = {}): Score => ({
  id, title, authors: [], publisher: null, cover: null, composer: null, composerSuggestion: null, ebookFile: null, isbn13: null, urls: {}, titleStatus: 'owned', ...fields,
} as Score);

const scores = [
  score(1, 'Préludes', { composer: 'Claude Debussy', publisher: 'G. Henle Verlag', ebookFile: 'a.pdf', pieceCount: 12, heardCount: 3 }),
  score(2, 'Suites françaises', { composer: 'Johann Sebastian Bach', publisher: 'Bärenreiter', pieceCount: 6 }),
  score(3, 'Improve your sight-reading !', { publisher: 'Faber' }),
];
const ids = (q: string) => scores.filter(scoreMatcher(q)).map(s => s.id).join('');

describe('scoreMatcher', () => {
  it('lit les mots, sans accents, et les clés', () => {
    expect(ids('')).toBe('123');
    expect(ids('francaises')).toBe('2');
    expect(ids('"sight-reading !"')).toBe('3');
    expect(ids('composer:"Johann Sebastian Bach"')).toBe('2');
    expect(ids('publisher:barenreiter')).toBe('2');
    expect(ids('composer:none')).toBe('3');
  });

  it('prend yes/no et les anciens mots', () => {
    expect(ids('pdf:yes')).toBe('1');
    expect(ids('pdf:no')).toBe('23');
    expect(ids('pdf:true')).toBe('1');
    expect(ids('pdf:false')).toBe('23');
    expect(ids('heard:with')).toBe('1');
    expect(ids('contents:0')).toBe('3');
    expect(ids('heard:no contents:yes')).toBe('2');
  });

  it('exclut avec - ou !, et prend une valeur ou une autre avec la virgule', () => {
    expect(ids('-composer:debussy')).toBe('23');
    expect(ids('!composer:none')).toBe('12');
    expect(ids('-pdf:yes')).toBe('23');
    expect(ids('composer:bach,debussy')).toBe('12');
    expect(ids('-composer:bach,none')).toBe('1');
    expect(ids('composer:bach composer:debussy')).toBe('');
  });

  it("ne filtre pas sur une clé sans valeur ou une valeur qu'elle ne prend pas, lit une clé inconnue comme un mot", () => {
    expect(ids('composer:')).toBe('123');
    expect(ids('pdf:maybe')).toBe('123');
    expect(ids('op:27')).toBe('');
  });
});
