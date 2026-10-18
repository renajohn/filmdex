import { getDatabase } from '../database';
import Album from '../models/album';
import Collection from '../models/collection';
import ListenNextPlay, { type ListenNextDeparture } from '../models/listenNextPlay';
import navidromeService from './navidromeService';
import ripStatusService from './ripStatusService';
import listenNextPlaylistService from './listenNextPlaylistService';
import Mixtape from '../models/mixtape';
import logger from '../logger';
import type { AlbumFormatted } from '../types';

/** A departure is shown on the page for a day; after that, the album has simply gone. */
const SHOWN_FOR_SEC = 24 * 60 * 60;
/** An album's last file, kept a while: a scrobble asks it of every album of Listen Next. */
const LAST_SONG_FOR_MS = 10 * 60 * 1000;

export interface AlbumLength {
  discs: number;
  tracks: number;
  durationSec: number;
  /** Tracks whose length is not known: the sum is then a floor. */
  missing: number;
}

export interface ListenNextPlayState {
  repeat: boolean;
  /** The playlist of Listen Next in Navidrome, for Amperfy. */
  playlistId: string | null;
  /** That playlist in Navidrome's web player, for a computer. */
  playlistUrl: string | null;
  /** Each with the album now after its place in the list, null at the end, for the page to show it there. */
  departures: Array<ListenNextDeparture & { album: AlbumFormatted; beforeAlbumId: number | null }>;
  /** The albums of Listen Next with a copy in Navidrome: those the player can play. */
  ripped: number[];
  /** The discs, tracks and length of every album in Listen Next or leaving it, by id. */
  lengths: Record<number, AlbumLength>;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => getDatabase().get(sql, params, (err: Error | null, row: T) => (err ? reject(err) : resolve(row))));

const listenNextId = async (): Promise<number> => {
  const collection = await Collection.findByType('listen_next');
  if (!collection) throw new Error('Listen Next collection not found');
  return collection.id;
};

const lastSongs = new Map<string, { songId: string | null; at: number }>();

/** The last file of an album in Navidrome, last disc, last track. */
const lastSongOf = async (navidromeAlbumId: string): Promise<string | null> => {
  const known = lastSongs.get(navidromeAlbumId);
  if (known && Date.now() - known.at < LAST_SONG_FOR_MS) return known.songId;
  const files = (await navidromeService.getAlbumSongs(navidromeAlbumId)).filter(file => file.id);
  files.sort((a, b) => a.discNumber - b.discNumber || a.track - b.track);
  const songId = files.length > 0 ? files[files.length - 1].id : null;
  lastSongs.set(navidromeAlbumId, { songId, at: Date.now() });
  return songId;
};

let checking: Promise<unknown> = Promise.resolve();

/** Album `albumId` of Listen Next, played, leaves it: its place noted for Keep here, the playlist written again. */
const leave = async (collectionId: number, album: { id: number; title: string }, at: number): Promise<ListenNextDeparture> => {
  const place = await get<{ collection_order: number | null }>(
    'SELECT collection_order FROM album_collections WHERE collection_id = ? AND album_id = ?', [collectionId, album.id]);
  await run('DELETE FROM album_collections WHERE collection_id = ? AND album_id = ?', [collectionId, album.id]);
  const departure = await ListenNextPlay.addDeparture(album.id, place?.collection_order ?? null, at);
  listenNextPlaylistService.schedule();
  logger.info(`Listen Next: "${album.title}" played to its end, out of the list`);
  return departure;
};

/**
 * One album of Listen Next played to its end leaves it, unless Repeat is on:
 * the scrobble of its last file by NAVIDROME_USER says so, whoever played it,
 * DexVault's player or Amperfy. A scrobble told twice (by DexVault, then by
 * the plugin) finds the album gone the second time.
 */
const check = async (user: string, songId: string, at: number): Promise<ListenNextDeparture | null> => {
  const mine = process.env.NAVIDROME_USER || '';
  if (!mine || user !== mine || !navidromeService.isConfigured()) return null;
  if (await ListenNextPlay.getRepeat()) return null;
  const collectionId = await listenNextId();
  for (const album of await Collection.getAlbums(collectionId)) {
    // A mixtape leaves on the scrobble of its own last song.
    const mixtape = await Mixtape.findByAlbumId(album.id);
    if (mixtape) {
      if (mixtape.songs.length > 0 && mixtape.songs[mixtape.songs.length - 1].songId === songId) return leave(collectionId, album, at);
      continue;
    }
    const copy = await ripStatusService.navidromeAlbumFor(album.id);
    if (!copy || await lastSongOf(copy.id) !== songId) continue;
    return leave(collectionId, album, at);
  }
  return null;
};

/** ⏭ on its last track in DexVault's player: the album counts as played, whatever was heard of it. */
const markPlayed = async (albumId: number, at: number): Promise<ListenNextDeparture | null> => {
  if (await ListenNextPlay.getRepeat()) return null;
  const collectionId = await listenNextId();
  const album = (await Collection.getAlbums(collectionId)).find(one => one.id === albumId);
  return album ? leave(collectionId, album, at) : null;
};

const listenNextPlayService = {
  /** Notes a scrobble; the departure it caused, if any. */
  noteScrobble: (user: string, songId: string, at = Math.floor(Date.now() / 1000)): Promise<ListenNextDeparture | null> => {
    const next = checking.then(() => check(user, songId, at));
    checking = next.catch(() => undefined);
    return next;
  },

  /** An album skipped to its end on the Mac: it leaves the list as one played does. The departure, if any. */
  markPlayed: (albumId: number, at = Math.floor(Date.now() / 1000)): Promise<ListenNextDeparture | null> => {
    const next = checking.then(() => markPlayed(albumId, at));
    checking = next.catch(() => undefined);
    return next;
  },

  getState: async (): Promise<ListenNextPlayState> => {
    const collectionId = await listenNextId();
    const inList = new Set((await Collection.getAlbums(collectionId)).map(album => album.id));
    const places = await all<{ album_id: number; collection_order: number | null }>(
      'SELECT album_id, collection_order FROM album_collections WHERE collection_id = ? AND collection_order IS NOT NULL ORDER BY collection_order', [collectionId]);
    const departures: ListenNextPlayState['departures'] = [];
    for (const departure of await ListenNextPlay.departuresSince(Math.floor(Date.now() / 1000) - SHOWN_FOR_SEC)) {
      // Put back in the list by hand since: not leaving any more.
      if (inList.has(departure.albumId)) continue;
      const album = await Album.findById(departure.albumId);
      const order = departure.collectionOrder;
      const after = order == null ? undefined : places.find(place => (place.collection_order as number) >= order);
      if (album) departures.push({ ...departure, album, beforeAlbumId: after?.album_id ?? null });
    }
    const ids = [...inList, ...departures.map(departure => departure.albumId)];
    const lengths: Record<number, AlbumLength> = {};
    if (ids.length > 0) {
      const rows = await all<{ album_id: number; discs: number; tracks: number; duration: number | null; missing: number }>(
        `SELECT album_id, COUNT(DISTINCT disc_number) AS discs, COUNT(*) AS tracks,
           SUM(COALESCE(duration_sec, 0)) AS duration, SUM(duration_sec IS NULL) AS missing
         FROM tracks WHERE album_id IN (${ids.map(() => '?').join(',')}) GROUP BY album_id`, ids);
      for (const row of rows) lengths[row.album_id] = { discs: row.discs, tracks: row.tracks, durationSec: row.duration || 0, missing: row.missing };
    }
    const ripped: number[] = [];
    if (navidromeService.isConfigured()) {
      for (const id of inList) {
        try {
          const mixtape = await Mixtape.findByAlbumId(id);
          if (mixtape ? mixtape.songs.length > 0 : await ripStatusService.navidromeAlbumFor(id)) ripped.push(id);
        } catch (error) {
          logger.warn(`Is album ${id} ripped: ${(error as Error).message}`);
          break;
        }
      }
    }
    let playlistId: string | null = null;
    try {
      playlistId = await listenNextPlaylistService.playlistId();
    } catch (error) {
      logger.warn(`Finding the Listen Next playlist: ${(error as Error).message}`);
    }
    return {
      repeat: await ListenNextPlay.getRepeat(), playlistId, playlistUrl: playlistId ? navidromeService.playlistUrl(playlistId) : null,
      departures, ripped, lengths,
    };
  },

  setRepeat: async (repeat: boolean): Promise<void> => ListenNextPlay.setRepeat(repeat),

  /** Keep here: the album goes back to Listen Next at its place. False when there is no such departure. */
  keep: async (departureId: number): Promise<boolean> => {
    const departure = await ListenNextPlay.findDeparture(departureId);
    if (!departure) return false;
    const collectionId = await listenNextId();
    const there = await all('SELECT 1 FROM album_collections WHERE collection_id = ? AND album_id = ?', [collectionId, departure.albumId]);
    if (there.length === 0) {
      if (departure.collectionOrder != null) {
        await run('UPDATE album_collections SET collection_order = collection_order + 1 WHERE collection_id = ? AND collection_order >= ?',
          [collectionId, departure.collectionOrder]);
      }
      await run('INSERT INTO album_collections (album_id, collection_id, collection_order) VALUES (?, ?, ?)',
        [departure.albumId, collectionId, departure.collectionOrder]);
      listenNextPlaylistService.schedule();
    }
    await ListenNextPlay.markKept(departureId);
    return true;
  },
};

export default listenNextPlayService;
