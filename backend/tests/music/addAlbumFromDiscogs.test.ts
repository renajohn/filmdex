import Album from '../../src/models/album';
import musicService from '../../src/services/musicService';
import discogsService from '../../src/services/discogsService';
import imageService from '../../src/services/imageService';
import musicbrainzService from '../../src/services/musicbrainzService';

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

describe('addAlbumFromDiscogs — cover art when the release has none', () => {
  const mockBare = (id: string) => {
    jest.spyOn(discogsService, 'getRelease').mockResolvedValue({ id: Number(id), master_id: 555 } as any);
    jest.spyOn(discogsService, 'formatRelease').mockReturnValue({
      discogsReleaseId: id,
      musicbrainzReleaseId: null,
      title: 'Telling Stories',
      artist: ['Tracy Chapman'],
      releaseYear: 2001,
      format: 'CD',
      labels: [],
      catalogNumber: null,
      barcode: '075596247028',
      genres: [],
      editionNotes: null,
      status: 'Official',
      coverArt: { front: null, back: null },
      discs: [],
      discCount: 0,
      totalDuration: null,
      masterId: 555
    } as any);
  };

  it('never asks Cover Art Archive about a Discogs id', async () => {
    mockBare('990101');
    const caa = jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);
    jest.spyOn(discogsService, 'getMasterCoverArt').mockResolvedValue(null);

    await musicService.addAlbumFromDiscogs('990101');

    // Cover Art Archive is keyed on MusicBrainz ids; a Discogs id gets a 400.
    expect(caa).not.toHaveBeenCalled();
  });

  it('falls back to the Discogs master release, which usually has artwork', async () => {
    mockBare('990102');
    jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);
    const master = jest
      .spyOn(discogsService, 'getMasterCoverArt')
      .mockResolvedValue('https://i.discogs.com/master.jpg');
    const download = jest
      .spyOn(imageService, 'downloadImageFromUrl')
      .mockResolvedValue('/api/images/cd/master.jpg');
    jest.spyOn(imageService, 'resizeImage').mockResolvedValue(undefined as any);

    const album = await musicService.addAlbumFromDiscogs('990102');

    expect(master).toHaveBeenCalledWith(555);
    expect(download).toHaveBeenCalledWith('https://i.discogs.com/master.jpg', 'cd', expect.any(String));
    expect((await Album.findById(album.id))!.cover).toBe('/api/images/cd/master.jpg');
  });

  it('still stores the album when no artwork exists anywhere', async () => {
    mockBare('990103');
    jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);
    jest.spyOn(discogsService, 'getMasterCoverArt').mockResolvedValue(null);

    const album = await musicService.addAlbumFromDiscogs('990103');

    expect(album.id).toBeDefined();
    expect((await Album.findById(album.id))!.cover).toBeNull();
  });
});
