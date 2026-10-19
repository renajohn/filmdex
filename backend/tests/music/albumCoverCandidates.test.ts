import Album from '../../src/models/album';
import albumCoverService from '../../src/services/albumCoverService';
import musicbrainzService from '../../src/services/musicbrainzService';
import discogsService from '../../src/services/discogsService';
import searchCoverService from '../../src/services/searchCoverService';
import imageService from '../../src/services/imageService';

describe('albumCoverService — the covers an album missing one can take', () => {
  beforeEach(() => {
    jest.spyOn(Album, 'findById').mockResolvedValue({
      id: 1, artist: ['Lynyrd Skynyrd'], title: 'Second Helping', format: 'CD',
      musicbrainzReleaseId: 'own', musicbrainzReleaseGroupId: 'group',
      urls: { discogs: 'https://www.discogs.com/release/6820171' }
    } as any);
    jest.spyOn(musicbrainzService, 'getReleasesOfGroup').mockResolvedValue([
      { id: 'vinyl', country: 'US', date: '1974', catalogNumber: 'MCA-413', format: '12" Vinyl', front: true, back: true },
      { id: 'cd', country: 'DE', date: '1991-05', catalogNumber: '811 746-2', format: 'CD', front: true, back: false },
      { id: 'own', country: 'DE', date: '1991', catalogNumber: 'DMCL 1746', format: 'CD', front: false, back: false },
    ]);
    jest.spyOn(musicbrainzService, 'fetchCoverArt').mockImplementation(async (resource: string) => ({
      front: { url: `http://coverartarchive.org/${resource}/front.jpg`, thumbnails: { '500': `http://coverartarchive.org/${resource}/front-500.jpg` } },
      back: { url: `http://coverartarchive.org/${resource}/back.jpg` }
    }) as any);
    jest.spyOn(discogsService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(discogsService, 'getRelease').mockResolvedValue({
      id: 6820171, country: 'Germany', year: 1991, master_id: 70584, labels: [{ catno: 'DMCL 1746' }],
      images: [
        { type: 'primary', uri: 'https://i.discogs.com/front.jpg' },
        { type: 'secondary', uri: 'https://i.discogs.com/back.jpg' },
        { type: 'secondary', uri: 'https://i.discogs.com/disc.jpg' }
      ]
    } as any);
    jest.spyOn(discogsService, 'getMasterCoverArt').mockResolvedValue('https://i.discogs.com/master.jpg');
    jest.spyOn(searchCoverService, 'deezerCover').mockResolvedValue('https://cdn-images.dzcdn.net/cover.jpg');
  });

  afterEach(() => jest.restoreAllMocks());

  it('offers the editions with a front, the same format first, then Discogs and Deezer', async () => {
    const candidates = await albumCoverService.candidates(1, 'front');

    expect(candidates!.map(c => c.source)).toEqual(['Other edition', 'Other edition', 'Discogs', 'Discogs master', 'Deezer']);
    expect(candidates![0]).toMatchObject({ country: 'DE', year: '1991', catalogNumber: '811 746-2', url: 'https://coverartarchive.org/release/cd/front.jpg', thumbnail: 'https://coverartarchive.org/release/cd/front-500.jpg' });
  });

  it('offers every Discogs secondary image for the back, never Deezer', async () => {
    const candidates = await albumCoverService.candidates(1, 'back');

    expect(candidates!.map(c => c.url)).toEqual([
      'https://coverartarchive.org/release/vinyl/back.jpg',
      'https://i.discogs.com/back.jpg',
      'https://i.discogs.com/disc.jpg'
    ]);
    expect(searchCoverService.deezerCover).not.toHaveBeenCalled();
  });

  it('keeps the cover chosen as that side of the album', async () => {
    jest.spyOn(imageService, 'downloadImageFromUrl').mockImplementation(async (_url, _type, filename) => `/api/images/cd/${filename}`);
    jest.spyOn(imageService, 'resizeImage').mockResolvedValue(undefined as any);
    const back = jest.spyOn(Album, 'updateBackCover').mockResolvedValue(undefined as any);

    const coverPath = await albumCoverService.useCover(1, 'back', 'https://i.discogs.com/back.jpg');

    expect(coverPath).toMatch(/^\/api\/images\/cd\/album_1_back_\d+\.jpg$/);
    expect(back).toHaveBeenCalledWith(1, coverPath);
  });

  it('refuses an image from a site covers are not taken from', async () => {
    await expect(albumCoverService.useCover(1, 'front', 'https://evil.example.com/x.jpg')).rejects.toMatchObject({ status: 400 });
  });
});
