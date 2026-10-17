import axios from 'axios';
import Album from '../models/album';
import Track from '../models/track';
import TrackPopularity, { type TrackRank } from '../models/trackPopularity';
import logger from '../logger';

const DEEZER = 'https://api.deezer.com';
/** Deezer allows 50 requests every 5 seconds; an album takes two to four. */
const PAUSE_MS = 1000;
/** Every six hours, the albums never looked up and those looked up more than 90 days ago. */
const EVERY_MS = 6 * 60 * 60 * 1000;
const STALE_MS = 90 * 24 * 60 * 60 * 1000;
const BATCH = 200;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface DeezerAlbum { id: number; title: string; nb_tracks?: number; error?: unknown }
interface DeezerTrack { title: string; isrc?: string; rank: number; disk_number?: number; track_position?: number }

const get = async <T>(path: string): Promise<T | null> => {
  const { data } = await axios.get(path.startsWith('http') ? path : `${DEEZER}${path}`, { timeout: 15000 });
  return data && !data.error ? data as T : null;
};

/** A title without its case, accents, punctuation or what follows in brackets: "Coeur perdu" is "Cœur perdu". */
const plain = (title: string): string => title
  .replace(/[([].*?[)\]]/g, '')
  .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The Deezer album of a CD: by its barcode (12 or 13 digits), else by its artist and title, nearest in tracks. */
const findAlbum = async (artist: string, title: string, barcode: string | null, trackCount: number): Promise<DeezerAlbum | null> => {
  const digits = (barcode || '').replace(/\D/g, '');
  const codes = digits ? [digits, digits.length === 13 && digits.startsWith('0') ? digits.slice(1) : `0${digits}`] : [];
  for (const code of codes) {
    const album = await get<DeezerAlbum>(`/album/upc:${code}`);
    if (album) return album;
  }
  const q = encodeURIComponent(`artist:"${artist}" album:"${title}"`);
  const found = (await get<{ data: DeezerAlbum[] }>(`/search/album?q=${q}&limit=10`))?.data || [];
  const same = found.filter(album => plain(album.title) === plain(title));
  return [...(same.length ? same : found.slice(0, 1))]
    .sort((a, b) => Math.abs((a.nb_tracks ?? 0) - trackCount) - Math.abs((b.nb_tracks ?? 0) - trackCount))[0] || null;
};

const albumTracks = async (albumId: number): Promise<DeezerTrack[]> => {
  const tracks: DeezerTrack[] = [];
  let page: string | undefined = `/album/${albumId}/tracks?limit=200`;
  while (page) {
    const data: { data: DeezerTrack[]; next?: string } | null = await get(page);
    tracks.push(...(data?.data || []));
    page = data?.next;
  }
  return tracks;
};

/**
 * The few tracks of an album that are listened to much more than the rest,
 * as Apple Music points at them: at most a quarter of the album (two to four),
 * each at least 1.3 times the album's median, and none when nothing stands
 * out or Deezer knows too few of the tracks to tell.
 */
export const popularTracks = (ranks: TrackRank[], trackCount: number): Set<string> => {
  const known = ranks.filter(r => r.rank > 0).sort((a, b) => b.rank - a.rank);
  if (known.length < 4 || known.length < trackCount * 0.6) return new Set();
  const middle = known.length / 2;
  const median = known.length % 2 ? known[Math.floor(middle)].rank : (known[middle - 1].rank + known[middle].rank) / 2;
  const most = Math.min(4, Math.max(2, Math.ceil(trackCount / 4)));
  return new Set(known.slice(0, most).filter(r => r.rank >= median * 1.3).map(r => `${r.discNumber}-${r.trackNumber}`));
};

const trackPopularityService = {
  /** Reads how much each track of the album is listened to on Deezer, and keeps it. */
  refreshAlbum: async (albumId: number): Promise<{ deezerAlbumId: string | null; matched: number; tracks: number }> => {
    const album = await Album.findById(albumId);
    if (!album) throw new Error('Album not found');
    const tracks = await Track.findByCdId(albumId);
    const found = tracks.length ? await findAlbum(album.artist[0] || '', album.title, album.barcode, tracks.length) : null;
    const theirs = found ? await albumTracks(found.id) : [];

    // An ISRC is the same recording; else the same place when the two albums have the same tracks; else the same title.
    const byIsrc = new Map(theirs.filter(t => t.isrc).map(t => [t.isrc!.toUpperCase(), t]));
    const samePlaces = theirs.length === tracks.length && theirs.every(t => t.track_position);
    const byPlace = new Map(theirs.map(t => [`${t.disk_number}-${t.track_position}`, t]));
    const byTitle = new Map(theirs.map(t => [plain(t.title), t]));
    const ranks: TrackRank[] = [];
    for (const track of tracks) {
      const isrc = track.isrc?.split(/[,\s]+/)[0]?.toUpperCase();
      const theirsTrack = (isrc && byIsrc.get(isrc))
        || (samePlaces ? byPlace.get(`${track.discNumber}-${track.trackNumber}`) : undefined)
        || byTitle.get(plain(track.title));
      if (theirsTrack?.rank) ranks.push({ discNumber: track.discNumber, trackNumber: track.trackNumber, rank: theirsTrack.rank });
    }
    // Fewer than half the tracks found: another album than this one, best forgotten.
    const kept = ranks.length >= tracks.length / 2 ? ranks : [];
    await TrackPopularity.save(albumId, kept.length && found ? String(found.id) : null, kept);
    return { deezerAlbumId: kept.length && found ? String(found.id) : null, matched: kept.length, tracks: tracks.length };
  },

  /** The albums due, one after the other for Deezer's rate limit. */
  refreshDue: async (): Promise<number> => {
    const ids = await TrackPopularity.findDue(new Date(Date.now() - STALE_MS).toISOString(), BATCH);
    for (const id of ids) {
      await trackPopularityService.refreshAlbum(id)
        .catch(error => logger.warn(`Track popularity of album ${id} not read: ${(error as Error).message}`));
      await sleep(PAUSE_MS);
    }
    if (ids.length) logger.info(`Track popularity read for ${ids.length} albums`);
    return ids.length;
  },

  startAutoRefresh: (): void => {
    // Batch after batch until none is due, so that the first run does the whole collection.
    const tick = async () => {
      try {
        while (await trackPopularityService.refreshDue() === BATCH) { /* the next batch */ }
      } catch (error) {
        logger.warn(`Track popularity failed: ${(error as Error).message}`);
      }
    };
    setTimeout(tick, 5 * 60 * 1000).unref();
    setInterval(tick, EVERY_MS).unref();
  },
};

export default trackPopularityService;
