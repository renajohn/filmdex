import Album from '../../src/models/album';
import musicService from '../../src/services/musicService';
import musicbrainzService from '../../src/services/musicbrainzService';
import imageService from '../../src/services/imageService';

describe('attachCoverArt — falls back on the release group cover', () => {
  let downloadSpy: jest.SpyInstance;
  let groupSpy: jest.SpyInstance;

  beforeEach(() => {
    downloadSpy = jest
      .spyOn(imageService, 'downloadImageFromUrl')
      .mockResolvedValue('/api/images/cd/x.jpg');
    jest.spyOn(imageService, 'resizeImage').mockResolvedValue(undefined as any);
    jest.spyOn(Album, 'findById').mockResolvedValue({ id: 1, musicbrainzReleaseGroupId: 'group-mbid' } as any);
    jest.spyOn(Album, 'updateFrontCover').mockResolvedValue(undefined as any);
    groupSpy = jest
      .spyOn(musicbrainzService, 'getReleaseGroupCoverArt')
      .mockResolvedValue({ front: { url: 'https://coverartarchive.org/release/other/1-1200.jpg' } } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the release group front when the edition has no image', async () => {
    jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);

    await musicService.attachCoverArt(1, 'release-mbid');

    expect(groupSpy).toHaveBeenCalledWith('group-mbid');
    expect(downloadSpy).toHaveBeenCalledWith('https://coverartarchive.org/release/other/1-1200.jpg', 'cd', expect.any(String));
    expect(Album.updateFrontCover).toHaveBeenCalledWith(1, '/api/images/cd/x.jpg');
  });

  it('keeps the edition front when it has one', async () => {
    jest.spyOn(musicbrainzService, 'getCoverArt')
      .mockResolvedValue({ front: { url: 'https://coverartarchive.org/release/own/1-1200.jpg' } } as any);

    await musicService.attachCoverArt(1, 'release-mbid');

    expect(groupSpy).not.toHaveBeenCalled();
  });
});
