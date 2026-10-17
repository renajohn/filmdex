import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import TrackLyrics from '../../src/models/trackLyrics';
import musicbrainzService from '../../src/services/musicbrainzService';
import musicbrainzRefreshService from '../../src/services/musicbrainzRefreshService';

const tag = () => Math.random().toString(36).slice(2, 8);
const uuid = () => `${tag()}${tag()}`.slice(0, 8).padEnd(8, '0').replace(/[^0-9a-f]/g, 'a') + '-1111-2222-3333-444455556666';

const insertAlbum = (fields: { title: string; artist?: string; status: string; releaseId?: string | null; groupId?: string | null }) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO albums (title, artist, format, title_status, musicbrainz_release_id, musicbrainz_release_group_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [fields.title, JSON.stringify([fields.artist ?? 'Moby']), fields.status === 'digital' ? 'Digital Media' : 'CD', fields.status, fields.releaseId ?? null, fields.groupId ?? null],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

beforeEach(() => {
  jest.spyOn(musicbrainzRefreshService, 'refreshAlbum').mockResolvedValue({} as never);
});

afterEach(() => jest.restoreAllMocks());

describe('I bought the CD', () => {
  it('fait de l’album digital un CD de la collection, le même album, avec ses paroles et comment il a été acheté', async () => {
    const id = await insertAlbum({ title: `Play ${tag()}`, status: 'digital' });
    await TrackLyrics.save({ albumId: id, discNumber: 1, trackNumber: 1, title: 'Honey', status: 'found', plain: 'words', synced: null, source: 'lrclib', sourceId: '1' } as never);

    const res = await request(app).post(`/api/music/albums/${id}/bought`)
      .send({ condition: 'NM', purchasedAt: '2026-10-17', priceChf: '12', notes: 'Ricardo' }).expect(200);

    expect(res.body).toMatchObject({ id, titleStatus: 'owned', format: 'CD', ownership: { condition: 'NM', purchasedAt: '2026-10-17', priceChf: 12, notes: 'Ricardo' } });
    expect((await TrackLyrics.forAlbum(id)).map(row => row.title)).toEqual(['Honey']);
    // The edition it had stays: nothing to read again from MusicBrainz.
    expect(musicbrainzRefreshService.refreshAlbum).not.toHaveBeenCalled();
  });

  it('prend l’édition achetée, par son lien MusicBrainz, et en reprend les pistes', async () => {
    const id = await insertAlbum({ title: `Hotel ${tag()}`, status: 'wish' });
    const releaseId = uuid();
    await request(app).post(`/api/music/albums/${id}/bought`).send({ releaseId: `https://musicbrainz.org/release/${releaseId}` }).expect(200);
    expect(await Album.findById(id)).toMatchObject({ titleStatus: 'owned', musicbrainzReleaseId: releaseId });
    expect(musicbrainzRefreshService.refreshAlbum).toHaveBeenCalledWith(id);
  });

  it('trouve l’édition par le code-barres', async () => {
    const id = await insertAlbum({ title: `Wait ${tag()}`, status: 'digital' });
    const releaseId = uuid();
    jest.spyOn(musicbrainzService, 'getReleaseByBarcode').mockResolvedValue([{ id: releaseId }] as never);
    await request(app).post(`/api/music/albums/${id}/bought`).send({ barcode: '724384 5 46526' }).expect(200);
    expect(musicbrainzService.getReleaseByBarcode).toHaveBeenCalledWith('724384546526');
    expect((await Album.findById(id))!.musicbrainzReleaseId).toBe(releaseId);
  });

  it('refuse un CD déjà dans la collection, et une édition qu’un autre CD porte', async () => {
    const owned = await insertAlbum({ title: `Owned ${tag()}`, status: 'owned', releaseId: uuid() });
    await request(app).post(`/api/music/albums/${owned}/bought`).send({}).expect(409);
    const digital = await insertAlbum({ title: `Twin ${tag()}`, status: 'digital' });
    const taken = (await Album.findById(owned))!.musicbrainzReleaseId;
    await request(app).post(`/api/music/albums/${digital}/bought`).send({ releaseId: taken }).expect(409);
    expect((await Album.findById(digital))!.titleStatus).toBe('digital');
    await request(app).post(`/api/music/albums/${digital}/bought`).send({ releaseId: 'not an id' }).expect(400);
  });
});

describe('Add Album sur un album qu’on a déjà en digital', () => {
  it('propose l’album digital ou souhaité de la même édition, du même release group, ou du même titre et artiste', async () => {
    const [releaseId, groupId, title] = [uuid(), `rg-${tag()}`, `Mezzanine ${tag()}`];
    const sameEdition = await insertAlbum({ title: `Other ${tag()}`, status: 'digital', releaseId });
    const sameGroup = await insertAlbum({ title: `Group ${tag()}`, status: 'wish', groupId });
    const sameTitle = await insertAlbum({ title, artist: 'Massive Attack', status: 'digital' });
    const unrelated = await insertAlbum({ title: `Else ${tag()}`, status: 'digital' });
    const ownedTwin = await insertAlbum({ title, artist: 'Massive Attack', status: 'owned' });
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ title, 'release-group': { id: groupId }, 'artist-credit': [{ name: 'Massive Attack' }] } as never);

    const res = await request(app).post('/api/music/attachable-albums').send({ releaseId }).expect(200);

    const ids = res.body.map((album: { id: number }) => album.id);
    expect(ids).toEqual(expect.arrayContaining([sameEdition, sameGroup, sameTitle]));
    expect(ids).not.toContain(unrelated);
    expect(ids).not.toContain(ownedTwin);
  });

  it('s’en tient au titre et à l’artiste quand MusicBrainz ne répond pas', async () => {
    const title = `Protection ${tag()}`;
    const id = await insertAlbum({ title, artist: 'Massive Attack', status: 'digital' });
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockRejectedValue(new Error('down'));
    const res = await request(app).post('/api/music/attachable-albums').send({ releaseId: uuid(), title, artist: ['Massive Attack'] }).expect(200);
    expect(res.body.map((album: { id: number }) => album.id)).toEqual([id]);
  });
});
