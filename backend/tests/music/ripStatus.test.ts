import request from 'supertest';
import axios from 'axios';
import app from '../../index';
import { getDatabase } from '../../src/database';
import navidromeService from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';

const insertAlbum = (fields: { title: string; artist: string[]; releaseId?: string; format?: string; status?: string }) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO albums (title, artist, musicbrainz_release_id, format, title_status) VALUES (?, ?, ?, ?, ?)`,
      [fields.title, JSON.stringify(fields.artist), fields.releaseId ?? null, fields.format ?? 'CD', fields.status ?? 'owned'],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

const album = (id: string, name: string, artist: string, musicBrainzId?: string) => ({ id, name, artist, musicBrainzId: musicBrainzId ?? null, songCount: 2 });
const songs = (albumId: string, suffix: string, bitDepth: number | null = null) =>
  [1, 2].map(() => ({ albumId, suffix, bitDepth }));

beforeEach(() => {
  ripStatusService.clearCache();
  jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

const statusOf = async (id: number) => {
  const res = await request(app).get('/api/music/rip-status');
  expect(res.status).toBe(200);
  return res.body.albums.find((a: { id: number }) => a.id === id);
};

describe('rip status', () => {
  it('reconnaît un CD rippé en FLAC par son ID MusicBrainz', async () => {
    const id = await insertAlbum({ title: `Mezzanine ${Math.random()}`, artist: ['Massive Attack'], releaseId: `rel-${Math.random()}` });
    const releaseId = (await new Promise<any>(r => getDatabase().get('SELECT musicbrainz_release_id FROM albums WHERE id = ?', [id], (_e, row) => r(row)))).musicbrainz_release_id;
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd-1', 'Mezzanine', 'Massive Attack', releaseId)]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-1', 'flac'));

    expect(await statusOf(id)).toMatchObject({ state: 'lossless', formats: ['FLAC'], matches: [{ match: 'musicbrainz' }] });
  });

  it('classe en « pas en lossless » un vieux rip MP3 retrouvé par titre et artiste', async () => {
    const title = `Back to Black ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertAlbum({ title, artist: ['Amy Winehouse'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd-2', `${title} (Deluxe Edition)`, 'Amy Winehouse')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-2', 'mp3'));

    expect(await statusOf(id)).toMatchObject({ state: 'lossy', formats: ['MP3'], matches: [{ match: 'title' }] });
  });

  it('retient la meilleure copie quand le nouveau rip côtoie l’ancien MP3', async () => {
    const title = `Abbey Road ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertAlbum({ title, artist: ['The Beatles'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('old', title, 'The Beatles'), album('new', title, 'Beatles, The')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue([...songs('old', 'mp3'), ...songs('new', 'm4a', 16)]);

    expect(await statusOf(id)).toMatchObject({ state: 'lossless', formats: ['ALAC', 'MP3'] });
  });

  it('distingue l’AAC de l’ALAC dans un .m4a', async () => {
    const title = `Tea for the Tillerman ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertAlbum({ title, artist: ['Cat Stevens'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd-3', title, 'Cat Stevens')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-3', 'm4a'));

    expect(await statusOf(id)).toMatchObject({ state: 'lossy', formats: ['AAC'] });
  });

  it('trouve une partie d’un titre Discogs traduit, mais pas le même titre d’un autre artiste', async () => {
    const word = Math.random().toString(36).slice(2, 8);
    const id = await insertAlbum({ title: `Cellokonzerte ${word} • Cello Concertos ${word}`, artist: ['Antonio Vivaldi', 'Mstislav Rostropovich'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([
      album('nd-4', `Cello Concertos ${word}`, 'Mstislav Rostropovich; Paul Sacher'),
      album('nd-5', `Cello Concertos ${word}`, 'Yo-Yo Ma'),
    ]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-4', 'flac'));

    const status = await statusOf(id);
    expect(status.state).toBe('lossless');
    expect(status.matches).toHaveLength(1);
  });

  it('laisse de côté la wish list et dit quand Navidrome n’est pas configuré', async () => {
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(false);
    const wished = await insertAlbum({ title: `Wished ${Math.random()}`, artist: ['X'], status: 'wish' });
    const owned = await insertAlbum({ title: `Owned ${Math.random()}`, artist: ['X'] });

    const res = await request(app).get('/api/music/rip-status');

    expect(res.body.configured).toBe(false);
    const ids = res.body.albums.map((a: { id: number }) => a.id);
    expect(ids).toContain(owned);
    expect(ids).not.toContain(wished);
    expect(res.body.albums.find((a: { id: number }) => a.id === owned).state).toBe('none');
  });
});

describe('navidromeService', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('s’authentifie par jeton salé sans envoyer le mot de passe, et tourne les pages', async () => {
    jest.restoreAllMocks();
    process.env.NAVIDROME_USER = 'dexvault';
    process.env.NAVIDROME_PASSWORD = 'secret';
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `A${i}` }));
    const get = jest.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { 'subsonic-response': { status: 'ok', albumList2: { album: page(500) } } } })
      .mockResolvedValueOnce({ data: { 'subsonic-response': { status: 'ok', albumList2: { album: page(3) } } } });

    expect(await navidromeService.getAlbums()).toHaveLength(503);
    const params = (get.mock.calls[0][1] as { params: Record<string, string> }).params;
    expect(get.mock.calls[0][0]).toBe('http://navidrome:4533/rest/getAlbumList2');
    expect(params).toMatchObject({ u: 'dexvault', f: 'json', offset: 0 });
    expect(JSON.stringify(get.mock.calls)).not.toContain('secret');
    expect((get.mock.calls[1][1] as { params: Record<string, number> }).params.offset).toBe(500);
  });
});

describe('adoption des éditions depuis les rips', () => {
  const musicbrainzService = require('../../src/services/musicbrainzService').default;
  const musicbrainzRefreshService = require('../../src/services/musicbrainzRefreshService').default;
  const Album = require('../../src/models/album').default;
  const musicService = require('../../src/services/musicService').default;

  const insertGrouped = (releaseId: string | null, releaseGroupId: string, title = `CD ${Math.random()}`) =>
    new Promise<number>((resolve, reject) =>
      getDatabase().run(
        `INSERT INTO albums (title, artist, musicbrainz_release_id, musicbrainz_release_group_id, format, title_status) VALUES (?, '["X"]', ?, ?, 'CD', 'owned')`,
        [title, releaseId, releaseGroupId],
        function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
      ));

  const library = (releaseId: string, suffix = 'flac') => {
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd-x', 'Aja', 'Steely Dan', releaseId)]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-x', suffix));
  };

  beforeEach(() => {
    jest.spyOn(musicbrainzRefreshService, 'refreshAlbum').mockResolvedValue({} as any);
  });

  it('remplace le premier pressage venu par celui que Picard a reconnu, puis rafraîchit', async () => {
    const group = `rg-${Math.random()}`;
    const id = await insertGrouped(`first-${Math.random()}`, group);
    const exact = `exact-${Math.random()}`;
    library(exact);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: group } });

    const res = await request(app).post('/api/music/rip-status/sync');

    expect(res.status).toBe(200);
    expect(res.body.editions).toContainEqual(expect.objectContaining({ albumId: id, releaseId: exact, action: 'edition' }));
    expect((await Album.findById(id)).musicbrainzReleaseId).toBe(exact);
    expect(musicbrainzRefreshService.refreshAlbum).toHaveBeenCalledWith(id);
    expect(res.body.status.albums.find((a: { id: number }) => a.id === id)).toMatchObject({ state: 'lossless' });
  });

  it('ne demande le release group à MusicBrainz qu’une fois par édition', async () => {
    const exact = `once-${Math.random()}`;
    library(exact);
    const lookup = jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: `rg-nobody-${Math.random()}` } });

    await ripStatusService.adoptEditions();
    await ripStatusService.adoptEditions();

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('ne touche à rien quand deux CD de la collection sont du même album', async () => {
    const group = `rg-${Math.random()}`;
    const first = await insertGrouped(`a-${Math.random()}`, group);
    await insertGrouped(`b-${Math.random()}`, group);
    library(`exact-${Math.random()}`);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: group } });

    const [result] = await ripStatusService.adoptEditions();

    expect(result).toMatchObject({ skipped: 'several_albums' });
    expect((await Album.findById(first)).musicbrainzReleaseId).toMatch(/^a-/);
  });

  it('attend un rip lossless : un vieux MP3 tagué ne décide rien', async () => {
    const group = `rg-${Math.random()}`;
    const id = await insertGrouped(`first-${Math.random()}`, group);
    library(`exact-${Math.random()}`, 'mp3');
    const lookup = jest.spyOn(musicbrainzService, 'getReleaseDetails');

    expect(await ripStatusService.adoptEditions()).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
    expect((await Album.findById(id)).musicbrainzReleaseId).toMatch(/^first-/);
  });

  it('ajoute à la collection un CD rippé que DexVault ne connaît pas encore', async () => {
    const exact = `new-${Math.random()}`;
    library(exact);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: `rg-new-${Math.random()}` }, media: [{ format: 'CD' }] });
    const add = jest.spyOn(musicService, 'addAlbumFromMusicBrainz').mockResolvedValue({ id: 4242, title: 'Aja' } as any);

    const [result] = await ripStatusService.adoptEditions();

    expect(add).toHaveBeenCalledWith(exact, { titleStatus: 'owned' });
    expect(result).toMatchObject({ albumId: 4242, action: 'added' });
    expect(musicbrainzRefreshService.refreshAlbum).toHaveBeenCalledWith(4242);
  });

  it('n’ajoute pas un album acheté en téléchargement lossless', async () => {
    library(`bandcamp-${Math.random()}`);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: `rg-dl-${Math.random()}` }, media: [{ format: 'Digital Media' }] });
    const add = jest.spyOn(musicService, 'addAlbumFromMusicBrainz');

    const [result] = await ripStatusService.adoptEditions();

    expect(result).toMatchObject({ skipped: 'not_a_cd' });
    expect(add).not.toHaveBeenCalled();
  });

  it('passe dans la collection un album de la wish list qu’on vient de ripper', async () => {
    const group = `rg-${Math.random()}`;
    const id = await new Promise<number>((resolve, reject) =>
      getDatabase().run(
        `INSERT INTO albums (title, artist, musicbrainz_release_id, musicbrainz_release_group_id, format, title_status) VALUES ('Wished', '["X"]', ?, ?, 'CD', 'wish')`,
        [`wish-${Math.random()}`, group],
        function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
      ));
    const exact = `bought-${Math.random()}`;
    library(exact);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: group }, media: [{ format: 'CD' }] });

    const [result] = await ripStatusService.adoptEditions();

    expect(result).toMatchObject({ albumId: id, action: 'promoted' });
    const album = await Album.findById(id);
    expect(album.titleStatus).toBe('owned');
    expect(album.musicbrainzReleaseId).toBe(exact);
  });

  it('garde la pochette et le dos de DexVault quand un rip change l’édition ou sort l’album de la wish list', async () => {
    const covers = async (status: string) => {
      const group = `rg-${Math.random()}`;
      const id = await new Promise<number>((resolve, reject) =>
        getDatabase().run(
          `INSERT INTO albums (title, artist, musicbrainz_release_id, musicbrainz_release_group_id, format, title_status, cover, back_cover)
           VALUES ('With covers', '["X"]', ?, ?, 'CD', ?, '/images/cd/my-front.jpg', '/images/cd/my-back.jpg')`,
          [`first-${Math.random()}`, group, status],
          function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
        ));
      // The rip in Navidrome has no back cover at all: DexVault never reads images from it.
      library(`exact-${Math.random()}`);
      jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: group }, media: [{ format: 'CD' }] });
      ripStatusService.clearCache();
      await ripStatusService.adoptEditions();
      const album = await Album.findById(id);
      return [album.cover, album.backCover];
    };

    expect(await covers('owned')).toEqual(['/images/cd/my-front.jpg', '/images/cd/my-back.jpg']);
    expect(await covers('wish')).toEqual(['/images/cd/my-front.jpg', '/images/cd/my-back.jpg']);
  });

  it('ne fait rien d’un ancien rip ALAC tagué : seuls les rips FLAC de ce circuit comptent', async () => {
    library(`old-alac-${Math.random()}`, 'm4a');
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-x', 'm4a', 16));
    const lookup = jest.spyOn(musicbrainzService, 'getReleaseDetails');
    const add = jest.spyOn(musicService, 'addAlbumFromMusicBrainz');

    expect(await ripStatusService.adoptEditions()).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('n’adopte pas une édition déjà portée par un autre album', async () => {
    const group = `rg-${Math.random()}`;
    const exact = `taken-${Math.random()}`;
    const id = await insertGrouped(`first-${Math.random()}`, group);
    await insertGrouped(exact, `rg-other-${Math.random()}`, 'Other');
    // The edition is known to DexVault, on another album: nothing to adopt.
    library(exact);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: group } });

    expect(await ripStatusService.adoptEditions()).toEqual([]);
    expect((await Album.findById(id)).musicbrainzReleaseId).toMatch(/^first-/);
  });
});

describe('import de la pochette depuis Navidrome', () => {
  const imageService = require('../../src/services/imageService').default;
  const Album = require('../../src/models/album').default;

  const insertWithCover = (title: string) =>
    new Promise<number>((resolve, reject) =>
      getDatabase().run(
        `INSERT INTO albums (title, artist, format, title_status, cover, back_cover) VALUES (?, '["Massive Attack"]', 'CD', 'owned', '/images/cd/old.jpg', '/images/cd/my-back.jpg')`,
        [title],
        function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
      ));

  beforeEach(() => {
    jest.spyOn(imageService, 'saveImage').mockImplementation(async (_d: unknown, type: unknown, name: unknown) => `/api/images/${type}/${name}`);
    jest.spyOn(imageService, 'resizeImage').mockResolvedValue(true);
  });

  it('prend la pochette du rip lossless, pas celle du vieux MP3, et garde le dos', async () => {
    const title = `Mezzanine ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertWithCover(title);
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('mp3', title, 'Massive Attack'), album('flac', title, 'Massive Attack')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue([...songs('mp3', 'mp3'), ...songs('flac', 'flac')]);
    const cover = jest.spyOn(navidromeService, 'getCoverArt').mockResolvedValue({ data: Buffer.from('jpeg'), contentType: 'image/jpeg' });

    const res = await request(app).post(`/api/music/albums/${id}/import-navidrome-cover`);

    expect(res.status).toBe(200);
    expect(cover).toHaveBeenCalledWith('flac');
    const saved = await Album.findById(id);
    expect(saved.cover).toMatch(/^\/api\/images\/cd\/custom\/navidrome_\d+_\d+\.jpg$/);
    expect(saved.backCover).toBe('/images/cd/my-back.jpg');
  });

  it('répond 404 pour un CD absent de Navidrome, sans rien changer', async () => {
    const id = await insertWithCover(`Unripped ${Math.random()}`);
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue([]);

    const res = await request(app).post(`/api/music/albums/${id}/import-navidrome-cover`);

    expect(res.status).toBe(404);
    expect((await Album.findById(id)).cover).toBe('/images/cd/old.jpg');
  });

  it('garde l’ancienne pochette quand Navidrome n’en donne pas', async () => {
    const title = `No art ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertWithCover(title);
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd', title, 'Massive Attack')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd', 'flac'));
    jest.spyOn(navidromeService, 'getCoverArt').mockRejectedValue(new Error('Navidrome has no cover for this album'));

    const res = await request(app).post(`/api/music/albums/${id}/import-navidrome-cover`);

    expect(res.status).toBe(502);
    expect((await Album.findById(id)).cover).toBe('/images/cd/old.jpg');
  });
});

describe('fichiers du rip pour le panneau de piste', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('lit les pistes de l’album Navidrome du CD', async () => {
    const title = `Nightfly ${Math.random().toString(36).slice(2, 8)}`;
    const id = await insertAlbum({ title, artist: ['Donald Fagen'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([album('nd-f', title, 'Donald Fagen')]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs('nd-f', 'flac', 16));
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: { 'subsonic-response': { status: 'ok', album: { song: [
      { title: 'I.G.Y.', track: 1, discNumber: 1, duration: 363, suffix: 'FLAC', bitRate: 900, bitDepth: 16, samplingRate: 44100, channelCount: 2, size: 40000000, path: 'Donald Fagen/The Nightfly/01 I.G.Y..flac' },
    ] } } } });
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
    process.env.NAVIDROME_USER = 'dexvault';
    process.env.NAVIDROME_PASSWORD = 'secret';

    const res = await request(app).get(`/api/music/albums/${id}/navidrome-tracks`);

    expect(res.status).toBe(200);
    expect(get.mock.calls[0][0]).toMatch(/\/rest\/getAlbum$/);
    expect(res.body).toMatchObject({ found: true, album: { id: 'nd-f' } });
    expect(res.body.tracks[0]).toMatchObject({ track: 1, discNumber: 1, suffix: 'flac', bitDepth: 16, samplingRate: 44100 });
  });

  it('répond sans erreur pour un CD pas encore rippé', async () => {
    const id = await insertAlbum({ title: `Unripped ${Math.random()}`, artist: ['Nobody'] });
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue([]);

    const res = await request(app).get(`/api/music/albums/${id}/navidrome-tracks`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: true, found: false, tracks: [] });
  });
});

describe('table des éditions déjà demandées', () => {
  const ReleaseGroupLookup = require('../../src/models/releaseGroupLookup').default;
  const run = (sql: string) => new Promise<void>((resolve, reject) => getDatabase().run(sql, (err: Error | null) => (err ? reject(err) : resolve())));

  it('reprend la table de sa première version, sans colonne is_cd, et redemande ce qu’elle ignore', async () => {
    await run('DROP TABLE release_group_lookups');
    await run('CREATE TABLE release_group_lookups (release_id TEXT PRIMARY KEY, release_group_id TEXT, looked_up_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    await run("INSERT INTO release_group_lookups (release_id, release_group_id) VALUES ('old-row', 'rg-old')");

    await ReleaseGroupLookup.createTable();

    // Whether the old row is a CD was never noted: it is asked again.
    expect(await ReleaseGroupLookup.find('old-row')).toBeUndefined();
    await ReleaseGroupLookup.save('new-row', { releaseGroupId: 'rg-new', isCd: true });
    expect(await ReleaseGroupLookup.find('new-row')).toEqual({ releaseGroupId: 'rg-new', isCd: true });
  });
});
