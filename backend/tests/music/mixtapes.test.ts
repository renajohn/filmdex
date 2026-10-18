import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import Mixtape from '../../src/models/mixtape';
import ListenNextPlay from '../../src/models/listenNextPlay';
import navidromeService, { type NavidromePlaylist, type NavidromePlaylistEntry } from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';
import musicCollectionService from '../../src/services/musicCollectionService';
import listenNextPlaylistService, { PLAYLIST_NAME } from '../../src/services/listenNextPlaylistService';
import listenNextPlayService from '../../src/services/listenNextPlayService';
import mixtapeService, { applyEdit, artistsOf } from '../../src/services/mixtapeService';

/** Navidrome as the tests make it: playlists by id, each with its songs' ids. */
let playlists: Map<string, { name: string; owner: string; readonly: boolean; songIds: string[]; changed: number }>;
let made = 0;

const entry = (id: string): NavidromePlaylistEntry => ({
  id, title: `Song ${id}`, artist: id.startsWith('b') ? 'Bach' : 'Miles Davis', album: `Album ${id[0]}`, albumId: `nd-${id[0]}`,
  discNumber: 1, track: Number(id.slice(1)) || 1, durationSec: 100,
});

const listed = (id: string): NavidromePlaylist => {
  const one = playlists.get(id)!;
  return { id, name: one.name, owner: one.owner, comment: null, songCount: one.songIds.length, changed: String(one.changed), readonly: one.readonly };
};

const touch = (id: string, change: (one: { name: string; songIds: string[] }) => void) => {
  const one = playlists.get(id)!;
  change(one);
  one.changed++;
};

const savedUser = process.env.NAVIDROME_USER;

const clearMixtapes = async () => {
  for (const record of await Mixtape.all()) await Album.delete(record.albumId);
};

beforeEach(async () => {
  process.env.NAVIDROME_USER = 'me';
  await clearMixtapes();
  for (const album of await musicCollectionService.getListenNextAlbums()) await Album.toggleListenNext(album.id);
  await ListenNextPlay.setRepeat(false);
  playlists = new Map([
    ['p1', { name: 'Sunday mix', owner: 'me', readonly: false, songIds: ['m1', 'b1', 'm2'], changed: 1 }],
    ['smart', { name: 'Recently played', owner: 'me', readonly: true, songIds: ['m1'], changed: 1 }],
    ['theirs', { name: 'Their mix', owner: 'someone', readonly: true, songIds: ['m1'], changed: 1 }],
    ['ln', { name: PLAYLIST_NAME, owner: 'me', readonly: false, songIds: ['m1'], changed: 1 }],
  ]);
  jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
  jest.spyOn(navidromeService, 'getPlaylists').mockImplementation(async () => [...playlists.keys()].map(listed));
  jest.spyOn(navidromeService, 'getPlaylist').mockImplementation(async (id: string) =>
    (playlists.has(id) ? { playlist: listed(id), entries: playlists.get(id)!.songIds.map(entry) } : null));
  jest.spyOn(navidromeService, 'savePlaylist').mockImplementation(async ({ id, name, songIds }) => {
    if (id) { touch(id, one => { one.songIds = songIds; }); return id; }
    const made_ = `new${++made}`;
    playlists.set(made_, { name, owner: 'me', readonly: false, songIds, changed: 1 });
    return made_;
  });
  jest.spyOn(navidromeService, 'renamePlaylist').mockImplementation(async (id: string, name: string) => touch(id, one => { one.name = name; }));
  jest.spyOn(navidromeService, 'deletePlaylist').mockImplementation(async (id: string) => { playlists.delete(id); });
  jest.spyOn(navidromeService, 'getCoverArt').mockRejectedValue(new Error('no cover'));
  jest.spyOn(navidromeService, 'setPlaylistComment').mockResolvedValue(undefined);
  jest.spyOn(ripStatusService, 'navidromeAlbums').mockResolvedValue(new Map());
  jest.spyOn(listenNextPlaylistService, 'schedule').mockImplementation(() => undefined);
});

afterEach(async () => {
  jest.restoreAllMocks();
  if (savedUser === undefined) delete process.env.NAVIDROME_USER; else process.env.NAVIDROME_USER = savedUser;
});

const mixtapeIds = async () => (await mixtapeService.list()).map(one => one.album.id);
const only = async () => {
  const [one] = await mixtapeService.list();
  return one;
};

describe('the songs of a mixtape once changed', () => {
  it('adds at the end only what is not there, removes every copy, moves one', () => {
    expect(applyEdit(['a', 'b'], { add: ['b', 'c', 'c'] })).toEqual(['a', 'b', 'c']);
    expect(applyEdit(['a', 'b', 'a'], { remove: ['a'] })).toEqual(['b']);
    expect(applyEdit(['a', 'b', 'a'], { removeAt: 2 })).toEqual(['a', 'b']);
    expect(applyEdit(['a', 'b', 'c'], { move: { from: 0, to: 2 } })).toEqual(['b', 'c', 'a']);
    expect(applyEdit(['a', 'b'], { move: { from: 0, to: 5 } })).toEqual(['a', 'b']);
  });

  it('names the artists with most songs first', () => {
    expect(artistsOf([{ artist: 'A' }, { artist: 'B' }, { artist: 'B' }, { artist: '' }])).toEqual(['B', 'A']);
  });
});

describe('the mixtapes in step with Navidrome', () => {
  it('takes in the owner\'s own playlists alone, as albums with their songs as tracks', async () => {
    await mixtapeService.refresh(true);
    const [one, ...others] = await mixtapeService.list();
    expect(others).toHaveLength(0);
    expect(one.playlistId).toBe('p1');
    expect(one.songIds).toEqual(['m1', 'b1', 'm2']);
    expect(one.album).toMatchObject({ title: 'Sunday mix', titleStatus: 'playlist', format: 'Mixtape', artist: ['Miles Davis', 'Bach'] });
    // Not a CD: out of the collection's albums.
    expect((await Album.findAll()).some(album => album.id === one.album.id)).toBe(false);
  });

  it('reads a playlist again only once it changed, and follows a new name', async () => {
    await mixtapeService.refresh(true);
    const getPlaylist = navidromeService.getPlaylist as jest.Mock;
    getPlaylist.mockClear();
    await mixtapeService.refresh(true);
    expect(getPlaylist).not.toHaveBeenCalled();

    touch('p1', one => { one.name = 'Sunday best'; });
    await mixtapeService.refresh(true);
    expect((await only()).album.title).toBe('Sunday best');
  });

  it('forgets a playlist deleted in Navidrome, Listen Next included', async () => {
    await mixtapeService.refresh(true);
    const { album } = await only();
    await Album.toggleListenNext(album.id);
    playlists.delete('p1');
    await mixtapeService.refresh(true);
    expect(await mixtapeIds()).toEqual([]);
    expect(await Album.findById(album.id)).toBeNull();
    expect((await musicCollectionService.getListenNextAlbums()).map(one => one.id)).not.toContain(album.id);
  });
});

describe('the search with mixtapes', () => {
  it('finds a mixtape by its name, its songs and their artists, and never among the CDs', async () => {
    await mixtapeService.refresh(true);
    const { album } = await only();
    const found = async (q: string, mixtapes = true) => (await Album.search(q, { mixtapes })).map(one => one.id);
    expect(await found('Sunday')).toContain(album.id);
    expect(await found('Song b1')).toContain(album.id);
    expect(await found('Bach')).toContain(album.id);
    expect(await found('Sunday', false)).not.toContain(album.id);
    expect(await found('Sunday mixtape:no')).not.toContain(album.id);
    expect(await found('rated:no')).not.toContain(album.id);
  });
});

describe('the mixtapes API', () => {
  it('makes a mixtape, adds without a second copy, removes every copy, renames, deletes', async () => {
    const madeOne = await request(app).post('/api/music/mixtapes').send({ name: 'Road trip', songIds: ['m1', 'm1', 'b2'] });
    expect(madeOne.status).toBe(201);
    const id = madeOne.body.id;
    expect(madeOne.body.titleStatus).toBe('playlist');
    expect(playlists.get('new1')!.songIds).toEqual(['m1', 'b2']);

    const added = await request(app).patch(`/api/music/mixtapes/${id}`).send({ add: ['b2', 'm3'] });
    expect(added.status).toBe(200);
    expect(added.body.songs.map((song: { songId: string }) => song.songId)).toEqual(['m1', 'b2', 'm3']);

    // Twice in Navidrome, from Amperfy: removing takes both.
    touch('new1', one => { one.songIds = ['m1', 'b2', 'm1']; });
    const removed = await request(app).patch(`/api/music/mixtapes/${id}`).send({ remove: ['m1'] });
    expect(removed.body.songs.map((song: { songId: string }) => song.songId)).toEqual(['b2']);

    const renamed = await request(app).patch(`/api/music/mixtapes/${id}`).send({ name: '  Road trip ’26 ' });
    expect(renamed.body.album.title).toBe('Road trip ’26');

    expect((await request(app).patch(`/api/music/mixtapes/${id}`).send({ add: ['../x'] })).status).toBe(400);
    expect((await request(app).patch(`/api/music/mixtapes/${id}`).send({ name: '' })).status).toBe(400);

    const deleted = await request(app).delete(`/api/music/mixtapes/${id}`);
    expect(deleted.body).toEqual({ deleted: true });
    expect(playlists.has('new1')).toBe(false);
    expect(await Album.findById(id)).toBeNull();
    expect((await request(app).delete(`/api/music/mixtapes/${id}`)).status).toBe(404);
  });

  it('lists the mixtapes with their songs\' ids', async () => {
    await mixtapeService.refresh(true);
    const res = await request(app).get('/api/music/mixtapes');
    expect(res.status).toBe(200);
    expect(res.body.mixtapes.map((one: { playlistId: string; songIds: string[] }) => [one.playlistId, one.songIds])).toEqual([['p1', ['m1', 'b1', 'm2']]]);
  });
});

describe('a mixtape in Listen Next', () => {
  it('goes into the playlist for Amperfy in its own order, and leaves on its last song\'s scrobble', async () => {
    await mixtapeService.refresh(true);
    const { album } = await only();
    await Album.toggleListenNext(album.id);
    expect((await listenNextPlayService.getState()).ripped).toContain(album.id);

    (listenNextPlaylistService.schedule as jest.Mock).mockRestore();
    const save = navidromeService.savePlaylist as jest.Mock;
    save.mockClear();
    await listenNextPlaylistService.sync();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'ln', songIds: ['m1', 'b1', 'm2'] }));
    jest.spyOn(listenNextPlaylistService, 'schedule').mockImplementation(() => undefined);

    expect(await listenNextPlayService.noteScrobble('me', 'b1')).toBeNull();
    expect(await listenNextPlayService.noteScrobble('me', 'm2')).toMatchObject({ albumId: album.id });
    expect((await musicCollectionService.getListenNextAlbums()).map(one => one.id)).not.toContain(album.id);
  });
});

afterAll(async () => {
  await clearMixtapes();
  await new Promise<void>((resolve, reject) =>
    getDatabase().run('DELETE FROM listen_next_departures', (err: Error | null) => (err ? reject(err) : resolve())));
});
