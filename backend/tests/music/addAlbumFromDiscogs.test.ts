import Album from '../../src/models/album';
import musicService from '../../src/services/musicService';
import discogsService from '../../src/services/discogsService';
import imageService from '../../src/services/imageService';

const RAW = { id: 999001, title: 'Placeholder' };

const mockDiscogs = (over: Record<string, unknown> = {}) => {
  jest.spyOn(discogsService, 'getRelease').mockResolvedValue(RAW as any);
  jest.spyOn(discogsService, 'formatRelease').mockReturnValue({
    discogsReleaseId: '999001',
    musicbrainzReleaseId: null,
    title: 'Drones',
    artist: ['Muse'],
    releaseYear: 2015,
    country: 'Europe',
    format: 'CD',
    labels: ['Helium-3'],
    catalogNumber: 'HELIUM3-001',
    barcode: '0825646121250',
    genres: ['Rock'],
    editionNotes: null,
    status: 'Official',
    coverArt: { front: 'https://i.discogs.com/front.jpg', back: null },
    discs: [{ number: 1, tracks: [{ trackNumber: 1, title: 'Dead Inside', durationSec: 259 }] }],
    discCount: 1,
    totalDuration: 259,
    ...over
  } as any);
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('musicService.addAlbumFromDiscogs', () => {
  it('stores the album with the pressing details Discogs provides', async () => {
    mockDiscogs();
    jest.spyOn(imageService, 'downloadImageFromUrl').mockResolvedValue(null as any);

    const album = await musicService.addAlbumFromDiscogs('999001');

    expect(album.id).toBeDefined();
    const stored = (await Album.findById(album.id))!;
    expect(stored.title).toBe('Drones');
    expect(stored.artist).toEqual(['Muse']);
    expect(stored.discogsReleaseId).toBe('999001');
    expect(stored.barcode).toBe('0825646121250');
    expect(stored.catalogNumber).toBe('HELIUM3-001');
  });

  it('stores the tracklist', async () => {
    mockDiscogs({ discogsReleaseId: '999002' });
    jest.spyOn(discogsService, 'getRelease').mockResolvedValue({ id: 999002 } as any);
    jest.spyOn(imageService, 'downloadImageFromUrl').mockResolvedValue(null as any);

    const album = await musicService.addAlbumFromDiscogs('999002');
    const full = await musicService.getAlbumById(album.id);

    expect(full.discs[0].tracks[0].title).toBe('Dead Inside');
  });

  it('refuses a release already in the collection', async () => {
    mockDiscogs({ discogsReleaseId: '999003' });
    jest.spyOn(imageService, 'downloadImageFromUrl').mockResolvedValue(null as any);

    await musicService.addAlbumFromDiscogs('999003');

    await expect(musicService.addAlbumFromDiscogs('999003')).rejects.toThrow(/already exists/i);
  });

  it('downloads the Discogs cover, whose host must be trusted', async () => {
    mockDiscogs({ discogsReleaseId: '999004' });
    const download = jest
      .spyOn(imageService, 'downloadImageFromUrl')
      .mockResolvedValue('/api/images/cd/discogs.jpg');
    jest.spyOn(imageService, 'resizeImage').mockResolvedValue(undefined as any);

    await musicService.addAlbumFromDiscogs('999004');

    expect(download).toHaveBeenCalledWith(
      'https://i.discogs.com/front.jpg',
      'cd',
      expect.any(String)
    );
  });
});
