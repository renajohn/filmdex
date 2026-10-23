import { fold, matchScore, searchWords } from '../src/utils/searchText';

describe('the plain words of a search', () => {
  it('folds case, accents and the joined letters', () => {
    expect(fold('Beyoncé')).toBe('beyonce');
    expect(fold('Œuvres pour piano')).toBe('oeuvres pour piano');
    expect(fold('Dvořák’s “New World” – Ø')).toBe('dvorak\'s "new world" - o');
  });

  it('splits on the spaces outside quotes', () => {
    expect(searchWords('  "Pink Floyd"  moon ')).toEqual(['pink floyd', 'moon']);
    expect(searchWords('')).toEqual([]);
  });

  it('ranks the start of a name, an article aside, before a word’s start, before anywhere', () => {
    const score = (q: string, title: string) => matchScore(searchWords(q), [[title, 1]]);
    expect(score('low', 'Low')).toBeGreaterThan(score('low', 'Lowlands'));
    expect(score('bea', 'The Beatles')).toBe(score('bea', 'Beautiful Garbage'));
    expect(score('bea', 'Beautiful Garbage')).toBeGreaterThan(score('bea', 'Beauty and the Beat') - 1);
    expect(score('bea', 'Beauty and the Beat')).toBeGreaterThan(score('bea', 'Into the Beat'));
    expect(score('bea', 'Into the Beat')).toBeGreaterThan(score('bea', 'Abeam'));
    expect(score('bea', 'Kid A')).toBe(0);
    expect(score('beyo', '["Beyoncé"]')).toBe(100);
  });

  it('weighs the fields and adds the words', () => {
    const words = searchWords('kubrick');
    expect(matchScore(words, [['2001', 1], ['Stanley Kubrick', 0.8]])).toBe(56);
    expect(matchScore(searchWords('floyd moon'), [['The Dark Side of the Moon', 1], ['["Pink Floyd"]', 1]])).toBe(140);
  });
});
