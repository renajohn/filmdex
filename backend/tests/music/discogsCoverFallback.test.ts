import Album from '../../src/models/album';
import musicService from '../../src/services/musicService';
import musicbrainzService from '../../src/services/musicbrainzService';
import discogsService from '../../src/services/discogsService';
import imageService from '../../src/services/imageService';

describe('attachCoverArt — falls back on the linked Discogs release', () => {
  let downloadSpy: jest.SpyInstance;
  let releaseSpy: jest.SpyInstance;

  beforeEach(() => {
    downloadSpy = jest
      .spyOn(imageService, 'downloadImageFromUrl')
      .mockImplementation(async (_url, _type, filename) => `/api/images/cd/${filename}`);
    jest.spyOn(imageService, 'resizeImage').mockResolvedValue(undefined as any);
    jest.spyOn(Album, 'findById').mockResolvedValue({
      id: 1,
      musicbrainzReleaseGroupId: 'group-mbid',
      urls: { discogs: 'https://www.discogs.com/release/2492812' }
    } as any);
    jest.spyOn(Album, 'updateFrontCover').mockResolvedValue(undefined as any);
    jest.spyOn(Album, 'updateBackCover').mockResolvedValue(undefined as any);
    jest.spyOn(musicbrainzService, 'getReleaseGroupCoverArt').mockResolvedValue(null as any);
    jest.spyOn(discogsService, 'isConfigured').mockReturnValue(true);
    releaseSpy = jest.spyOn(discogsService, 'getRelease').mockResolvedValue({
      id: 2492812,
      images: [
        { type: 'primary', uri: 'https://i.discogs.com/front.jpg' },
        { type: 'secondary', uri: 'https://i.discogs.com/back.jpg' }
      ]
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('takes both sides from Discogs when Cover Art Archive has nothing', async () => {
    jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);

    await musicService.attachCoverArt(1, 'release-mbid');

    expect(releaseSpy).toHaveBeenCalledWith('2492812');
    expect(downloadSpy).toHaveBeenCalledWith('https://i.discogs.com/front.jpg', 'cd', expect.any(String));
    expect(downloadSpy).toHaveBeenCalledWith('https://i.discogs.com/back.jpg', 'cd', expect.any(String));
    expect(Album.updateFrontCover).toHaveBeenCalled();
    expect(Album.updateBackCover).toHaveBeenCalled();
  });

  it('only fills the side Cover Art Archive lacks', async () => {
    jest.spyOn(musicbrainzService, 'getCoverArt')
      .mockResolvedValue({ back: { url: 'https://coverartarchive.org/release/own/back-1200.jpg' } } as any);

    await musicService.attachCoverArt(1, 'release-mbid');

    expect(downloadSpy).toHaveBeenCalledWith('https://i.discogs.com/front.jpg', 'cd', expect.any(String));
    expect(downloadSpy).toHaveBeenCalledWith('https://coverartarchive.org/release/own/back-1200.jpg', 'cd', expect.any(String));
    expect(downloadSpy).not.toHaveBeenCalledWith('https://i.discogs.com/back.jpg', 'cd', expect.any(String));
  });

  it('does not ask Discogs when Cover Art Archive has both sides', async () => {
    jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue({
      front: { url: 'https://coverartarchive.org/release/own/front-1200.jpg' },
      back: { url: 'https://coverartarchive.org/release/own/back-1200.jpg' }
    } as any);

    await musicService.attachCoverArt(1, 'release-mbid');

    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('takes the Discogs front when the release group front fails to download', async () => {
    jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);
    jest.spyOn(musicbrainzService, 'getReleaseGroupCoverArt')
      .mockResolvedValue({ front: { url: 'https://coverartarchive.org/release/other/front-1200.jpg' } } as any);
    downloadSpy.mockImplementation(async (url, _type, filename) =>
      url.includes('coverartarchive.org') ? null : `/api/images/cd/${filename}`);

    await musicService.attachCoverArt(1, 'release-mbid');

    expect(downloadSpy).toHaveBeenCalledWith('https://coverartarchive.org/release/other/front-1200.jpg', 'cd', expect.any(String));
    expect(downloadSpy).toHaveBeenCalledWith('https://i.discogs.com/front.jpg', 'cd', expect.any(String));
    expect(Album.updateFrontCover).toHaveBeenCalledWith(1, expect.stringContaining('_front_'));
    expect(Album.updateBackCover).toHaveBeenCalledWith(1, expect.stringContaining('_back_'));
  });

  it('still saves the album when Discogs fails', async () => {
    jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);
    releaseSpy.mockRejectedValue(new Error('429'));

    await expect(musicService.attachCoverArt(1, 'release-mbid')).resolves.toBeUndefined();
    expect(Album.updateFrontCover).not.toHaveBeenCalled();
  });
});
