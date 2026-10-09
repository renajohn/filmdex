import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import musicbrainzService from '../../src/services/musicbrainzService';
import shelvingService from '../../src/services/shelvingService';
import {
  boxSetName, classicalHeadline, collationKey, filmTitle, isClassicalAlbum, personSortName, withoutArticle,
} from '../../src/services/shelfOrder';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const insertAlbum = (artist: string[], title: string, genres: string[], releaseId: string | null = null) =>
  run(`INSERT INTO albums (title, artist, genres, title_status, musicbrainz_release_id) VALUES (?, ?, ?, 'owned', ?)`,
    [title, JSON.stringify(artist), JSON.stringify(genres), releaseId]);

const insertTrack = (albumId: number, composers: string[], performers: Array<{ name: string; role: string }>) =>
  run(`INSERT INTO tracks (album_id, disc_number, track_number, title, composers, performers) VALUES (?, 1, 1, 'Track', ?, ?)`,
    [albumId, JSON.stringify(composers), JSON.stringify(performers)]);

const insertMovie = (title: string, year = '2000') =>
  run(`INSERT INTO movies (title, release_date, format, title_status) VALUES (?, ?, 'Blu-ray', 'owned')`, [title, `${year}-01-01`]);

afterEach(() => jest.restoreAllMocks());

describe('les noms sous lesquels on range', () => {
  it('ôte l’article, en français comme en anglais', () => {
    expect(withoutArticle('The Beatles')).toBe('Beatles');
    expect(withoutArticle('Les Autres')).toBe('Autres');
    expect(withoutArticle('L’imaginarium du docteur Parnassus')).toBe('imaginarium du docteur Parnassus');
    expect(withoutArticle('Die Hard 1-5')).toBe('Die Hard 1-5');
    expect(withoutArticle('A-ha')).toBe('A-ha');
    expect(filmTitle('le parfum [fr]')).toBe('parfum');
  });

  it('range une personne à son nom de famille, la particule après le prénom', () => {
    expect(personSortName('Herbert von Karajan')).toBe('Karajan, Herbert von');
    expect(personSortName('Sir Neville Marriner')).toBe('Marriner, Neville');
    expect(personSortName('MATT HAIMOVITZ, Violoncello')).toBe('Haimovitz, Matt');
    expect(personSortName('Kempff')).toBe('Kempff');
  });

  it('compare sans accents ni majuscules', () => {
    expect(collationKey('Édith Piaf')).toBe(collationKey('edith piaf'));
  });

  it('range un coffret sous son nom, pas sous « Coffret »', () => {
    expect(boxSetName('Coffret trilogie, Jason Bourne')).toBe('Jason Bourne');
    expect(boxSetName('Indiana Jones, l\'intégrale')).toBe('Indiana Jones, l\'intégrale');
  });
});

describe('le classique', () => {
  it('ne prend pas The Wall pour du classique, même tagué ainsi', () => {
    expect(isClassicalAlbum(['classical', 'opera'])).toBe(true);
    expect(isClassicalAlbum(['classic rock', 'classical', 'progressive rock'])).toBe(false);
  });

  it('reconnaît un CD sans genre à ses interprètes', () => {
    expect(isClassicalAlbum([], [{ name: 'Ruth Schmid-Gagnebin', role: 'piano' }])).toBe(true);
    expect(isClassicalAlbum([], [{ name: 'Herbert von Karajan', role: 'conductor' }, { name: 'BPO', role: 'orchestra' }])).toBe(true);
    expect(isClassicalAlbum([], [{ name: 'Yehudi Menuhin', role: 'violin' }, { name: 'X', role: 'drums (drum set)' }])).toBe(false);
    expect(isClassicalAlbum([], [])).toBe(false);
  });

  it('range sous le soliste d’un concerto, même quand il a écrit une cadence', () => {
    const headline = classicalHeadline(
      ['JOSEPH HAYDN (1732–1809)', 'MATT HAIMOVITZ, Violoncello', 'English Chamber Orchestra', 'ANDREW DAVIS'],
      ['Joseph Haydn', 'Matt Haimovitz'],
      [{ name: 'Andrew Davis', role: 'conductor' }, { name: 'Matt Haimovitz', role: 'cello' }],
    );
    expect(headline).toBe('Matt Haimovitz');
  });

  it('range un opéra sous son chef, et donne le nom complet que la pochette abrège', () => {
    expect(classicalHeadline(
      ['Mozart', 'Samuel Ramey', 'Anna Tomowa‐Sintow', 'Agnes Baltsa', 'Kathleen Battle', 'Berliner Philharmoniker', 'Herbert von Karajan'],
      ['Wolfgang Amadeus Mozart'],
      [{ name: 'Herbert von Karajan', role: 'conductor' }],
    )).toBe('Herbert von Karajan');
    expect(classicalHeadline(
      ['Wolfgang Amadeus Mozart', 'Felix Mendelssohn Bartholdy', 'Karajan', 'Anne‐Sophie Mutter'],
      ['Wolfgang Amadeus Mozart'],
      [{ name: 'Herbert von Karajan', role: 'conductor' }, { name: 'Anne‐Sophie Mutter', role: 'violin' }],
    )).toBe('Herbert von Karajan');
  });

  it('se rabat sur le chef des pistes quand la pochette ne nomme que le compositeur', () => {
    expect(classicalHeadline(['Georges Bizet'], ['Georges Bizet'], [{ name: 'Sir Neville Marriner', role: 'conductor' }]))
      .toBe('Sir Neville Marriner');
  });
});

describe('le plan de rangement', () => {
  it('range chaque objet dans sa section, dans l’ordre, un coffret comme un seul objet', async () => {
    const zeppelin = await insertAlbum(['Led Zeppelin'], 'Led Zeppelin II', ['rock']);
    const beatles = await insertAlbum(['The Beatles'], 'Abbey Road', ['rock']);
    const kremer = await insertAlbum(['Antonio Vivaldi', 'Gidon Kremer'], 'Le quattro stagioni', ['classical']);
    await insertTrack(kremer, ['Antonio Vivaldi'], [{ name: 'Gidon Kremer', role: 'violin' }]);
    const matrix = await insertMovie('The Matrix', '1999');
    const amelie = await insertMovie('Le Fabuleux destin d\'Amélie Poulain', '2001');
    const box = await run(`INSERT INTO collections (name, type) VALUES ('Coffret trilogie, Bourne test', 'box_set')`);
    for (const title of ['Bourne Identity', 'Bourne Supremacy']) {
      await run(`INSERT INTO movie_collections (movie_id, collection_id) VALUES (?, ?)`, [await insertMovie(title), box]);
    }

    const plan = (await request(app).get('/api/shelving')).body;
    const section = (key: string) => plan.sections.find((s: any) => s.key === key).items;
    const ids = (key: string, kind: string) => section(key).filter((i: any) => i.kind === kind).map((i: any) => i.id);

    const music = ids('music', 'album');
    expect(music.indexOf(beatles)).toBeLessThan(music.indexOf(zeppelin));
    expect(section('classical').find((i: any) => i.id === kremer).sortName).toBe('Kremer, Gidon');

    const films = section('films');
    const bourne = section('films').find((i: any) => i.kind === 'box_set' && i.id === box);
    expect(bourne).toMatchObject({ sortName: 'Bourne test', units: 1 });
    expect(bourne.movieIds).toHaveLength(2);
    expect(films.filter((i: any) => i.kind === 'movie' && i.title.startsWith('Bourne'))).toHaveLength(0);
    const order = films.map((i: any) => `${i.kind}:${i.id}`);
    expect(order.indexOf(`movie:${amelie}`)).toBeLessThan(order.indexOf(`movie:${matrix}`));
  });

  it('garde une collection ensemble, sous son premier film, dans l’ordre des sorties, sauf des films prêtés', async () => {
    const jurassic = await run(`INSERT INTO collections (name, type) VALUES ('Jurassic test', 'user')`);
    const world = await insertMovie('Jurassic World test', '2015');
    const park = await insertMovie('Jurassic Park test', '1993');
    const lost = await insertMovie('The Lost World test', '1997');
    for (const movie of [world, park, lost]) {
      await run(`INSERT INTO movie_collections (movie_id, collection_id) VALUES (?, ?)`, [movie, jurassic]);
    }
    const kong = await insertMovie('King Kong test', '2005');
    const lent = await run(`INSERT INTO collections (name, type) VALUES ('Prêté à Yves test', 'user')`);
    const godzilla = await insertMovie('Godzilla test', '2023');
    const fall = await insertMovie('The Fall Guy test', '2024');
    for (const movie of [godzilla, fall]) {
      await run(`INSERT INTO movie_collections (movie_id, collection_id) VALUES (?, ?)`, [movie, lent]);
    }
    const films = async () => (await request(app).get('/api/shelving')).body.sections.find((s: any) => s.key === 'films').items;
    const order = (items: any[], ids: number[]) => items.filter((i: any) => ids.includes(i.id)).map((i: any) => i.id);
    const jurassicIds = [world, park, lost, kong];

    const kept = await films();
    expect(order(kept, jurassicIds)).toEqual([park, lost, world, kong]);
    expect(kept.find((i: any) => i.id === world)).toMatchObject({
      sortName: 'Jurassic Park test', together: { id: jurassic, name: 'Jurassic Park test' },
      collections: [{ id: jurassic, name: 'Jurassic test', together: true }],
    });
    // Films lent out stand each under its own name.
    expect(order(kept, [godzilla, fall])).toEqual([fall, godzilla]);
    expect(kept.find((i: any) => i.id === fall).together).toBeNull();

    expect((await request(app).put(`/api/shelving/collections/${jurassic}`).send({ together: false })).status).toBe(200);
    expect(order(await films(), jurassicIds)).toEqual([park, world, kong, lost]);
    await request(app).put(`/api/shelving/collections/${lent}`).send({ together: true });
    expect(order(await films(), [godzilla, fall])).toEqual([godzilla, fall]);
    expect((await request(app).put('/api/shelving/collections/999999').send({ together: true })).status).toBe(404);
  });

  it('garde ce qui est réglé à la main : la section, le nom, un lieu hors des étagères', async () => {
    const tilney = await insertAlbum(['George Frideric Handel', 'Colin Tilney'], 'Water Music test', ['classical']);
    const place = (await request(app).post('/api/shelving/places').send({ name: 'Armoire, en haut' })).body;
    expect((await request(app).post('/api/shelving/places').send({ name: 'Armoire, en haut' })).status).toBe(409);

    await request(app).put(`/api/shelving/items/album/${tilney}`).send({ shelveUnder: 'Marriner, Neville' }).expect(200);
    let plan = (await request(app).get('/api/shelving')).body;
    const item = plan.sections.find((s: any) => s.key === 'classical').items.find((i: any) => i.id === tilney);
    expect(item).toMatchObject({ sortName: 'Marriner, Neville', sortSource: 'manual' });

    await request(app).put(`/api/shelving/items/album/${tilney}`).send({ placeId: place.id, section: 'music' }).expect(200);
    plan = (await request(app).get('/api/shelving')).body;
    expect(plan.sections.some((s: any) => s.items.some((i: any) => i.kind === 'album' && i.id === tilney))).toBe(false);
    const kept = plan.places.find((p: any) => p.id === place.id).items[0];
    expect(kept).toMatchObject({ id: tilney, section: 'music', sectionAuto: false, sortName: 'Marriner, Neville' });

    await request(app).delete(`/api/shelving/places/${place.id}`).expect(204);
    plan = (await request(app).get('/api/shelving')).body;
    expect(plan.sections.find((s: any) => s.key === 'music').items.some((i: any) => i.id === tilney)).toBe(true);
  });

  it('garde la largeur donnée à la main, et revient à l’estimation quand on l’efface', async () => {
    const id = await insertAlbum(['Wilhelm Kempff'], 'Sonatas test', ['classical']);
    const widthOf = async () => (await request(app).get('/api/shelving')).body.sections
      .find((s: any) => s.key === 'classical').items.find((i: any) => i.id === id);

    expect(await widthOf()).toMatchObject({ units: 1, unitsAuto: true });
    await request(app).put(`/api/shelving/items/album/${id}`).send({ units: 4 }).expect(200);
    expect(await widthOf()).toMatchObject({ units: 4, unitsAuto: false });
    await request(app).put(`/api/shelving/items/album/${id}`).send({ units: 0 }).expect(400);
    await request(app).put(`/api/shelving/items/album/${id}`).send({ units: 1.25 }).expect(200);
    expect(await widthOf()).toMatchObject({ units: 1.3 });
    await request(app).put(`/api/shelving/items/album/${id}`).send({ units: null }).expect(200);
    expect(await widthOf()).toMatchObject({ units: 1, unitsAuto: true });
  });

  it('refuse une section ou un lieu inconnus', async () => {
    const id = await insertAlbum(['X'], 'Y', []);
    await request(app).put(`/api/shelving/items/album/${id}`).send({ section: 'jazz' }).expect(400);
    await request(app).put(`/api/shelving/items/album/${id}`).send({ placeId: 999999 }).expect(400);
    await request(app).put(`/api/shelving/items/record/${id}`).send({}).expect(404);
  });

  it('demande à MusicBrainz le nom de tri de l’artiste, une fois, et range « Beatles, The » à B', async () => {
    const id = await insertAlbum(['George Michael'], 'Older test', ['pop'], 'release-george');
    const credits = jest.spyOn(musicbrainzService, 'getReleaseArtistCredits')
      .mockResolvedValue([{ name: 'George Michael', sortName: 'Michael, George', type: 'Person' }]);

    await shelvingService.fetchSortNames();
    await shelvingService.fetchSortNames();
    expect(credits.mock.calls.filter(call => call[0] === 'release-george')).toHaveLength(1);

    const plan = (await request(app).get('/api/shelving')).body;
    const item = plan.sections.find((s: any) => s.key === 'music').items.find((i: any) => i.id === id);
    expect(item).toMatchObject({ sortName: 'Michael, George', sortSource: 'musicbrainz' });
  });
});
