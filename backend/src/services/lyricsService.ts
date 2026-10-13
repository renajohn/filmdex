import axios from 'axios';
import fs from 'fs';
import path from 'path';
import TrackLyrics, { type TrackLyricsFormatted, type TrackToLookUp } from '../models/trackLyrics';
import Album from '../models/album';
import Track from '../models/track';
import navidromeService from './navidromeService';
import ripStatusService from './ripStatusService';
import logger from '../logger';

/**
 * The words of the songs, from LRCLIB (lrclib.net): free, no key, timed lines
 * for most of them. DexVault keeps them to show under a track, and writes them
 * as an .lrc file beside each file of a rip, where Navidrome reads them and
 * hands them to its players, its web player and the apps alike.
 */
const LRCLIB_URL = 'https://lrclib.net/api';
// LRCLIB asks clients to say who they are.
const USER_AGENT = 'DexVault (https://github.com/renajohn/filmdex)';
const TIMEOUT_MS = 15000;
/** A pause between two lookups, to go easy on a free service. */
const PAUSE_MS = 300;
/** A track LRCLIB did not know is asked again after a month. */
const RETRY_MISSING_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
/** Search results this far from the CD's length are another recording. */
const DURATION_TOLERANCE_SEC = 5;
const EVERY_MS = 30 * 60 * 1000;
const BATCH = 200;

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricsLookup {
  status: 'found' | 'instrumental' | 'missing';
  plain: string | null;
  synced: string | null;
  sourceId: string | null;
}

const MISSING: LyricsLookup = { status: 'missing', plain: null, synced: null, sourceId: null };

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const parseList = (text: string | null): string[] => {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [String(value)];
  } catch {
    return [text];
  }
};

/** MusicBrainz writes "‐M‐" and "Jean‐Jacques" with the Unicode hyphen, LRCLIB with the plain one. */
const plainText = (text: string): string => text.replace(/[‐‑‒–—]/g, '-').replace(/[‘’]/g, "'").trim();

/** "Karma Police (Remastered 2009)" and "Angel - Live" are sung as Karma Police and Angel. */
const bareTitle = (title: string): string =>
  plainText(title).replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').replace(/\s+-\s+(live|remaster(ed)?|single|radio edit|mono|stereo)\b.*$/i, '').trim();

/** The artist to ask for: the track's own on a compilation, the album's otherwise. */
export const artistOf = (track: Pick<TrackToLookUp, 'trackArtist' | 'albumArtist'>): string | null => {
  const names = [...parseList(track.trackArtist), ...parseList(track.albumArtist)].map(plainText).filter(Boolean);
  return names[0] ?? null;
};

const fromRecord = (record: LrclibRecord): LyricsLookup => {
  if (record.instrumental) return { status: 'instrumental', plain: null, synced: null, sourceId: String(record.id) };
  if (!record.plainLyrics && !record.syncedLyrics) return MISSING;
  return { status: 'found', plain: record.plainLyrics, synced: record.syncedLyrics, sourceId: String(record.id) };
};

const lrclib = async <T>(endpoint: string, params: Record<string, string | number>): Promise<T | null> => {
  try {
    const response = await axios.get<T>(`${LRCLIB_URL}/${endpoint}`, { params, timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw new Error(`LRCLIB ${endpoint} failed${axios.isAxiosError(error) && error.response ? ` (HTTP ${error.response.status})` : ''}`);
  }
};

/**
 * The best of LRCLIB's search results: about as long as the CD's track, with
 * timed lines before plain ones. Without a length, the first with words.
 */
export const pickResult = (records: LrclibRecord[], durationSec: number | null): LrclibRecord | null => {
  const usable = records.filter(record => record.instrumental || record.plainLyrics || record.syncedLyrics);
  const close = durationSec == null ? usable
    : usable.filter(record => record.duration != null && Math.abs(record.duration - durationSec) <= DURATION_TOLERANCE_SEC);
  return [...close].sort((a, b) =>
    Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics))
    || (durationSec == null ? 0 : Math.abs((a.duration ?? 0) - durationSec) - Math.abs((b.duration ?? 0) - durationSec)))[0] ?? null;
};

/**
 * Looks a track up: the exact entry for this artist, title, album and length
 * first, then a search on the artist and title, then on the title without
 * "(Remastered)" and the like.
 */
export const lookUp = async (track: TrackToLookUp): Promise<LyricsLookup> => {
  const artist = artistOf(track);
  if (!artist) return MISSING;
  const title = plainText(track.title);

  if (track.durationSec) {
    const exact = await lrclib<LrclibRecord>('get', {
      artist_name: artist, track_name: title, album_name: plainText(track.albumTitle), duration: track.durationSec,
    });
    if (exact) {
      const found = fromRecord(exact);
      if (found.status !== 'missing') return found;
    }
  }

  for (const name of [...new Set([title, bareTitle(title)])].filter(Boolean)) {
    const results = await lrclib<LrclibRecord[]>('search', { artist_name: artist, track_name: name });
    const best = pickResult(results || [], track.durationSec);
    if (best) return fromRecord(best);
  }
  return MISSING;
};

/** Looks a track up and keeps what was found, or that nothing was. */
const lookUpAndSave = async (track: TrackToLookUp): Promise<TrackLyricsFormatted> => {
  const found = await lookUp(track);
  await TrackLyrics.save({
    albumId: track.albumId, discNumber: track.discNumber, trackNumber: track.trackNumber, title: track.title,
    status: found.status, plain: found.plain, synced: found.synced, source: found.sourceId ? 'lrclib' : null, sourceId: found.sourceId,
  });
  return (await TrackLyrics.get(track.albumId, track.discNumber, track.trackNumber))!;
};

/** Where the music lies as DexVault sees it: the folder Navidrome reads, mounted in this container too. */
const libraryRoot = (): string | null => {
  const root = process.env.MUSIC_LIBRARY_PATH;
  return root && fs.existsSync(root) ? root : null;
};

/**
 * The file a Navidrome path names. Names on p-cloud are in decomposed Unicode
 * ("e" + accent), Navidrome may hand them back composed: each step of the
 * path is matched by its composed form when the plain one is not there.
 */
export const resolveOnDisk = (root: string, songPath: string): string | null => {
  // Navidrome's own paths are absolute in its container, under /music, as DexVault mounts the library.
  const relative = songPath.startsWith(`${root}/`) ? songPath.slice(root.length + 1)
    : songPath.startsWith('/music/') ? songPath.slice('/music/'.length) : songPath;
  const direct = path.join(root, relative);
  if (fs.existsSync(direct)) return direct;
  let current = root;
  for (const part of relative.split('/').filter(Boolean)) {
    const wanted = part.normalize('NFC');
    let entries: string[];
    try { entries = fs.readdirSync(current); } catch { return null; }
    const match = entries.find(entry => entry === part) ?? entries.find(entry => entry.normalize('NFC') === wanted);
    if (!match) return null;
    current = path.join(current, match);
  }
  return current;
};

/** The .lrc for a track: its timed lines, else its plain words, which Navidrome shows unsynced. */
export const lrcText = (lyrics: Pick<TrackLyricsFormatted, 'synced' | 'plain'>): string | null => {
  const text = lyrics.synced?.trim() || lyrics.plain?.trim();
  return text ? `${text}\n` : null;
};

export interface LrcWriteReport {
  written: number;
  alreadyThere: number;
  notOnDisk: number;
}

let lookingUp = false;

const lyricsService = {
  /** The words of one track, looked up there and then when never asked yet. Null when the CD has no such track. */
  forTrack: async (albumId: number, discNumber: number, trackNumber: number, { again = false } = {}): Promise<TrackLyricsFormatted | null> => {
    const known = await TrackLyrics.get(albumId, discNumber, trackNumber);
    const album = await Album.findById(albumId);
    const track = album && (await Track.findByCdId(albumId)).find(candidate => candidate.discNumber === discNumber && candidate.trackNumber === trackNumber);
    if (!album || !track) return known;
    if (known && !again && known.title === track.title) return known;
    return lookUpAndSave({
      albumId, discNumber, trackNumber, title: track.title, durationSec: track.durationSec,
      trackArtist: JSON.stringify(track.artist || []), albumArtist: JSON.stringify(album.artist || []), albumTitle: album.title,
    });
  },

  /** Looks up every track of the collection that has not been, one at a time. Returns how many were. */
  lookUpMissing: async (): Promise<number> => {
    if (lookingUp) return 0;
    lookingUp = true;
    let done = 0;
    try {
      const retryBefore = new Date(Date.now() - RETRY_MISSING_AFTER_MS).toISOString();
      for (;;) {
        const tracks = await TrackLyrics.toLookUp(retryBefore, BATCH);
        if (tracks.length === 0) break;
        for (const track of tracks) {
          try {
            await lookUpAndSave(track);
            done++;
          } catch (error) {
            // LRCLIB down: stop here, the next pass picks up where this one left.
            logger.warn(`Lyrics lookup stopped after ${done} tracks: ${(error as Error).message}`);
            return done;
          }
          await pause(PAUSE_MS);
        }
      }
      if (done > 0) logger.info(`Lyrics looked up for ${done} tracks`);
      return done;
    } finally {
      lookingUp = false;
    }
  },

  /**
   * Writes an .lrc beside every file of a rip whose track has words and no
   * .lrc yet, then asks Navidrome to scan. An .lrc already there is left as
   * it is, whoever wrote it.
   */
  writeLrcFiles: async (): Promise<LrcWriteReport | null> => {
    const root = libraryRoot();
    if (!root || !navidromeService.isConfigured()) return null;
    const report: LrcWriteReport = { written: 0, alreadyThere: 0, notOnDisk: 0 };
    for (const [albumId, copy] of await ripStatusService.navidromeAlbums()) {
      const lyrics = await TrackLyrics.foundForAlbum(albumId);
      if (lyrics.length === 0) continue;
      const files = await navidromeService.getAlbumSongs(copy.id);
      let realPaths: Array<{ discNumber: number; track: number; path: string }> | null = null;
      for (const words of lyrics) {
        const file = files.find(candidate => candidate.discNumber === words.discNumber && candidate.track === words.trackNumber);
        const text = lrcText(words);
        if (!file || !text) continue;
        let audio = file.path ? resolveOnDisk(root, file.path) : null;
        if (!audio) {
          // Subsonic made the path up from the tags: ask Navidrome's own API, once per album.
          realPaths = realPaths ?? await navidromeService.getSongPaths(copy.id).catch(error => {
            logger.warn(`Navidrome would not say where album ${copy.id} lies: ${(error as Error).message}`);
            return [];
          });
          const real = realPaths.find(candidate => candidate.discNumber === words.discNumber && candidate.track === words.trackNumber);
          audio = real ? resolveOnDisk(root, real.path) : null;
        }
        if (!audio) { report.notOnDisk++; continue; }
        const lrc = audio.slice(0, audio.length - path.extname(audio).length) + '.lrc';
        if (fs.existsSync(lrc)) { report.alreadyThere++; continue; }
        fs.writeFileSync(lrc, text, 'utf8');
        // DexVault runs as root: the file goes to whoever owns the album folder.
        try {
          const { uid, gid } = fs.statSync(path.dirname(audio));
          fs.chownSync(lrc, uid, gid);
        } catch { /* not ours to give away: harmless */ }
        report.written++;
      }
    }
    if (report.notOnDisk > 0) logger.warn(`Lyrics: ${report.notOnDisk} files Navidrome lists were not found under ${root}`);
    if (report.written > 0) {
      logger.info(`Lyrics: ${report.written} .lrc files written beside the rips`);
      await navidromeService.startScan().catch(error => logger.warn(`Navidrome scan not started: ${(error as Error).message}`));
    }
    return report;
  },

  /** Every half hour: the tracks of new CDs, then the .lrc files of new rips. */
  startAutoFetch: (): void => {
    const tick = async () => {
      await lyricsService.lookUpMissing().catch(error => logger.warn(`Lyrics lookup failed: ${(error as Error).message}`));
      await lyricsService.writeLrcFiles().catch(error => logger.warn(`Writing .lrc files failed: ${(error as Error).message}`));
    };
    setTimeout(tick, 2 * 60 * 1000).unref();
    setInterval(tick, EVERY_MS).unref();
  },
};

export default lyricsService;
