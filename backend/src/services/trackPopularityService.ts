import axios from 'axios';
import Album from '../models/album';
import Track from '../models/track';
import TrackPopularity, { type TrackRank } from '../models/trackPopularity';
import logger from '../logger';

const DEEZER = 'https://api.deezer.com';
const LISTENBRAINZ = 'https://api.listenbrainz.org/1/popularity/recording';
/** ListenBrainz takes a few hundred recordings at once; an opera has more. */
const LISTENBRAINZ_CHUNK = 100;
/** Under this, in the album's middle track, too few listen on ListenBrainz for its counts to say anything. */
const ENOUGH_LISTENS = 500;
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
  // The same title, else one holding the other ("Whitney The Greatest Hits" for "The Greatest Hits"), else the first found.
  const ours = plain(title);
  const same = found.filter(album => plain(album.title) === ours);
  const near = found.filter(album => ours && (plain(album.title).includes(ours) || ours.includes(plain(album.title))));
  return [...(same.length ? same : near.length ? near : found.slice(0, 1))]
    .sort((a, b) => Math.abs((a.nb_tracks ?? 0) - trackCount) - Math.abs((b.nb_tracks ?? 0) - trackCount))[0] || null;
};

/** A best-of, by MusicBrainz's word or, for an album from Discogs, by its title. */
export const isCompilation = (album: { title: string; releaseGroupSecondaryTypes?: string[] }): boolean =>
  (album.releaseGroupSecondaryTypes || []).includes('Compilation')
  || /\b(greatest hits|best of|the very best|singles|anthology|collection|essential)\b/i.test(album.title);

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

/** How many times each recording was listened to on ListenBrainz, by MusicBrainz id. */
const listensOf = async (recordingIds: string[]): Promise<Map<string, number>> => {
  const listens = new Map<string, number>();
  for (let i = 0; i < recordingIds.length; i += LISTENBRAINZ_CHUNK) {
    const { data } = await axios.post(LISTENBRAINZ, { recording_mbids: recordingIds.slice(i, i + LISTENBRAINZ_CHUNK) }, { timeout: 15000 });
    for (const row of data as Array<{ recording_mbid: string; total_listen_count: number | null }>) {
      if (row.total_listen_count) listens.set(row.recording_mbid, row.total_listen_count);
    }
  }
  return listens;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** How clean a break must be: ListenBrainz counts listens, Deezer's rank squeezes them together. */
interface Break {
  /** The last track pointed at against the next one. */
  gap: number;
  /** The last track pointed at against the middle of those left. */
  aboveRest: number;
}
const LISTENBRAINZ_BREAK: Break = { gap: 1.25, aboveRest: 1.4 };
const DEEZER_BREAK: Break = { gap: 1.1, aboveRest: 1.2 };

/**
 * The tracks above the deepest clean break among the album's first four, as
 * Apple Music points at them: Hotel California's three before Wasted Time,
 * Animals's three long pieces before the two short ones. At least two tracks
 * are left unmarked, and none is marked when nothing stands out or too few of
 * the tracks are known to tell.
 */
const standOut = (ranks: Array<{ key: string; value: number }>, trackCount: number, needed: Break): Set<string> => {
  const known = ranks.filter(r => r.value > 0).sort((a, b) => b.value - a.value);
  if (known.length < 4 || known.length < trackCount * 0.6) return new Set();
  for (let count = Math.min(4, known.length - 2); count > 0; count--) {
    const last = known[count - 1].value;
    const rest = median(known.slice(count).map(r => r.value));
    if (last >= known[count].value * needed.gap && last >= rest * needed.aboveRest) {
      return new Set(known.slice(0, count).map(r => r.key));
    }
  }
  return new Set();
};

/**
 * ListenBrainz's listens are real counts, far apart from a hit to the rest,
 * and taken when there are enough of them; else Deezer's rank, known for
 * more albums but squeezed together on the well-known ones.
 */
export const popularTracks = (ranks: TrackRank[], trackCount: number): Set<string> => {
  const of = (value: (r: TrackRank) => number | null) =>
    ranks.map(r => ({ key: `${r.discNumber}-${r.trackNumber}`, value: value(r) ?? 0 }));
  const listens = of(r => r.listens).filter(r => r.value > 0);
  const byListens = listens.length >= trackCount * 0.6 && median(listens.map(r => r.value)) >= ENOUGH_LISTENS;
  return byListens
    ? standOut(of(r => r.listens), trackCount, LISTENBRAINZ_BREAK)
    : standOut(of(r => r.rank), trackCount, DEEZER_BREAK);
};

const trackPopularityService = {
  /** Reads how much each track of the album is listened to on Deezer and ListenBrainz, and keeps it. */
  refreshAlbum: async (albumId: number): Promise<{ deezerAlbumId: string | null; matched: number; tracks: number }> => {
    const album = await Album.findById(albumId);
    if (!album) throw new Error('Album not found');
    const tracks = await Track.findByCdId(albumId);
    // Deezer ranks a compilation's own copies of the songs, rarely played: its order says nothing of the songs.
    const found = tracks.length && !isCompilation(album) ? await findAlbum(album.artist[0] || '', album.title, album.barcode, tracks.length) : null;
    const theirs = found ? await albumTracks(found.id) : [];
    const listens = await listensOf(tracks.map(t => t.musicbrainzRecordingId).filter((id): id is string => Boolean(id)));

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
      ranks.push({
        discNumber: track.discNumber,
        trackNumber: track.trackNumber,
        rank: theirsTrack?.rank || null,
        listens: (track.musicbrainzRecordingId && listens.get(track.musicbrainzRecordingId)) || null,
      });
    }
    // Fewer than half the tracks found on Deezer: another album than this one, its ranks best forgotten.
    const onDeezer = ranks.filter(r => r.rank).length >= tracks.length / 2;
    const kept = ranks
      .map(r => (onDeezer ? r : { ...r, rank: null }))
      .filter(r => r.rank || r.listens);
    const deezerAlbumId = onDeezer && found ? String(found.id) : null;
    await TrackPopularity.save(albumId, deezerAlbumId, kept);
    return { deezerAlbumId, matched: kept.length, tracks: tracks.length };
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
