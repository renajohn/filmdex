import { describe, it, expect } from 'vitest';
import { trackCredits, discCredits } from './trackCredits';

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

describe('discCredits', () => {
  const sinopoli = [{ name: 'Giuseppe Sinopoli', role: 'conductor' }, { name: 'Philharmonia Orchestra', role: 'orchestra' }];
  const carreras = { name: 'José Carreras', role: 'tenor vocals' };
  const freni = { name: 'Mirella Freni', role: 'soprano vocals' };

  it('écrit une fois en tête ce que toutes les pistes partagent, puis les chanteurs au changement', () => {
    const tracks = [
      { composers: ['Giacomo Puccini'], performers: [...sinopoli, carreras] },
      { composers: ['Giacomo Puccini'], performers: [...sinopoli, carreras] },
      { composers: ['Giacomo Puccini'], performers: [...sinopoli, freni] },
    ];

    expect(discCredits(tracks, [])).toEqual({
      common: 'Giacomo Puccini — Giuseppe Sinopoli (conductor), Philharmonia Orchestra (orchestra)',
      perTrack: ['José Carreras (tenor vocals)', null, 'Mirella Freni (soprano vocals)'],
    });
  });

  it('nomme le compositeur au premier mouvement de chaque concerto', () => {
    const boccherini = { ...vivaldi, composers: ['Luigi Boccherini'] };

    expect(discCredits([boccherini, boccherini, vivaldi, vivaldi], [])).toEqual({
      common: 'Paul Sacher (conductor), Mstislav Rostropovich (cello)',
      perTrack: ['Luigi Boccherini', null, 'Antonio Vivaldi', null],
    });
  });

  it('ne répète pas sous chaque piste le compositeur déjà nommé en tête', () => {
    const sonata = { artist: ['Ludwig van Beethoven'], composers: ['Ludwig van Beethoven'], performers: [{ name: 'Wilhelm Kempff', role: 'piano' }] };
    expect(discCredits([sonata, sonata], ['Wilhelm Kempff']).perTrack).toEqual([null, null]);
  });

  it('se tait sans crédits', () => {
    expect(discCredits([{ artist: ['Massive Attack'] }], ['Massive Attack'])).toEqual({ common: null, perTrack: [null] });
  });
});
