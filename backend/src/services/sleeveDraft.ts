import { durationToSeconds } from '../utils/duration';
import type { SleeveTranscription } from './coverScanService';

/**
 * Translating a sleeve into the shape MusicForm edits.
 *
 * The transcription speaks the sleeve's language -- tracks in one flat list,
 * durations as printed, "Compact Disc" -- and the form speaks the album
 * model's: discs holding tracks, seconds, and a select with five options. A
 * field that misses on the way across does not fail loudly, it simply arrives
 * empty and the user retypes it, so the crossing is a pure function with its
 * own tests.
 */

export interface DraftTrack {
  trackNumber: number;
  title: string;
  durationSec: number | null;
  isrc: string;
}

export interface DraftDisc {
  number: number;
  tracks: DraftTrack[];
}

export interface MusicFormDraft {
  title: string;
  artist: string[];
  releaseYear: string;
  labels: string[];
  catalogNumber: string;
  barcode: string;
  country: string;
  format: string;
  genres: string[];
  discs: DraftDisc[];
}

/** The five values MusicForm's Format select offers. */
const FORM_FORMATS = ['CD', 'Vinyl', 'Cassette', 'Digital Media', 'Other'] as const;

/**
 * Map what a sleeve prints onto what the form offers.
 *
 * A value outside the select's vocabulary renders the control blank and saves
 * a string no filter will match, so "Compact Disc" has to become "CD" here.
 */
export const normaliseMusicFormat = (printed: string | null | undefined): string => {
  if (!printed) return 'CD';
  const value = printed.trim().toLowerCase();

  if (FORM_FORMATS.some(f => f.toLowerCase() === value)) {
    return FORM_FORMATS.find(f => f.toLowerCase() === value)!;
  }
  if (/\b(cd|compact disc|sacd|hdcd|cdr)\b/.test(value)) return 'CD';
  if (/\b(vinyl|lp|ep|45|33|12"|7"|10")/.test(value)) return 'Vinyl';
  if (/\b(cassette|tape|mc)\b/.test(value)) return 'Cassette';
  if (/\b(digital|file|download|flac|mp3|streaming)\b/.test(value)) return 'Digital Media';

  return 'Other';
};

/** Group the flat track list onto discs, in the order the sleeve prints them. */
const toDiscs = (transcription: SleeveTranscription): DraftDisc[] => {
  const byDisc = new Map<number, DraftTrack[]>();

  for (const track of transcription.tracks) {
    if (!track.title?.trim()) continue;
    const disc = Number.isFinite(track.disc) && track.disc > 0 ? track.disc : 1;
    if (!byDisc.has(disc)) byDisc.set(disc, []);
    byDisc.get(disc)!.push({
      trackNumber: Number.isFinite(track.n as number) ? (track.n as number) : 0,
      title: track.title.trim(),
      durationSec: durationToSeconds(track.duration),
      isrc: ''
    });
  }

  return Array.from(byDisc.entries())
    .sort(([a], [b]) => a - b)
    .map(([number, tracks]) => {
      // Vinyl restarts numbering on every side and some sleeves print no
      // numbers at all, so a disc can arrive with duplicates or zeroes. Keep
      // the printed order and renumber when that happens.
      const numbers = tracks.map(t => t.trackNumber);
      const needsRenumber =
        numbers.some(n => n <= 0) || new Set(numbers).size !== numbers.length;

      return {
        number,
        tracks: needsRenumber
          ? tracks.map((t, i) => ({ ...t, trackNumber: i + 1 }))
          : tracks
      };
    });
};

/**
 * Only the fields the form edits cross over.
 *
 * Nothing that identifies a release in an external database is carried, even
 * if a model invented one: a hand-entered album must never be mistaken
 * downstream for one Discogs or MusicBrainz answered for.
 */
export const toMusicFormDraft = (transcription: SleeveTranscription): MusicFormDraft => ({
  title: transcription.title || '',
  artist: transcription.artist,
  releaseYear: transcription.year ? String(transcription.year) : '',
  labels: transcription.label,
  catalogNumber: transcription.catalogNumber || '',
  barcode: transcription.barcode || '',
  country: transcription.country || '',
  format: normaliseMusicFormat(transcription.format),
  genres: transcription.genres,
  discs: toDiscs(transcription)
});

export default { toMusicFormDraft, normaliseMusicFormat };
