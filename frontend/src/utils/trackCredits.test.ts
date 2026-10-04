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

  it('écrit une fois en tête ce que toutes les pistes partagent, puis les chanteurs sous chaque piste', () => {
    const tracks = [
      { composers: ['Giacomo Puccini'], performers: [...sinopoli, carreras] },
      { composers: ['Giacomo Puccini'], performers: [...sinopoli, carreras] },
      { composers: ['Giacomo Puccini'], performers: [...sinopoli, freni] },
    ];

    expect(discCredits(tracks, [])).toEqual({
      common: 'Giacomo Puccini — Giuseppe Sinopoli (conductor), Philharmonia Orchestra (orchestra)',
      perTrack: ['José Carreras (tenor vocals)', 'José Carreras (tenor vocals)', 'Mirella Freni (soprano vocals)'],
      musicians: [null, null, null],
    });
  });

  it('nomme le compositeur sous chaque mouvement quand aucun ne domine le disque', () => {
    const boccherini = { ...vivaldi, composers: ['Luigi Boccherini'] };

    expect(discCredits([boccherini, boccherini, vivaldi, vivaldi], [])).toEqual({
      common: 'Paul Sacher (conductor), Mstislav Rostropovich (cello)',
      perTrack: ['Luigi Boccherini', 'Luigi Boccherini', 'Antonio Vivaldi', 'Antonio Vivaldi'],
      musicians: [null, null, null, null],
    });
  });

  it('ne répète pas sous chaque piste le compositeur déjà nommé en tête', () => {
    const sonata = { artist: ['Ludwig van Beethoven'], composers: ['Ludwig van Beethoven'], performers: [{ name: 'Wilhelm Kempff', role: 'piano' }] };
    expect(discCredits([sonata, sonata], ['Wilhelm Kempff']).perTrack).toEqual([null, null]);
  });

  it('met en tête l’auteur de la plupart des pistes, et l’autre sous la sienne', () => {
    const lennon = { artist: ['The Beatles'], composers: ['John Lennon', 'Paul McCartney'] };
    const harrison = { artist: ['The Beatles'], composers: ['George Harrison'] };

    expect(discCredits([lennon, harrison, lennon], ['The Beatles'])).toMatchObject({
      common: 'John Lennon / Paul McCartney', perTrack: [null, 'George Harrison', null],
    });
  });

  it('ne prend pas une piste sans crédits pour un autre compositeur', () => {
    const song = { artist: ['Steely Dan'], composers: ['Walter Becker', 'Donald Fagen'] };
    const blackCow = { artist: ['Steely Dan'], composers: [] };

    expect(discCredits([blackCow, song, song], ['Steely Dan'])).toEqual({
      common: 'Walter Becker / Donald Fagen', perTrack: [null, null, null], musicians: [null, null, null],
    });
  });

  it('se tait sans crédits', () => {
    expect(discCredits([{ artist: ['Massive Attack'] }], ['Massive Attack'])).toEqual({ common: null, perTrack: [null], musicians: [null] });
  });

  it('range les musiciens d’un groupe à part, une personne avec tous ses instruments', () => {
    const track = { artist: ['Adele'], performers: [
      { name: 'Ryan Tedder', role: 'drums (drum set)' }, { name: 'Ryan Tedder', role: 'piano' },
      { name: 'Adele Laurie Blue Adkins', role: 'lead vocals' },
      { name: 'Oren Waters', role: 'chorus master' },
    ] };

    expect(discCredits([track], ['Adele'])).toEqual({
      common: null,
      perTrack: [null],
      musicians: ['Ryan Tedder (drums (drum set), piano), Adele Laurie Blue Adkins (lead vocals), Oren Waters (chorus master)'],
    });
  });

  it('garde les solistes d’un concerto, mais pas l’orchestre entier pupitre par pupitre', () => {
    const sections = ['violin', 'viola', 'cello', 'double bass'].map((role, i) => ({ name: `Player ${i}`, role }));
    const [many] = [discCredits([{ performers: [{ name: 'Karajan', role: 'conductor' }, ...sections] }], [])];
    expect(many.common).toBe('Karajan (conductor)');
    expect(many.musicians[0]).toContain('Player 3 (double bass)');
  });
});
