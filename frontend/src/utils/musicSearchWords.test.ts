import { describe, expect, it } from 'vitest';
import { asksMixtapes, asksNavidrome } from './musicSearchWords';

describe('what MusicDex reads in its search', () => {
  it('Digital on: cd:, file:, ripped:, favourites: whatever their sign, value or name', () => {
    for (const q of ['cd:no', '-cd:yes', '!cd:yes', 'cd:false', 'file:lossy', 'ripped:without', 'blue favourites:yes', 'fav:1', 'favorites:true', 'cd:']) {
      expect(asksNavidrome(q), q).toBe(true);
    }
    for (const q of ['', 'blue', 'composer:Bach', 'mixtape:yes', 'title:"cd: two"', 'discd:yes']) {
      expect(asksNavidrome(q), q).toBe(false);
    }
  });

  it('Mixtapes on: mixtape:yes, its old words, or -mixtape:no', () => {
    for (const q of ['mixtape:yes', 'mixtape:true', 'mixtape:with', 'mixtape:1', '-mixtape:no', '!mixtape:false', 'mixtape:yes,no']) {
      expect(asksMixtapes(q), q).toBe(true);
    }
    for (const q of ['', 'mixtape:no', '-mixtape:yes', 'mixtape:false', 'mixtape:maybe', 'mixtape:', '-mixtape:yes,no']) {
      expect(asksMixtapes(q), q).toBe(false);
    }
  });
});
