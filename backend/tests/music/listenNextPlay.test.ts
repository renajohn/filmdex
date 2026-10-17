import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import ListenNextPlay from '../../src/models/listenNextPlay';
import navidromeService, { type NavidromeAlbum, type NavidromeTrackFile } from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';
import musicCollectionService from '../../src/services/musicCollectionService';
import listenNextPlaylistService from '../../src/services/listenNextPlaylistService';
import listenNextPlayService from '../../src/services/listenNextPlayService';

const tag = () => Math.random().toString(36).slice(2, 8);

const insertAlbum = (title: string) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO albums (title, artist, format, title_status) VALUES (?, ?, 'CD', 'owned')`,
      [title, JSON.stringify([`Artist ${tag()}`])],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const insertTrack = (albumId: number, disc: number, no: number, durationSec: number | null) =>
  new Promise<void>((resolve, reject) =>
    getDatabase().run('INSERT INTO tracks (album_id, disc_number, track_number, title, duration_sec) VALUES (?, ?, ?, ?, ?)',
      [albumId, disc, no, `${disc}-${no}`, durationSec], (err: Error | null) => (err ? reject(err) : resolve())));

const copy = (id: string): NavidromeAlbum => ({ id, name: id, artist: 'A', musicBrainzId: null, songCount: 3, userRating: 0 });

/** Out of order, as getAlbum may give them: the last is disc 2, track 1. */
const files = (albumId: string): NavidromeTrackFile[] => [[2, 1], [1, 2], [1, 1]].map(([disc, track]) => ({
  id: `${albumId}-${disc}-${track}`, url: null, discNumber: disc, track, title: `${disc}-${track}`, durationSec: 100,
  suffix: 'flac', bitRate: null, bitDepth: 16, samplingRate: 44100, channelCount: 2, size: null, path: null,
}));

const ids = async () => (await musicCollectionService.getListenNextAlbums()).map(album => album.id);

const savedUser = process.env.NAVIDROME_USER;
let first: number;
let second: number;
let third: number;

beforeEach(async () => {
  process.env.NAVIDROME_USER = 'me';
  for (const album of await musicCollectionService.getListenNextAlbums()) await Album.toggleListenNext(album.id);
  await ListenNextPlay.setRepeat(false);
  await new Promise<void>((resolve, reject) =>
    getDatabase().run('DELETE FROM listen_next_departures', (err: Error | null) => (err ? reject(err) : resolve())));
  [first, second, third] = [await insertAlbum(`First ${tag()}`), await insertAlbum(`Second ${tag()}`), await insertAlbum(`Third ${tag()}`)];
  for (const id of [first, second, third]) await Album.toggleListenNext(id);
  jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
  jest.spyOn(navidromeService, 'getAlbumSongs').mockImplementation(async (albumId: string) => files(albumId));
  jest.spyOn(ripStatusService, 'navidromeAlbumFor').mockImplementation(async (id: number) => copy(`nd-${id}`));
  jest.spyOn(listenNextPlaylistService, 'schedule').mockImplementation(() => undefined);
  jest.spyOn(listenNextPlaylistService, 'playlistId').mockResolvedValue('pl-1');
});

afterEach(() => {
  jest.restoreAllMocks();
  if (savedUser === undefined) delete process.env.NAVIDROME_USER; else process.env.NAVIDROME_USER = savedUser;
});

describe('Listen Next lu', () => {
  it('retire un album quand sa dernière piste est scrobblée par NAVIDROME_USER, une seule fois', async () => {
    const departure = await listenNextPlayService.noteScrobble('me', `nd-${second}-2-1`, 1_800_000_000);

    expect(departure).toMatchObject({ albumId: second, leftAt: 1_800_000_000 });
    expect(await ids()).toEqual([first, third]);
    expect(listenNextPlaylistService.schedule).toHaveBeenCalled();
    // The plugin tells the same scrobble again: the album is already gone.
    expect(await listenNextPlayService.noteScrobble('me', `nd-${second}-2-1`)).toBeNull();
  });

  it('ignore une autre piste, un autre compte, et tout quand Repeat est activé', async () => {
    expect(await listenNextPlayService.noteScrobble('me', `nd-${second}-1-2`)).toBeNull();
    expect(await listenNextPlayService.noteScrobble('someone-else', `nd-${second}-2-1`)).toBeNull();
    await listenNextPlayService.setRepeat(true);
    expect(await listenNextPlayService.noteScrobble('me', `nd-${second}-2-1`)).toBeNull();
    expect(await ids()).toEqual([first, second, third]);
  });

  it('Keep here remet l’album à sa place', async () => {
    const departure = await listenNextPlayService.noteScrobble('me', `nd-${second}-2-1`);

    expect(await listenNextPlayService.keep(departure!.id)).toBe(true);
    expect(await ids()).toEqual([first, second, third]);
    expect(await listenNextPlayService.keep(departure!.id)).toBe(false);
  });

  it('donne Repeat, les départs du jour et la longueur de chaque album', async () => {
    await insertTrack(first, 1, 1, 200);
    await insertTrack(first, 2, 1, null);
    const departure = await listenNextPlayService.noteScrobble('me', `nd-${third}-2-1`);

    const state = await listenNextPlayService.getState();

    expect(state.repeat).toBe(false);
    expect(state.playlistId).toBe('pl-1');
    expect(state.playlistUrl).toMatch(/\/app\/#\/playlist\/pl-1\/show$/);
    expect(state.ripped).toEqual([first, second]);
    expect(state.departures.map(d => [d.id, d.albumId, d.album.id, d.beforeAlbumId])).toEqual([[departure!.id, third, third, null]]);
    await listenNextPlayService.noteScrobble('me', `nd-${first}-2-1`);
    expect((await listenNextPlayService.getState()).departures.find(d => d.albumId === first)?.beforeAlbumId).toBe(second);
    expect(state.lengths[first]).toEqual({ discs: 2, tracks: 2, durationSec: 200, missing: 1 });
  });

  it('un album remis à la main dans Listen Next ne part plus', async () => {
    await listenNextPlayService.noteScrobble('me', `nd-${third}-2-1`);
    await Album.toggleListenNext(third);

    expect((await listenNextPlayService.getState()).departures).toEqual([]);
  });

  it('le scrobble du lecteur de DexVault répond avec l’album parti', async () => {
    jest.spyOn(navidromeService, 'scrobble').mockResolvedValue();

    const nowPlaying = await request(app).post(`/api/music/navidrome/scrobble/nd-${first}-2-1`).send({ submission: false });
    expect(nowPlaying.body).toEqual({ ok: true, left: null });

    const played = await request(app).post(`/api/music/navidrome/scrobble/nd-${first}-2-1`).send({ submission: true });
    expect(played.body.left).toMatchObject({ albumId: first });
  });

  it('règle Repeat et garde un album par HTTP', async () => {
    const departure = await listenNextPlayService.noteScrobble('me', `nd-${first}-2-1`);

    expect((await request(app).put('/api/collections/listen-next/repeat').send({ repeat: 'yes' })).status).toBe(400);
    expect((await request(app).put('/api/collections/listen-next/repeat').send({ repeat: true })).body).toEqual({ repeat: true });
    expect((await request(app).get('/api/collections/listen-next/play')).body.repeat).toBe(true);

    const kept = await request(app).post(`/api/collections/listen-next/departures/${departure!.id}/keep`);
    expect(kept.body.albums.map((album: { id: number }) => album.id)).toEqual([first, second, third]);
    expect((await request(app).post('/api/collections/listen-next/departures/999999/keep')).status).toBe(404);
  });
});
