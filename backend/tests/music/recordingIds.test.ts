import '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import Track from '../../src/models/track';
import navidromeService, { type NavidromeTrackFile } from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';
import digitalAlbumService from '../../src/services/digitalAlbumService';
import imageService from '../../src/services/imageService';
import musicbrainzService, { type MBRawRecording } from '../../src/services/musicbrainzService';
import recordingIdService from '../../src/services/recordingIdService';

const tag = () => Math.random().toString(36).slice(2, 8);

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

/** A digital album with its tracks, none with a recording. */
const digitalAlbum = async (title: string, artist: string, tracks: Array<[string, number]>, navidromeId: string | null = null, releaseId: string | null = null) => {
  const id = await run(`INSERT INTO albums (title, artist, format, title_status, navidrome_id, musicbrainz_release_id) VALUES (?, ?, 'Digital Media', 'digital', ?, ?)`,
    [title, JSON.stringify([artist]), navidromeId, releaseId]);
  for (const [index, [name, length]] of tracks.entries()) {
    await Track.create({ albumId: id, discNumber: 1, trackNumber: index + 1, title: name, durationSec: length });
  }
  return id;
};

const file = (title: string, track: number, recording: string | null): NavidromeTrackFile => ({
  id: `f${track}`, url: null, discNumber: 1, track, title, artist: null, musicbrainzRecordingId: recording, isrc: recording ? `ISRC${track}` : null,
  durationSec: 200, suffix: 'flac', bitRate: null, bitDepth: null, samplingRate: null, channelCount: null, size: null, path: null,
});

const release = (id: string, tracks: Array<[string, number, string]>) => ({
  id, 'release-group': { id: `rg-${id}` },
  media: [{ tracks: tracks.map(([title, length, recording], index) => ({ id: `t${index}`, number: String(index + 1), title, length: length * 1000, recording: { id: recording, title } })) }],
});

const recordingsOf = async (albumId: number) => (await Track.findByCdId(albumId)).map(track => track.musicbrainzRecordingId);

beforeEach(() => {
  jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([]);
  jest.spyOn(musicbrainzService, 'searchRecording').mockResolvedValue([]);
});

afterEach(() => jest.restoreAllMocks());

describe('enregistrements MusicBrainz des pistes', () => {
  it('prend les enregistrements des tags d’un album digital, sans demander à MusicBrainz', async () => {
    const id = await digitalAlbum(`Tagged ${tag()}`, 'Keane', [['Somewhere', 237], ['Bend', 220]], `n-${tag()}`, `rel-${tag()}`);
    jest.spyOn(navidromeService, 'getAlbumSongs').mockResolvedValue([file('Somewhere', 1, 'rec-a'), file('Bend', 2, 'rec-b')]);
    const lookup = jest.spyOn(musicbrainzService, 'getReleaseDetails');

    expect(await recordingIdService.fillAlbum(id)).toMatchObject({ fromTags: 2, missing: 0 });
    expect(await recordingsOf(id)).toEqual(['rec-a', 'rec-b']);
    expect((await Track.findByCdId(id))[0].isrc).toBe('ISRC1');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('trouve l’édition d’un album qui n’en a pas par son titre, et en tire ses pistes', async () => {
    const releaseId = `rel-${tag()}`;
    const id = await digitalAlbum(`Hopes ${tag()}`, 'Keane', [['Somewhere Only We Know', 237], ["Everybody's Changing", 215]]);
    jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([{ id: releaseId, score: 100, 'track-count': 2 }] as never);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue(release(releaseId,
      [['Somewhere Only We Know', 238, 'rec-1'], ['Everybody’s Changing', 216, 'rec-2']]) as never);

    expect(await recordingIdService.fillAlbum(id)).toMatchObject({ fromRelease: 2, missing: 0, releaseId });
    expect(await recordingsOf(id)).toEqual(['rec-1', 'rec-2']);
    expect(await Album.findById(id)).toMatchObject({ musicbrainzReleaseId: releaseId, musicbrainzReleaseGroupId: `rg-${releaseId}` });
  });

  it('ne prend pas l’édition d’un autre album du même nom, dont les pistes ne s’accordent pas', async () => {
    const id = await digitalAlbum(`Recital ${tag()}`, 'John Williams', [['La Torre Bermeja', 253], ['Estudio', 132]]);
    jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([{ id: 'other', score: 100, 'track-count': 2 }] as never);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue(release('other',
      [['Suite No. 3 in C major, BWV 1009: Prélude', 250, 'rec-x'], ['Suite No. 1 in G major, BWV 1007: Prélude', 130, 'rec-y']]) as never);

    await recordingIdService.fillAlbum(id);
    expect((await Album.findById(id))!.musicbrainzReleaseId).toBeNull();
    expect(await recordingsOf(id)).toEqual([null, null]);
  });

  it('cherche une piste restée sans enregistrement par son titre et sa durée, chaque enregistrement une fois, et en tire l’édition', async () => {
    const id = await digitalAlbum(`Danses ${tag()}`, 'Bolshoi', [['Casse-noisette, Op. 71: Danse chinoise', 74], ['Casse-noisette, Op. 71: Trépak', 74]]);
    const recording = (recordingId: string, title: string, length: number): MBRawRecording =>
      ({ id: recordingId, title, length: length * 1000, 'artist-credit': [{ name: 'Tchaikovsky' }], releases: [{ id: 'rel-suite', 'release-group': { id: 'rg-suite' } }] });
    jest.spyOn(musicbrainzService, 'searchRecording').mockResolvedValue([
      recording('rec-chinoise', 'Danse chinoise', 73), recording('rec-noisette', 'Noisette', 74), recording('rec-trepak', 'Trépak', 70),
    ]);

    expect(await recordingIdService.fillAlbum(id)).toMatchObject({ fromSearch: 2, missing: 0, releaseId: 'rel-suite' });
    expect(await recordingsOf(id)).toEqual(['rec-chinoise', 'rec-trepak']);
  });

  it('ne remplace jamais un enregistrement déjà là, et reprend plus tard l’album dont une recherche a échoué', async () => {
    const id = await digitalAlbum(`Kept ${tag()}`, 'Moby', [['Porcelain', 241], ['Natural Blues', 252]], null, `rel-${tag()}`);
    const [first] = await Track.findByCdId(id);
    await Track.setRecordingId(first.id, 'rec-mine');
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue(release('r', [['Porcelain', 241, 'rec-theirs']]) as never);
    jest.spyOn(musicbrainzService, 'searchRecording').mockRejectedValue(new Error('MusicBrainz is busy'));

    expect(await recordingIdService.fillAlbum(id)).toMatchObject({ failed: 1, missing: 1 });
    expect(await recordingsOf(id)).toEqual(['rec-mine', null]);

    expect((await recordingIdService.fillAll()).some(result => result.id === id)).toBe(true);
    expect((await recordingIdService.fillAll()).some(result => result.id === id)).toBe(true);
  });

  it('copie l’enregistrement des tags dans les pistes d’un album digital que la sync ajoute', async () => {
    const name = `Play ${tag()}`;
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(navidromeService, 'getCoverArt').mockResolvedValue({ data: Buffer.from('jpg'), contentType: 'image/jpeg' });
    jest.spyOn(imageService, 'saveImage').mockImplementation(async (_data: unknown, type: unknown, fileName: unknown) => `/api/images/${type}/${fileName}`);
    jest.spyOn(navidromeService, 'getAlbumSongs').mockResolvedValue([file('Porcelain', 1, 'rec-p'), file('Natural Blues', 2, null)]);
    ripStatusService.clearCache();
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([{ id: 'n-play', name, artist: 'Moby', musicBrainzId: null, songCount: 2, userRating: 0 }]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue([1, 2].map(track =>
      ({ albumId: 'n-play', id: `s${track}`, suffix: 'flac', bitDepth: null, discNumber: 1, track, durationSec: 200 })) as never);

    await digitalAlbumService.reconcile();
    const digital = (await digitalAlbumService.forNavidromeAlbum('n-play'))!;
    expect(await recordingsOf(digital.id)).toEqual(['rec-p', null]);
  });
});
