import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const insertAlbum = (artist: string[], title: string) =>
  run(`INSERT INTO albums (title, artist, title_status) VALUES (?, ?, 'owned')`, [title, JSON.stringify(artist)]);

const insertTrack = (albumId: number, fields: { title: string; work?: string; artist?: string[]; composers?: string[]; performers?: Array<{ name: string; role: string }> }) =>
  run(`INSERT INTO tracks (album_id, disc_number, track_number, title, work, artist, composers, performers) VALUES (?, 1, 1, ?, ?, ?, ?, ?)`,
    [albumId, fields.title, fields.work ?? null, JSON.stringify(fields.artist || []), JSON.stringify(fields.composers || []), JSON.stringify(fields.performers || [])]);

const titles = async (q: string): Promise<string[]> =>
  (await request(app).get('/api/music/albums/search').query({ q })).body.map((album: any) => album.title).sort();

describe('chercher un CD par ce que créditent ses pistes', () => {
  beforeAll(async () => {
    const mozart = await insertAlbum(['Mozart', 'Brendel'], 'Piano Concertos 20 & 21 test');
    await insertTrack(mozart, {
      title: 'I. Allegro', work: 'Piano Concerto No. 20 in D minor, K. 466', composers: ['Wolfgang Amadeus Mozart'],
      performers: [{ name: 'Sir Neville Marriner', role: 'conductor' }, { name: 'Alfred Brendel', role: 'piano' }],
    });
    const haydn = await insertAlbum(['Haydn', 'Haimovitz'], 'Cello Concertos test');
    await insertTrack(haydn, {
      title: 'Allegro', composers: ['Joseph Haydn'],
      performers: [{ name: 'Andrew Davis', role: 'conductor' }, { name: 'Matt Haimovitz', role: 'cello' }, { name: 'Marriner Brass', role: 'piano' }],
    });
    const various = await insertAlbum(['Various Artists'], 'Kuschel test');
    await insertTrack(various, { title: 'Song', artist: ['Phil Collins'] });
  });

  it('trouve un CD par le compositeur, l’interprète, le chef, l’instrument ou l’œuvre d’une piste', async () => {
    expect(await titles('composer:"Wolfgang Amadeus Mozart"')).toEqual(['Piano Concertos 20 & 21 test']);
    expect(await titles('performer:"Alfred Brendel"')).toEqual(['Piano Concertos 20 & 21 test']);
    expect(await titles('conductor:Marriner')).toEqual(['Piano Concertos 20 & 21 test']);
    expect(await titles('instrument:cello')).toEqual(['Cello Concertos test']);
    expect(await titles('work:"K. 466"')).toEqual(['Piano Concertos 20 & 21 test']);
    expect(await titles('instrument:piano -performer:Brendel')).toEqual(['Cello Concertos test']);
  });

  it('trouve un artiste de compilation, et un nom crédité en texte libre', async () => {
    expect(await titles('artist:"Phil Collins"')).toEqual(['Kuschel test']);
    expect(await titles('Haimovitz')).toEqual(['Cello Concertos test']);
    expect(await titles('Brendel test')).toEqual([]);
    expect(await titles('Marriner')).toEqual(['Cello Concertos test', 'Piano Concertos 20 & 21 test']);
  });

  it('ne garde que le classique, ou tout le reste, comme les étagères les distinguent', async () => {
    const wall = await insertAlbum(['Pink Floyd'], 'The Wall test');
    await run(`UPDATE albums SET genres = ? WHERE id = ?`, [JSON.stringify(['classical', 'progressive rock']), wall]);
    const forced = await insertAlbum(['Somebody'], 'Forced classical test');
    await run(`INSERT INTO shelf_items (kind, item_id, section) VALUES ('album', ?, 'classical')`, [forced]);

    const classical = await titles('classical:yes test');
    expect(classical).toEqual(['Cello Concertos test', 'Forced classical test', 'Piano Concertos 20 & 21 test']);
    expect(await titles('classical:no test')).toEqual(['Kuschel test', 'The Wall test']);
    expect(await titles('classical:yes conductor:Marriner')).toEqual(['Piano Concertos 20 & 21 test']);
  });

  it('propose les noms crédités pendant la frappe', async () => {
    const names = async (field: string, value: string) =>
      (await request(app).get('/api/music/autocomplete').query({ field, value })).body.map((row: any) => row[field]);
    expect(await names('conductor', 'marr')).toEqual(['Sir Neville Marriner']);
    expect(await names('instrument', 'cel')).toEqual(['cello']);
    expect(await names('composer', 'mozart')).toEqual(['Wolfgang Amadeus Mozart']);
  });
});
