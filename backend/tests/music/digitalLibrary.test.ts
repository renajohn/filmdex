import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import navidromeService, { type NavidromeSong } from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';
import { changesFrom } from '../../src/services/listenHistoryService';

const tag = () => Math.random().toString(36).slice(2, 8);

const insertAlbum = (title: string, artist: string[], status = 'owned') =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO albums (title, artist, format, title_status) VALUES (?, ?, 'CD', ?)`,
      [title, JSON.stringify(artist), status],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

const album = (id: string, name: string, artist = 'Moby', extra: Record<string, unknown> = {}) =>
  ({ id, name, artist, musicBrainzId: null, songCount: 0, userRating: 0, ...extra });

/** n songs of an album, each with its own play count. */
const tracks = (albumId: string, plays: number[], extra: Partial<NavidromeSong> = {}): NavidromeSong[] =>
  plays.map((playCount, index) => ({
    albumId, id: `${albumId}-${index + 1}`, suffix: 'mp3', bitDepth: null, bitRate: 192, discNumber: 1, track: index + 1,
    durationSec: 200, playCount, played: playCount ? new Date().toISOString() : null, ...extra,
  }));

const mockLibrary = (albums: ReturnType<typeof album>[], songs: NavidromeSong[]) => {
  ripStatusService.clearCache();
  jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue(albums);
  jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs);
};

const libraryAlbum = async (navidromeId: string) => {
  const res = await request(app).get('/api/music/digital');
  expect(res.status).toBe(200);
  return res.body.albums.find((a: { navidromeId: string }) => a.navidromeId === navidromeId);
};

beforeEach(() => {
  ripStatusService.clearCache();
  jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('relevé des écoutes', () => {
  const now = new Date('2026-10-15T12:00:00');

  it('prend tout le compteur d’une piste vue pour la première fois, au jour de sa dernière écoute', () => {
    const changes = changesFrom([{ albumId: 'a', id: 's1', suffix: 'flac', bitDepth: 16, playCount: 3, played: '2026-10-05T18:00:00' }], new Map(), now);
    expect(changes).toEqual([{ songId: 's1', playCount: 3, day: '2026-10-05', plays: 3 }]);
  });

  it('ne compte que ce que le compteur a gagné, et rien quand il n’a pas bougé', () => {
    const known = new Map([['s1', 3], ['s2', 1]]);
    const songs: NavidromeSong[] = [
      { albumId: 'a', id: 's1', suffix: 'mp3', bitDepth: null, playCount: 5, played: '2026-10-14T21:30:00' },
      { albumId: 'a', id: 's2', suffix: 'mp3', bitDepth: null, playCount: 1, played: '2026-10-01T10:00:00' },
      { albumId: 'a', suffix: 'mp3', bitDepth: null, playCount: 9 },
    ];
    expect(changesFrom(songs, known, now)).toEqual([{ songId: 's1', playCount: 5, day: '2026-10-14', plays: 2 }]);
  });

  it('ne compte pas deux fois les mêmes écoutes quand la bibliothèque est relue', async () => {
    const id = `rec-${tag()}`;
    mockLibrary([album(id, `Rec ${tag()}`)], tracks(id, [2, 2, 2]));
    await request(app).get('/api/music/digital?refresh=1');
    await request(app).get('/api/music/digital?refresh=1');

    expect((await libraryAlbum(id)).listening).toMatchObject({ favourites: 3, needed: 3, plays: 6 });
  });
});

describe('qualité des fichiers', () => {
  it('range le MP3 320 en near-lossless, le 192 en lossy avec son débit, et le FLAC 24 bits en hi-res', async () => {
    const [near, lossy, hires] = [`near-${tag()}`, `lossy-${tag()}`, `hires-${tag()}`];
    mockLibrary([album(near, 'Near'), album(lossy, 'Lossy'), album(hires, 'Hires')], [
      ...tracks(near, [0, 0], { bitRate: 320 }),
      ...tracks(lossy, [0, 0], { bitRate: 192 }),
      ...tracks(hires, [0, 0], { suffix: 'flac', bitDepth: 24, samplingRate: 96000, bitRate: 3000 }),
    ]);

    expect(await libraryAlbum(near)).toMatchObject({ quality: 'near', bitRate: 320 });
    expect(await libraryAlbum(lossy)).toMatchObject({ quality: 'lossy', bitRate: 192 });
    expect(await libraryAlbum(hires)).toMatchObject({ quality: 'lossless', bitRate: null, hiRes: true });
  });

  it('juge un album mêlé à ses fichiers compressés', async () => {
    const id = `mixed-${tag()}`;
    mockLibrary([album(id, 'Mixed')], [...tracks(id, [0], { suffix: 'flac', bitDepth: 16 }), ...tracks(`${id}x`, [0], { albumId: id, bitRate: 128 })]);
    expect(await libraryAlbum(id)).toMatchObject({ quality: 'lossy', bitRate: 128, formats: ['FLAC', 'MP3'] });
  });

  it('cache le vieux MP3 d’un CD rippé en FLAC et le signale, et liste le CD sans copie', async () => {
    const [title, bare] = [`Ziggy ${tag()}`, `Cosmo ${tag()}`];
    const cdId = await insertAlbum(title, ['David Bowie']);
    const bareId = await insertAlbum(bare, ['CCR']);
    mockLibrary([album('z-mp3', title, 'David Bowie'), album('z-flac', title, 'David Bowie')], [
      ...tracks('z-mp3', [0, 0]), ...tracks('z-flac', [0, 0], { suffix: 'flac', bitDepth: 16 }),
    ]);

    const res = await request(app).get('/api/music/digital');

    const ids = res.body.albums.map((a: { navidromeId: string }) => a.navidromeId);
    expect(ids).toContain('z-flac');
    expect(ids).not.toContain('z-mp3');
    expect(res.body.albums.find((a: { navidromeId: string }) => a.navidromeId === 'z-flac')).toMatchObject({ cd: { id: cdId }, oldCopy: true });
    expect(res.body.oldCopies).toContainEqual(expect.objectContaining({ albumId: cdId, navidromeId: 'z-mp3', formats: ['MP3'] }));
    expect(res.body.physicalOnly.map((a: { id: number }) => a.id)).toContain(bareId);
  });
});

describe('recommandations d’achat', () => {
  it('recommande un album dont trois titres ont été écoutés deux fois', async () => {
    const id = `buy-${tag()}`;
    mockLibrary([album(id, `Play ${tag()}`)], tracks(id, [2, 3, 2, 1, 0]));
    expect(await libraryAlbum(id)).toMatchObject({ buy: { listened: true, rated: false, wished: false }, listening: { favourites: 3 } });
  });

  it('ne recommande pas un album écouté une seule fois, ni deux titres seulement', async () => {
    const [once, two] = [`once-${tag()}`, `two-${tag()}`];
    mockLibrary([album(once, 'Once'), album(two, 'Two')], [...tracks(once, [1, 1, 1, 1]), ...tracks(two, [2, 2, 1, 1])]);
    expect((await libraryAlbum(once)).buy).toBeNull();
    expect((await libraryAlbum(two)).buy).toBeNull();
  });

  it('demande toutes les pistes d’un album de moins de trois titres', async () => {
    const id = `short-${tag()}`;
    mockLibrary([album(id, 'Short')], tracks(id, [2, 2]));
    expect(await libraryAlbum(id)).toMatchObject({ listening: { needed: 2, favourites: 2 }, buy: { listened: true } });
  });

  it('recommande un album dont une piste a 4 étoiles ou un cœur, ou que l’album en a', async () => {
    const [track, heart, rated] = [`trk-${tag()}`, `heart-${tag()}`, `rated-${tag()}`];
    mockLibrary([album(track, 'Track'), album(heart, 'Heart', 'Moby', { starred: true }), album(rated, 'Rated', 'Moby', { userRating: 5 })], [
      ...tracks(track, [0, 0]).map((song, index) => (index === 0 ? { ...song, userRating: 4 } : song)),
      ...tracks(heart, [0]), ...tracks(rated, [0]),
    ]);
    expect(await libraryAlbum(track)).toMatchObject({ favouriteTracks: 1, buy: { rated: true } });
    expect((await libraryAlbum(heart)).buy).toMatchObject({ rated: true });
    expect((await libraryAlbum(rated)).buy).toMatchObject({ rated: true });
  });

  it('ne recommande jamais un album dont le CD est dans la collection', async () => {
    const title = `Owned ${tag()}`;
    await insertAlbum(title, ['Moby']);
    mockLibrary([album('own-1', title)], tracks('own-1', [5, 5, 5]));
    expect((await libraryAlbum('own-1')).buy).toBeNull();
  });

  it('écarte un album par « Not interested », puis le reprend', async () => {
    const id = `dis-${tag()}`;
    mockLibrary([album(id, 'Dismiss')], tracks(id, [2, 2, 2]));

    const put = await request(app).put(`/api/music/digital/${id}/dismiss`);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ dismissed: true, buy: { listened: true } });

    const del = await request(app).delete(`/api/music/digital/${id}/dismiss`);
    expect(del.body.dismissed).toBe(false);
    expect((await request(app).put('/api/music/digital/nope/dismiss')).status).toBe(404);
  });

  it('donne les pistes d’un album avec leurs écoutes des 90 derniers jours', async () => {
    const id = `trk-${tag()}`;
    mockLibrary([album(id, 'Tracks')], tracks(id, [2, 0]));
    await request(app).get('/api/music/digital');
    jest.spyOn(navidromeService, 'getAlbumSongs').mockResolvedValue([2, 1].map(track => ({
      id: `${id}-${track}`, url: null, discNumber: 1, track, title: `T${track}`, durationSec: 200, suffix: 'mp3',
      bitRate: 192, bitDepth: null, samplingRate: 44100, channelCount: 2, size: 1, path: null,
      playCount: track === 1 ? 2 : 0, played: null, userRating: track === 2 ? 5 : 0, starred: false,
    })));

    const res = await request(app).get(`/api/music/digital/${id}/tracks`);

    expect(res.status).toBe(200);
    expect(res.body.tracks).toEqual([
      expect.objectContaining({ track: 1, plays: 2, rating: 0 }),
      expect.objectContaining({ track: 2, plays: 0, rating: 5 }),
    ]);
  });
});
