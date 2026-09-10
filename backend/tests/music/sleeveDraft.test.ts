import { toMusicFormDraft, normaliseMusicFormat } from '../../src/services/sleeveDraft';
import { durationToSeconds } from '../../src/utils/duration';
import type { SleeveTranscription } from '../../src/services/coverScanService';

/**
 * The transcription speaks the sleeve's language; MusicForm speaks the album
 * model's. This is where a field quietly lands nowhere, so it is a pure
 * function with its own tests rather than a few lines inside the endpoint.
 */

const transcription = (over: Partial<SleeveTranscription> = {}): SleeveTranscription => ({
  title: 'Atlas of Small Things',
  artist: ['The Paper Kites Ensemble'],
  label: ['Harmonia Nova'],
  catalogNumber: 'HN-4471-2',
  barcode: '7619931044712',
  year: 2003,
  country: 'Austria',
  format: 'CD',
  genres: ['Classical'],
  truncated: false,
  tracks: [
    { disc: 1, n: 1, title: 'Prelude in C Minor', duration: '3:42' },
    { disc: 1, n: 2, title: 'The Longest Winter', duration: '5:18' }
  ],
  ...over
});

describe('durationToSeconds', () => {
  it('reads the m:ss a sleeve prints', () => {
    expect(durationToSeconds('3:42')).toBe(222);
  });

  it('reads the h:mm:ss a long piece prints', () => {
    expect(durationToSeconds('1:02:30')).toBe(3750);
  });

  it('drops a duration it cannot read rather than calling it zero', () => {
    // A track silently timed at 0:00 is worse than one left blank: the blank
    // is visible in the form, the zero is not.
    expect(durationToSeconds('unknown')).toBeNull();
    expect(durationToSeconds('')).toBeNull();
    expect(durationToSeconds(undefined)).toBeNull();
    expect(durationToSeconds('4:xx')).toBeNull();
  });
});

describe('normaliseMusicFormat', () => {
  it('maps what a sleeve prints onto what the form offers', () => {
    // The form's select has five options; anything else renders blank and
    // saves a value no filter will ever match.
    expect(normaliseMusicFormat('Compact Disc')).toBe('CD');
    expect(normaliseMusicFormat('CD')).toBe('CD');
    expect(normaliseMusicFormat('LP')).toBe('Vinyl');
    expect(normaliseMusicFormat('12" Vinyl')).toBe('Vinyl');
    expect(normaliseMusicFormat('Cassette')).toBe('Cassette');
    expect(normaliseMusicFormat('SACD')).toBe('CD');
  });

  it('falls back to CD when the sleeve says nothing', () => {
    expect(normaliseMusicFormat(null)).toBe('CD');
  });

  it('says Other rather than inventing a category', () => {
    expect(normaliseMusicFormat('MiniDisc')).toBe('Other');
  });
});

describe('toMusicFormDraft', () => {
  it('uses the field names the form actually reads', () => {
    const draft = toMusicFormDraft(transcription());

    expect(draft.title).toBe('Atlas of Small Things');
    expect(draft.artist).toEqual(['The Paper Kites Ensemble']);
    expect(draft.labels).toEqual(['Harmonia Nova']);
    expect(draft.catalogNumber).toBe('HN-4471-2');
    expect(draft.releaseYear).toBe('2003');
    expect(draft.country).toBe('Austria');
    expect(draft.genres).toEqual(['Classical']);
  });

  it('turns the track list into the discs the form edits', () => {
    const draft = toMusicFormDraft(transcription());

    expect(draft.discs).toHaveLength(1);
    expect(draft.discs[0].number).toBe(1);
    expect(draft.discs[0].tracks).toEqual([
      { trackNumber: 1, title: 'Prelude in C Minor', durationSec: 222, isrc: '' },
      { trackNumber: 2, title: 'The Longest Winter', durationSec: 318, isrc: '' }
    ]);
  });

  it('splits a box set onto its discs', () => {
    const draft = toMusicFormDraft(transcription({
      tracks: [
        { disc: 1, n: 1, title: 'Ouverture', duration: '2:11' },
        { disc: 2, n: 1, title: 'Adagio', duration: '7:14' },
        { disc: 1, n: 2, title: 'Le Jardin Perdu', duration: '4:38' }
      ]
    }));

    expect(draft.discs.map(d => d.number)).toEqual([1, 2]);
    expect(draft.discs[0].tracks.map(t => t.title)).toEqual(['Ouverture', 'Le Jardin Perdu']);
    expect(draft.discs[1].tracks.map(t => t.title)).toEqual(['Adagio']);
  });

  it('renumbers a disc whose printed numbers collide', () => {
    // Vinyl restarts at 1 on every side, so a sleeve can print two "1".
    const draft = toMusicFormDraft(transcription({
      tracks: [
        { disc: 1, n: 1, title: 'Side A One', duration: '2:00' },
        { disc: 1, n: 1, title: 'Side B One', duration: '3:00' }
      ]
    }));

    expect(draft.discs[0].tracks.map(t => t.trackNumber)).toEqual([1, 2]);
    expect(draft.discs[0].tracks.map(t => t.title)).toEqual(['Side A One', 'Side B One']);
  });

  it('numbers tracks the sleeve left unnumbered', () => {
    const draft = toMusicFormDraft(transcription({
      tracks: [
        { disc: 1, n: null, title: 'First', duration: null },
        { disc: 1, n: null, title: 'Second', duration: null }
      ]
    }));

    expect(draft.discs[0].tracks.map(t => t.trackNumber)).toEqual([1, 2]);
  });

  it('normalises the format onto the form vocabulary', () => {
    expect(toMusicFormDraft(transcription({ format: 'Compact Disc' })).format).toBe('CD');
  });

  it('carries no identifier that would pass this off as a matched release', () => {
    // A hand-entered album must never look downstream like one Discogs or
    // MusicBrainz answered for.
    const draft = toMusicFormDraft(transcription()) as unknown as Record<string, unknown>;

    expect(draft.musicbrainzReleaseId).toBeUndefined();
    expect(draft.discogsReleaseId).toBeUndefined();
    expect(draft.id).toBeUndefined();
  });

  it('produces an empty but usable draft when the sleeve gave nothing', () => {
    const draft = toMusicFormDraft(transcription({
      title: null, artist: [], label: [], catalogNumber: null, barcode: null,
      year: null, country: null, format: null, genres: [], tracks: []
    }));

    expect(draft.title).toBe('');
    expect(draft.artist).toEqual([]);
    expect(draft.discs).toEqual([]);
    expect(draft.format).toBe('CD');
  });

  it('drops a track with no title rather than adding a blank row', () => {
    const draft = toMusicFormDraft(transcription({
      tracks: [
        { disc: 1, n: 1, title: 'Real', duration: '1:00' },
        { disc: 1, n: 2, title: '', duration: '2:00' }
      ]
    }));

    expect(draft.discs[0].tracks).toHaveLength(1);
  });
});
