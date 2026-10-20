import Album from '../models/album';
import Track from '../models/track';
import navidromeService from './navidromeService';
import musicbrainzService, { type MBRawRecording } from './musicbrainzService';
import musicbrainzLinkService from './musicbrainzLinkService';
import logger from '../logger';
import type { AlbumFormatted, TrackFormatted } from '../types';

/**
 * Every track of the collection, CD or digital, carries its MusicBrainz
 * recording: it is what tells the same song on two albums. A digital album's
 * files mostly name it, Picard having tagged them. Otherwise the album's
 * edition names it, the edition being searched by title when the album has
 * none, and a track still left takes the recording a search by its title and
 * length finds. These last two are guesses, close enough to tell one song
 * from another; a recording already there is never replaced.
 */

export interface RecordingIdsResult {
  id: number;
  title: string;
  fromTags: number;
  fromRelease: number;
  fromSearch: number;
  /** Tracks still without a recording. */
  missing: number;
  /** Searches MusicBrainz did not answer: the album is tried again at the next sync. */
  failed: number;
  /** The edition found for an album that had none. */
  releaseId: string | null;
  error?: string;
}

/** A track of a MusicBrainz edition or a recording found by search, as a track is paired with it. */
interface Candidate {
  title: string;
  durationSec: number | null;
  recordingId: string;
  isrc: string | null;
  discNumber?: number;
  trackNumber?: number;
}

type SearchedRelease = { id: string; score?: number; 'track-count'?: number };

const normalize = (text: string): string => musicbrainzLinkService.normalize(text.replace(/['’`]/g, ''));

/**
 * 1 for the same title; one holding the other ("Carmina Burana: I. O Fortuna"
 * and "Carmina Burana: Fortuna Imperatrix Mundi: O Fortuna") by how much of
 * it the shorter one is, so that "Noisette" is not "Casse-noisette, Op. 71,
 * Acte II: Coda"; else the words they share.
 */
const titleLikeness = (a: string, b: string): number => {
  const [x, y] = [normalize(a), normalize(b)];
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [wordsX, wordsY] = [new Set(x.split(' ')), new Set(y.split(' '))];
  if (` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `)) {
    return 0.4 + 0.6 * Math.min(wordsX.size, wordsY.size) / Math.max(wordsX.size, wordsY.size);
  }
  const shared = [...wordsX].filter(word => wordsY.has(word)).length;
  return shared / new Set([...wordsX, ...wordsY]).size;
};

/** The title above all, the length to part two takes of a song, the place on the disc when both have one. */
const likeness = (track: TrackFormatted, candidate: Candidate): number => {
  const gap = track.durationSec && candidate.durationSec ? Math.abs(track.durationSec - candidate.durationSec) : null;
  const length = gap === null ? 0 : gap <= 3 ? 0.5 : gap <= 10 ? 0.2 : gap > 60 ? -0.5 : 0;
  const place = candidate.trackNumber !== undefined && candidate.discNumber === track.discNumber
    && candidate.trackNumber === track.trackNumber ? 0.2 : 0;
  return titleLikeness(track.title, candidate.title) + length + place;
};

const PAIRED = 0.7;

/**
 * Each track with the candidate most like it, the likest pairs first, each
 * candidate taken once. The titles must have something in common: a length
 * and a place alike are another album's track.
 */
const pair = (tracks: TrackFormatted[], candidates: Candidate[]): Map<TrackFormatted, Candidate> => {
  const scored = tracks.flatMap(track => candidates.map(candidate => ({ track, candidate, score: likeness(track, candidate) })))
    .filter(entry => entry.score >= PAIRED && titleLikeness(entry.track.title, entry.candidate.title) >= 0.3)
    .sort((a, b) => b.score - a.score);
  const pairs = new Map<TrackFormatted, Candidate>();
  const taken = new Set<Candidate>();
  for (const { track, candidate } of scored) {
    if (pairs.has(track) || taken.has(candidate)) continue;
    pairs.set(track, candidate);
    taken.add(candidate);
  }
  return pairs;
};

const tracksOfRelease = async (releaseId: string): Promise<{ groupId: string | null; tracks: Candidate[] }> => {
  const release = await musicbrainzService.getReleaseDetails(releaseId);
  return {
    groupId: release['release-group']?.id ?? null,
    tracks: (release.media || []).flatMap((medium, discIndex) => (medium.tracks || [])
      .filter(track => track.recording?.id)
      .map((track, index) => ({
        title: track.title,
        durationSec: track.length ? Math.round(track.length / 1000) : null,
        recordingId: track.recording!.id,
        isrc: track.recording!.isrcs?.[0] ?? null,
        discNumber: discIndex + 1,
        trackNumber: parseInt(track.number, 10) || index + 1,
      }))),
  };
};

/** Lucene's own signs taken out, for a title in a query. */
const escape = (text: string): string => text.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The edition whose tracks pair best with the album's, among those a search
 * by title finds, the ones with as many tracks first. Half the tracks at
 * least must pair, or it is another album of the same name.
 */
const findRelease = async (album: AlbumFormatted, tracks: TrackFormatted[]) => {
  const title = escape(album.title);
  // "Orff: Carmina Burana" is also filed as "Carmina Burana".
  const work = escape(album.title.split(':').slice(1).join(' '));
  const artist = escape(album.artist[0] || '');
  const queries = [
    ...(artist ? [`release:"${title}" AND artist:"${artist}"`, `release:(${title}) AND artist:(${artist})`] : []),
    `release:"${title}"`,
    ...(work ? [`release:"${work}"`] : []),
  ];
  const found = new Map<string, SearchedRelease>();
  for (const query of queries) {
    for (const release of await musicbrainzService.searchRelease(query, 25) as SearchedRelease[]) {
      if (!found.has(release.id)) found.set(release.id, release);
    }
  }
  const ranked = [...found.values()]
    .sort((a, b) => Math.abs((a['track-count'] ?? 0) - tracks.length) - Math.abs((b['track-count'] ?? 0) - tracks.length)
      || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 4);
  let best: { id: string; groupId: string | null; pairs: Map<TrackFormatted, Candidate> } | null = null;
  for (const release of ranked) {
    const { groupId, tracks: candidates } = await tracksOfRelease(release.id);
    const pairs = pair(tracks, candidates);
    if (!best || pairs.size > best.pairs.size) best = { id: release.id, groupId, pairs };
  }
  return best && best.pairs.size >= Math.max(2, Math.ceil(tracks.length / 2)) ? best : null;
};

/** The words of a name, "Orchestra of the Bolshoi Theatre & Alexander Kopilov" found under a credit spelt otherwise. */
const ENSEMBLE_WORDS = new Set(['orchestra', 'orchestre', 'symphony', 'symphonic', 'philharmonic', 'philharmonia', 'chamber', 'theatre', 'theater',
  'chorus', 'choir', 'ensemble', 'quartet', 'band', 'national', 'state', 'radio', 'opera', 'academy', 'festival', 'london', 'great']);
const sameArtist = (credits: string[], artists: string[]): boolean => {
  const names = artists.map(normalize).filter(Boolean);
  const own = (text: string) => text.split(' ').filter(word => word.length > 3 && !ENSEMBLE_WORDS.has(word));
  return credits.map(normalize).filter(Boolean).some(credit => names.some(name => name === credit
    || own(credit).some(word => own(name).includes(word))));
};

/**
 * The recording a search by the track's title finds: by the album's artist
 * first, then by the composer an album "Tchaikovsky: Casse-noisette" is
 * named after, with the movement alone ("Marche"), then by the length alone.
 * One whose title is only alike must be by the artist, and a length known on
 * both sides must agree within ten seconds; the very last chance takes any
 * title alike enough at the same length. A performance MusicBrainz does not
 * have gets another of the same piece.
 */
const searchRecording = async (track: TrackFormatted, album: AlbumFormatted, taken: Set<string>): Promise<MBRawRecording | null> => {
  const title = escape(track.title);
  if (!title) return null;
  const length = track.durationSec
    ? ` AND dur:[${(track.durationSec - 5) * 1000} TO ${(track.durationSec + 5) * 1000}]` : '';
  const artists = [...(track.artist || []), ...album.artist];
  const artist = escape(artists.find(Boolean) || '');
  const composer = album.title.includes(':') ? escape(album.title.split(':')[0]) : '';
  const movement = track.title.includes(':') ? escape(track.title.split(':').pop()!) : '';
  const queries = [
    ...(artist ? [`recording:"${title}" AND artist:"${artist}"`, `recording:(${title}) AND artist:(${artist})`] : []),
    ...(composer && movement ? [`recording:(${movement}) AND artist:(${composer})${length}`, `recording:(${movement}) AND artist:(${composer})`] : []),
    `recording:"${title}"${length}`,
    // Long classical titles are never written twice the same: their words, then.
    `recording:(${title})${length}`,
  ];
  if (composer) artists.push(composer);
  type Scored = { recording: MBRawRecording; gap: number | null; alike: number; score: number; byArtist: boolean };
  const seen: Scored[] = [];
  for (const query of queries) {
    const scored = (await musicbrainzService.searchRecording(query, 15)).filter(recording => !taken.has(recording.id)).map(recording => {
      const durationSec = recording.length ? Math.round(recording.length / 1000) : null;
      const gap = track.durationSec && durationSec ? Math.abs(track.durationSec - durationSec) : null;
      const byArtist = sameArtist((recording['artist-credit'] || []).map(credit => credit.name || credit.artist?.name || ''), artists);
      // A movement against a movement: the work's name they share says nothing of which part it is.
      const alike = movement
        ? Math.max(titleLikeness(movement, recording.title.split(':').pop()!), titleLikeness(movement, recording.title) * 0.8)
        : titleLikeness(track.title, recording.title);
      return { recording, gap, alike, score: likeness(track, { title: recording.title, durationSec, recordingId: recording.id, isrc: null }) + (byArtist ? 0.3 : 0), byArtist };
    }).sort((a, b) => b.score - a.score);
    const best = scored.find(entry => (entry.gap === null || entry.gap <= 10) && (entry.alike >= 0.6 || (entry.alike >= 0.3 && entry.byArtist)));
    if (best) return best.recording;
    seen.push(...scored);
  }
  // The last chances: the same composer or artist at about the same length, a title alike at the same length, a title alike.
  seen.sort((a, b) => b.score - a.score);
  return (seen.find(entry => entry.byArtist && entry.alike >= 0.2 && entry.gap !== null && entry.gap <= 10)
    ?? seen.find(entry => entry.alike >= 0.3 && entry.gap !== null && entry.gap <= 5)
    ?? seen.find(entry => entry.alike >= 0.5))?.recording ?? null;
};

/** Sets the edition unless another album already has it: the index wants one album per edition. */
const setRelease = async (album: AlbumFormatted, releaseId: string, groupId: string | null): Promise<boolean> => {
  try {
    await Album.setReleaseId(album.id, releaseId);
  } catch (error) {
    if (/UNIQUE/i.test((error as Error).message)) return false;
    throw error;
  }
  if (groupId) await Album.setReleaseGroupId(album.id, groupId);
  return true;
};

/** Albums tried since the start: an album nothing was found for is not searched again every half hour. */
const tried = new Set<number>();

const recordingIdService = {
  /** Fills in the recordings one album's tracks lack, and its edition when it has none. */
  fillAlbum: async (albumId: number): Promise<RecordingIdsResult> => {
    const album = await Album.findById(albumId);
    if (!album) throw new Error('Album not found');
    const result: RecordingIdsResult = { id: album.id, title: album.title, fromTags: 0, fromRelease: 0, fromSearch: 0, missing: 0, failed: 0, releaseId: null };
    const missing = async () => (await Track.findByCdId(album.id)).filter(track => !track.musicbrainzRecordingId);

    let left = await missing();
    if (left.length > 0 && album.navidromeId) {
      const files = await navidromeService.getAlbumSongs(album.navidromeId);
      for (const track of left) {
        const file = files.find(candidate => candidate.discNumber === track.discNumber && candidate.track === track.trackNumber);
        if (!file?.musicbrainzRecordingId) continue;
        await Track.setRecordingId(track.id, file.musicbrainzRecordingId, file.isrc ?? null);
        result.fromTags++;
      }
      left = await missing();
    }

    if (album.musicbrainzReleaseId && left.length > 0) {
      const pairs = pair(left, (await tracksOfRelease(album.musicbrainzReleaseId)).tracks);
      for (const [track, candidate] of pairs) await Track.setRecordingId(track.id, candidate.recordingId, candidate.isrc);
      result.fromRelease = pairs.size;
    } else if (!album.musicbrainzReleaseId) {
      const tracks = await Track.findByCdId(album.id);
      const release = tracks.length > 0 ? await findRelease(album, tracks) : null;
      if (release && await setRelease(album, release.id, release.groupId)) result.releaseId = release.id;
      if (release) {
        for (const [track, candidate] of release.pairs) {
          if (track.musicbrainzRecordingId) continue;
          await Track.setRecordingId(track.id, candidate.recordingId, candidate.isrc);
          result.fromRelease++;
        }
      }
    }
    left = await missing();

    // The editions the recordings found are on, the commonest first: the album's own when it still has none.
    const editions = new Map<string, { count: number; groupId: string | null }>();
    // A recording is one track of an album, not two.
    const taken = new Set((await Track.findByCdId(album.id)).map(track => track.musicbrainzRecordingId).filter((id): id is string => Boolean(id)));
    for (const track of left) {
      let recording: MBRawRecording | null;
      try {
        recording = await searchRecording(track, album, taken);
      } catch (error) {
        result.failed++;
        logger.warn(`Track ${track.id} "${track.title}": no recording searched: ${(error as Error).message}`);
        continue;
      }
      if (!recording) continue;
      taken.add(recording.id);
      await Track.setRecordingId(track.id, recording.id, recording.isrcs?.[0] ?? null);
      result.fromSearch++;
      for (const release of recording.releases || []) {
        const edition = editions.get(release.id) ?? { count: 0, groupId: release['release-group']?.id ?? null };
        editions.set(release.id, { ...edition, count: edition.count + 1 });
      }
    }
    if (!album.musicbrainzReleaseId && !result.releaseId) {
      for (const [releaseId, { groupId }] of [...editions].sort((a, b) => b[1].count - a[1].count)) {
        if (await setRelease(album, releaseId, groupId)) {
          result.releaseId = releaseId;
          break;
        }
      }
    }

    result.missing = (await missing()).length;
    logger.info(`Album ${album.id} "${album.title}": recordings from tags ${result.fromTags}, edition ${result.fromRelease}, search ${result.fromSearch}, `
      + `${result.missing} missing${result.releaseId ? `, edition ${result.releaseId} found` : ''}`);
    return result;
  },

  /** The album's tracks were made again: its recordings are looked for again too. */
  forget: (albumId: number): void => {
    tried.delete(albumId);
  },

  /**
   * Every album of the collection and every digital album lacking a recording
   * or an edition, one after the other for MusicBrainz's rate limit, each once
   * since the start.
   */
  fillAll: async (): Promise<RecordingIdsResult[]> => {
    const albums = [...await Album.findAll(), ...await Album.findByStatus('digital')].filter(album => !tried.has(album.id));
    const results: RecordingIdsResult[] = [];
    for (const album of albums) {
      const lacking = !album.musicbrainzReleaseId
        || (await Track.findByCdId(album.id)).some(track => !track.musicbrainzRecordingId);
      if (!lacking) continue;
      tried.add(album.id);
      try {
        const result = await recordingIdService.fillAlbum(album.id);
        if (result.failed > 0) tried.delete(album.id);
        results.push(result);
      } catch (error) {
        tried.delete(album.id);
        logger.warn(`Album ${album.id} "${album.title}": recordings not filled in: ${(error as Error).message}`);
        results.push({ id: album.id, title: album.title, fromTags: 0, fromRelease: 0, fromSearch: 0, missing: 0, failed: 0, releaseId: null, error: (error as Error).message });
      }
    }
    return results;
  },
};

export default recordingIdService;
