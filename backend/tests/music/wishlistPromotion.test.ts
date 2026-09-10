import Album from '../../src/models/album';
import musicService from '../../src/services/musicService';
import musicbrainzService from '../../src/services/musicbrainzService';
import imageService from '../../src/services/imageService';

const mockRelease = (mbid: string, title: string) => {
  jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ id: mbid } as any);
  jest.spyOn(musicbrainzService, 'formatReleaseData').mockReturnValue({
    title,
    artist: ['Test'],
    musicbrainzReleaseId: mbid,
    discs: []
  } as any);
  jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);
  jest.spyOn(imageService, 'downloadImageFromUrl').mockResolvedValue(null as any);
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('addAlbumFromMusicBrainz — an album already on the wish list', () => {
  it('moves it into the collection instead of refusing the add', async () => {
    const mbid = 'wish-to-owned';
    const wished = await Album.create({
      title: 'Wished Album',
      artist: ['Test'],
      musicbrainzReleaseId: mbid,
      titleStatus: 'wish'
    } as any);

    mockRelease(mbid, 'Wished Album');
    const result = await musicService.addAlbumFromMusicBrainz(mbid, { titleStatus: 'owned' } as any);

    // Same record, promoted -- not a second row.
    expect(result.id).toBe(wished.id);
    expect((await Album.findById(wished.id))!.titleStatus).toBe('owned');
  });

  it('records the ownership details supplied with the promotion', async () => {
    const mbid = 'wish-with-details';
    const wished = await Album.create({
      title: 'Wished With Details',
      artist: ['Test'],
      musicbrainzReleaseId: mbid,
      titleStatus: 'wish'
    } as any);

    mockRelease(mbid, 'Wished With Details');
    await musicService.addAlbumFromMusicBrainz(mbid, {
      titleStatus: 'owned',
      condition: 'NM',
      priceChf: '14.90'
    } as any);

    const album = (await Album.findById(wished.id))!;
    expect(album.ownership.condition).toBe('NM');
    expect(album.ownership.priceChf).toBe(14.9);
  });

  it('still refuses an album already owned', async () => {
    const mbid = 'already-owned';
    await Album.create({
      title: 'Owned Album',
      artist: ['Test'],
      musicbrainzReleaseId: mbid,
      titleStatus: 'owned'
    } as any);

    mockRelease(mbid, 'Owned Album');

    await expect(
      musicService.addAlbumFromMusicBrainz(mbid, { titleStatus: 'owned' } as any)
    ).rejects.toThrow(/already exists/i);
  });
});
