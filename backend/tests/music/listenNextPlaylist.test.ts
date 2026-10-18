import request from 'supertest';
import axios from 'axios';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import navidromeService, { type NavidromeAlbum, type NavidromeTrackFile } from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';
import musicCollectionService from '../../src/services/musicCollectionService';
import smartPlaylistService from '../../src/services/smartPlaylistService';
import listenNextPlaylistService, { PLAYLIST_COMMENT, PLAYLIST_NAME } from '../../src/services/listenNextPlaylistService';
import Mixtape from '../../src/models/mixtape';
import ListenNextPlay from '../../src/models/listenNextPlay';

const tag = () => Math.random().toString(36).slice(2, 8);

const insertAlbum = (title: string, status = 'owned', genres: string[] = ['Rock']) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO albums (title, artist, format, title_status, genres) VALUES (?, ?, 'CD', ?, ?)`,
      [title, JSON.stringify([`Artist ${tag()}`]), status, JSON.stringify(genres)],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const copy = (id: string): NavidromeAlbum => ({ id, name: id, artist: 'A', musicBrainzId: null, songCount: 2, userRating: 0 });

/** The songs of a Navidrome album, given out of order as getAlbum may. */
const files = (albumId: string): NavidromeTrackFile[] => [[2, 1], [1, 2], [1, 1]].map(([disc, track]) => ({
  id: `${albumId}-${disc}-${track}`, url: null, discNumber: disc, track, title: `${disc}-${track}`, durationSec: 100,
  suffix: 'flac', bitRate: null, bitDepth: 16, samplingRate: 44100, channelCount: 2, size: null, path: null,
}));

const emptyListenNext = async () => {
  for (const album of await musicCollectionService.getListenNextAlbums()) await Album.toggleListenNext(album.id);
};

beforeEach(async () => {
  await emptyListenNext();
  jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
  jest.spyOn(navidromeService, 'getAlbumSongs').mockImplementation(async (albumId: string) => files(albumId));
  jest.spyOn(navidromeService, 'setPlaylistComment').mockResolvedValue();
});

afterEach(() => jest.restoreAllMocks());

describe('playlist Navidrome de Listen Next', () => {
  it('écrit les albums de Listen Next dans leur ordre, chacun disque par disque, et saute ceux qui ne sont pas rippés', async () => {
    const [first, unripped, second] = [await insertAlbum(`First ${tag()}`), await insertAlbum(`Unripped ${tag()}`), await insertAlbum(`Second ${tag()}`)];
    for (const id of [first, unripped, second]) await Album.toggleListenNext(id);
    jest.spyOn(ripStatusService, 'navidromeAlbumFor').mockImplementation(async (id: number) =>
      id === first ? copy('nd-first') : id === second ? copy('nd-second') : null);
    jest.spyOn(navidromeService, 'getPlaylists').mockResolvedValue([]);
    const save = jest.spyOn(navidromeService, 'savePlaylist').mockResolvedValue('pl-1');

    expect(await listenNextPlaylistService.sync()).toEqual({ playlistId: 'pl-1', albums: 3, notRipped: 1, songs: 6 });

    expect(save).toHaveBeenCalledWith({
      id: undefined, name: PLAYLIST_NAME,
      songIds: ['nd-first-1-1', 'nd-first-1-2', 'nd-first-2-1', 'nd-second-1-1', 'nd-second-1-2', 'nd-second-2-1'],
    });
    expect(navidromeService.setPlaylistComment).toHaveBeenCalledWith('pl-1', PLAYLIST_COMMENT);
  });

  it('écrit une mixtape lue en aléatoire dans l’ordre tiré, le même d’une écriture à l’autre', async () => {
    const mixtape = await insertAlbum(`Mixtape ${tag()}`, 'playlist');
    const songs = ['a', 'b', 'c'].map((id, at) => ({
      songId: id, title: id, artist: 'A', album: 'B', albumId: null, navidromeAlbumId: 'nd-x', discNumber: 1, track: at + 1, durationSec: 100,
    }));
    await Mixtape.save({ albumId: mixtape, playlistId: `pl-${mixtape}`, changed: null, songs });
    await Album.toggleListenNext(mixtape);
    await ListenNextPlay.setShuffle(mixtape, [2, 0, 1]);
    jest.spyOn(navidromeService, 'getPlaylists').mockResolvedValue([]);
    const save = jest.spyOn(navidromeService, 'savePlaylist').mockResolvedValue('pl-1');

    await listenNextPlaylistService.sync();
    await listenNextPlaylistService.sync();

    expect(save.mock.calls.map(([playlist]) => playlist.songIds)).toEqual([['c', 'a', 'b'], ['c', 'a', 'b']]);
    await ListenNextPlay.clearShuffle(mixtape);
    await Album.delete(mixtape);
  });

  it('réécrit sa playlist plutôt que d’en faire une autre, et la vide quand Listen Next l’est', async () => {
    jest.spyOn(navidromeService, 'getPlaylists').mockResolvedValue([
      { id: 'someone', name: PLAYLIST_NAME, owner: 'someone-else', comment: null, songCount: 3, changed: null, readonly: true },
      { id: 'mine', name: PLAYLIST_NAME, owner: process.env.NAVIDROME_USER || '', comment: PLAYLIST_COMMENT, songCount: 9, changed: null, readonly: false },
    ]);
    const save = jest.spyOn(navidromeService, 'savePlaylist').mockResolvedValue('mine');

    await listenNextPlaylistService.sync();

    expect(save).toHaveBeenCalledWith({ id: 'mine', name: PLAYLIST_NAME, songIds: [] });
    expect(navidromeService.setPlaylistComment).not.toHaveBeenCalled();
  });

  it('donne à Subsonic les chansons en répétant songId, dans l’ordre', async () => {
    const saved = { user: process.env.NAVIDROME_USER, password: process.env.NAVIDROME_PASSWORD };
    process.env.NAVIDROME_USER = 'test';
    process.env.NAVIDROME_PASSWORD = 'secret';
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: { 'subsonic-response': { status: 'ok', playlist: { id: 'pl-9' } } } });
    try {
      expect(await navidromeService.savePlaylist({ id: 'pl-9', name: PLAYLIST_NAME, songIds: ['b', 'a'] })).toBe('pl-9');
    } finally {
      if (saved.user === undefined) delete process.env.NAVIDROME_USER; else process.env.NAVIDROME_USER = saved.user;
      if (saved.password === undefined) delete process.env.NAVIDROME_PASSWORD; else process.env.NAVIDROME_PASSWORD = saved.password;
    }
    const [url, config] = get.mock.calls[0] as [string, Record<string, unknown>];
    const query = axios.getUri({ url, ...config } as never);
    expect(query).toContain('playlistId=pl-9');
    expect(query).toMatch(/songId=b&songId=a/);
  });

  it('écrit la playlist peu après qu’un album entre dans Listen Next', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const sync = jest.spyOn(listenNextPlaylistService, 'sync').mockResolvedValue(null);
      const id = await insertAlbum(`Queued ${tag()}`);
      await request(app).put(`/api/music/albums/${id}/listen-next`).expect(200);
      await request(app).put(`/api/music/albums/${id}/listen-next`).expect(200);
      expect(sync).not.toHaveBeenCalled();
      jest.advanceTimersByTime(2500);
      // Two changes in a row, one writing.
      expect(sync).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Help me choose', () => {
  it('pioche dans les CD seulement, ou aussi dans les albums digitaux quand on le demande', async () => {
    jest.spyOn(listenNextPlaylistService, 'schedule').mockImplementation(() => undefined);
    const digitalId = await insertAlbum(`Digital ${tag()}`, 'digital');
    const cds = await smartPlaylistService.getAllAlbumsForSelection();
    const everything = await smartPlaylistService.getAllAlbumsForSelection(true);
    expect(cds.some(album => album.id === digitalId)).toBe(false);
    expect(everything.some(album => album.id === digitalId)).toBe(true);

    const pick = jest.spyOn(smartPlaylistService, 'getAllAlbumsForSelection');
    await request(app).post('/api/collections/listen-next/smart-fill').send({ from: 'any' }).expect(200);
    expect(pick).toHaveBeenLastCalledWith(true);
    await request(app).post('/api/collections/listen-next/smart-fill').expect(200);
    expect(pick).toHaveBeenLastCalledWith(false);
  });
});
