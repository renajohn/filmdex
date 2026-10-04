import { describe, it, expect } from 'vitest';
import { trackCredits, creditHeadings } from './trackCredits';

const vivaldi = {
  artist: ['Antonio Vivaldi'],
  composers: ['Antonio Vivaldi'],
  performers: [{ name: 'Paul Sacher', role: 'conductor' }, { name: 'Mstislav Rostropovich', role: 'cello' }],
};

describe('trackCredits', () => {
  it('nomme le compositeur puis les interprètes avec leur rôle', () => {
    expect(trackCredits(vivaldi, [])).toBe('Antonio Vivaldi — Paul Sacher (conductor), Mstislav Rostropovich (cello)');
  });

  it('tait l’artiste de la piste quand c’est celui de l’album', () => {
    expect(trackCredits({ artist: ['Massive Attack'] }, ['Massive Attack'])).toBeNull();
  });

  it('nomme l’artiste d’une piste de compilation', () => {
    expect(trackCredits({ artist: ['Horace Andy'] }, ['Massive Attack'])).toBe('Horace Andy');
  });
});

describe('creditHeadings', () => {
  it('n’écrit les crédits qu’au changement', () => {
    const boccherini = { ...vivaldi, composers: ['Luigi Boccherini'] };
    expect(creditHeadings([boccherini, boccherini, vivaldi, vivaldi], [])).toEqual([
      expect.stringContaining('Boccherini'), null, expect.stringContaining('Antonio Vivaldi'), null,
    ]);
  });
});
