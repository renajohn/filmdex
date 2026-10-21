import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import musicbrainzService from '../../src/services/musicbrainzService';
import * as musicServiceModule from '../../src/services/musicService';
import { forgetFinderAnswers, namesArtist, workTitle } from '../../src/services/albumFinderService';

const tag = () => Math.random().toString(36).slice(2, 8);

const itunesAlbum = (fields: { id: number; title: string; artist: string; artistId: number; year?: string; tracks?: number; genre?: string }) => ({
  wrapperType: 'collection', collectionId: fields.id, collectionName: fields.title, artistName: fields.artist, artistId: fields.artistId,
  releaseDate: `${fields.year ?? '2001'}-05-01T07:00:00Z`, trackCount: fields.tracks ?? 12, primaryGenreName: fields.genre ?? 'Rock',
  artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/${fields.id}/100x100bb.jpg`,
});

const insertAlbum = (title: string, artist: string, status: string) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO albums (title, artist, format, title_status) VALUES (?, ?, 'CD', ?)`, [title, JSON.stringify([artist]), status],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

beforeEach(() => forgetFinderAnswers());
afterEach(() => jest.restoreAllMocks());

describe('le chercheur d’albums', () => {
  it('ne garde du titre que l’œuvre : une édition s’en va, un live reste', () => {
    expect(workTitle('This Is the Life (Deluxe Edition)')).toBe('This Is the Life');
    expect(workTitle('Absolution (2023 Remastered)')).toBe('Absolution');
    expect(workTitle('Under Stars (Live In Berlin)')).toBe('Under Stars (Live In Berlin)');
    expect(workTitle('Hysteria - Single')).toBe('Hysteria');
  });

  it('reconnaît un artiste sans ses accents ni son orthographe exacte, mais pas d’un seul mot de trois', () => {
    expect(namesArtist('edit piaf', 'Édith Piaf')).toBe(true);
    expect(namesArtist('Edith Piaf', 'Édith Piaf')).toBe(true);
    expect(namesArtist('piaf', 'Édith Piaf')).toBe(true);
    expect(namesArtist('muse', 'Muse')).toBe(true);
    expect(namesArtist('amy macdonald this is the life', 'Amy Macdonald')).toBe(true);
    expect(namesArtist('massive atack', 'Massive Attack')).toBe(true);
    expect(namesArtist('black', 'The Black Eyed Peas')).toBe(false);
    expect(namesArtist('muse', 'Jimin')).toBe(false);
    expect(namesArtist('back in black', 'AC/DC')).toBe(false);
  });

  it('trouve les albums, leurs éditions en un, sans les singles, et dit ce qu’on a déjà', async () => {
    const band = `Muse ${tag()}`;
    await insertAlbum('Absolution', band, 'wish');
    await insertAlbum('Origin of Symmetry', band, 'owned');
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { results: [
      itunesAlbum({ id: 1, title: 'Absolution', artist: band, artistId: 10, year: '2003' }),
      itunesAlbum({ id: 2, title: 'Absolution (XX Anniversary Edition)', artist: band, artistId: 10, year: '2023' }),
      itunesAlbum({ id: 3, title: 'Origin of Symmetry', artist: band, artistId: 10, year: '2001' }),
      itunesAlbum({ id: 4, title: 'Hysteria - Single', artist: band, artistId: 10, tracks: 1 }),
      itunesAlbum({ id: 5, title: 'Black Holes and Revelations', artist: band, artistId: 10, year: '2006' }),
    ] } });

    const res = await request(app).get('/api/music/finder/search').query({ q: band }).expect(200);

    expect(res.body.source).toBe('itunes');
    expect(res.body.albums.map((a: { title: string }) => a.title)).toEqual(['Absolution', 'Origin of Symmetry', 'Black Holes and Revelations']);
    expect(res.body.albums[0]).toMatchObject({ editions: 2, year: '2003', have: { status: 'wish' }, cover: expect.stringContaining('/600x600bb.') });
    expect(res.body.albums[1].have).toMatchObject({ status: 'owned' });
    expect(res.body.albums[2].have).toBeNull();
  });

  it('ne fait une pastille que d’un artiste qui a des albums parmi les résultats, le plus fourni d’abord', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { results: [
      itunesAlbum({ id: 1, title: 'Absolution', artist: 'Muse', artistId: 10 }),
      itunesAlbum({ id: 2, title: 'Drones', artist: 'Muse', artistId: 10 }),
      itunesAlbum({ id: 3, title: 'Muse - Single', artist: 'Muse', artistId: 20, tracks: 1 }),
      itunesAlbum({ id: 4, title: 'Muse', artist: 'Jimin', artistId: 30 }),
    ] } });

    const res = await request(app).get('/api/music/finder/search').query({ q: 'muse' }).expect(200);

    expect(res.body.artists).toEqual([expect.objectContaining({ id: '10', name: 'Muse', albums: 2, covers: expect.any(Array) })]);
  });

  it('demande à Deezer quand iTunes refuse', async () => {
    jest.spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url.includes('itunes')) throw Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } });
      return { data: { data: [{ id: 7, title: 'Rumours', nb_tracks: 11, record_type: 'album', cover_big: 'http://cdn-images.dzcdn.net/r.jpg', artist: { id: 9, name: 'Fleetwood Mac' } }] } };
    });

    const res = await request(app).get('/api/music/finder/search').query({ q: `rumours ${tag()}` }).expect(200);

    expect(res.body.source).toBe('deezer');
    expect(res.body.albums[0]).toMatchObject({ title: 'Rumours', artist: 'Fleetwood Mac', cover: 'https://cdn-images.dzcdn.net/r.jpg' });
  });

  it('donne la discographie d’un artiste, la plus ancienne d’abord, sans ses singles ni les albums des autres', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { results: [
      { wrapperType: 'artist', artistId: 10, artistName: 'Muse' },
      itunesAlbum({ id: 2, title: 'Drones', artist: 'Muse', artistId: 10, year: '2015' }),
      itunesAlbum({ id: 1, title: 'Showbiz', artist: 'Muse', artistId: 10, year: '1999' }),
      itunesAlbum({ id: 3, title: 'Uprising - Single', artist: 'Muse', artistId: 10, tracks: 2 }),
      itunesAlbum({ id: 4, title: 'Tribute', artist: 'Various', artistId: 99 }),
    ] } });

    const res = await request(app).get('/api/music/finder/artists/itunes/10/albums').expect(200);

    expect(res.body.map((a: { title: string }) => a.title)).toEqual(['Showbiz', 'Drones']);
  });

  it('donne les éditions CD d’un album sur MusicBrainz, la Suisse et l’Europe d’abord, avec ce qui les distingue', async () => {
    jest.spyOn(musicbrainzService, 'searchReleaseGroups').mockResolvedValue([
      { id: 'rg-live', title: 'Back in Black Live', artist: 'AC/DC', firstReleaseDate: '2020', primaryType: 'Album', score: 100 },
      { id: 'rg-1', title: 'Back in Black', artist: 'AC/DC', firstReleaseDate: '1980-07-25', primaryType: 'Album', score: 98 },
    ]);
    const edition = (id: string, country: string, date: string, formats = ['CD']) => ({
      id, title: 'Back in Black', date, country, barcode: null, labels: ['Atlantic'], catalogNumbers: ['16018-2'],
      packaging: 'Digipak', disambiguation: '2003 remaster', status: 'Official', formats, discs: 1, front: true,
    });
    const groups = jest.spyOn(musicbrainzService, 'getEditionsOfGroup').mockResolvedValue([
      edition('us', 'US', '1980'), edition('vinyl', 'DE', '1980', ['12" Vinyl']), edition('de', 'DE', '1990'), edition('ch', 'CH', '2003'),
    ]);

    const res = await request(app).get('/api/music/finder/editions').query({ artist: 'AC/DC', title: 'Back in Black (Remastered)' }).expect(200);

    expect(groups).toHaveBeenCalledWith('rg-1');
    expect(res.body.releaseGroup).toMatchObject({ id: 'rg-1' });
    expect(res.body.editions.map((e: { id: string }) => e.id)).toEqual(['ch', 'de', 'us']);
    expect(res.body.editions[0]).toMatchObject({ packaging: 'Digipak', disambiguation: '2003 remaster', catalogNumbers: ['16018-2'] });
  });

  it('ajoute un album sans son édition, souhaité, avec sa pochette', async () => {
    const download = jest.spyOn(musicServiceModule, 'downloadCover').mockResolvedValue('/images/cd/finder.jpg');
    const title = `Drones ${tag()}`;

    const res = await request(app).post('/api/music/finder/albums')
      .send({ title, artist: 'Muse', year: '2015', cover: 'https://is1-ssl.mzstatic.com/image/thumb/2/600x600bb.jpg', titleStatus: 'wish' }).expect(201);

    expect(res.body).toMatchObject({ title, artist: ['Muse'], releaseYear: 2015, format: 'CD', titleStatus: 'wish' });
    expect(download).toHaveBeenCalledWith('https://is1-ssl.mzstatic.com/image/thumb/2/1200x1200bb.jpg', expect.any(String), 'front');

    await request(app).post('/api/music/finder/albums').send({ title, artist: 'Muse', titleStatus: 'wish' }).expect(409);
  });

  it('ne télécharge pas une pochette d’une adresse inconnue', async () => {
    const download = jest.spyOn(musicServiceModule, 'downloadCover');
    await request(app).post('/api/music/finder/albums')
      .send({ title: `Showbiz ${tag()}`, artist: 'Muse', cover: 'http://169.254.169.254/latest', titleStatus: 'owned' }).expect(201);
    expect(download).not.toHaveBeenCalled();
  });
});
