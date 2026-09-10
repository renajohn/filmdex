import { getDatabase } from '../../src/database';
import musicService from '../../src/services/musicService';
import musicbrainzService from '../../src/services/musicbrainzService';
import imageService from '../../src/services/imageService';

const RELEASE_ID = 'dup-guard-mbid';

describe('addAlbumFromMusicBrainz — duplicate guard', () => {
  let downloadSpy: jest.SpyInstance;
  let detailsSpy: jest.SpyInstance;
  let coverArtSpy: jest.SpyInstance;

  beforeEach(() => {
    detailsSpy = jest
      .spyOn(musicbrainzService, 'getReleaseDetails')
      .mockResolvedValue({ id: RELEASE_ID } as any);
    jest.spyOn(musicbrainzService, 'formatReleaseData').mockReturnValue({
      title: 'Duplicate Guard',
      artist: ['Test'],
      musicbrainzReleaseId: RELEASE_ID,
      discs: []
    } as any);
    coverArtSpy = jest
      .spyOn(musicbrainzService, 'getCoverArt')
      .mockResolvedValue({ front: { url: 'https://covers.test/front.jpg' } } as any);
    downloadSpy = jest
      .spyOn(imageService, 'downloadImageFromUrl')
      .mockResolvedValue('/api/images/cd/front.jpg');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a release already in the collection without downloading any cover', async () => {
    await musicService.addAlbumFromMusicBrainz(RELEASE_ID);
    downloadSpy.mockClear();
    coverArtSpy.mockClear();

    await expect(musicService.addAlbumFromMusicBrainz(RELEASE_ID)).rejects.toThrow(
      /already exists/i
    );

    // A 409 must not leave orphan files in data/images/cd, nor pay for the
    // Cover Art Archive round trip.
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(coverArtSpy).not.toHaveBeenCalled();
  });

  it('still adds a release that is not in the collection yet', async () => {
    detailsSpy.mockResolvedValue({ id: 'fresh-mbid' } as any);
    jest.spyOn(musicbrainzService, 'formatReleaseData').mockReturnValue({
      title: 'Fresh Album',
      artist: ['Test'],
      musicbrainzReleaseId: 'fresh-mbid',
      discs: []
    } as any);

    const album = await musicService.addAlbumFromMusicBrainz('fresh-mbid');

    expect(album.id).toBeDefined();

    // The cover is attached after the answer, so read it back from the row
    // rather than from the response.
    const coverOf = (id: number): Promise<string | null> =>
      new Promise((resolve, reject) => {
        getDatabase().get('SELECT cover FROM albums WHERE id = ?', [id], (err, row: any) =>
          err ? reject(err) : resolve(row?.cover ?? null)
        );
      });

    const deadline = Date.now() + 3000;
    let cover: string | null = null;
    while (Date.now() < deadline && !cover) {
      cover = await coverOf(album.id);
      if (!cover) await new Promise(r => setTimeout(r, 25));
    }
    expect(cover).toBe('/api/images/cd/front.jpg');
  });
});
