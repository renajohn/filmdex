import Album from '../../src/models/album';
import musicbrainzService from '../../src/services/musicbrainzService';
import discogsService from '../../src/services/discogsService';
import communityRatingService from '../../src/services/communityRatingService';
import { combineRatings } from '../../src/services/utils/communityRating';

describe('combineRatings', () => {
  it('weighs each source by its votes', () => {
    expect(combineRatings({ value: 4.26, votes: 27 }, { value: 2, votes: 1 })).toEqual({ value: 4.18, votes: 28 });
  });

  it('gives nothing under three votes in all', () => {
    expect(combineRatings({ value: 2, votes: 1 }, { value: null, votes: 0 })).toEqual({ value: null, votes: 1 });
  });

  it('leaves out a source with no votes counted', () => {
    expect(combineRatings({ value: 4.4, votes: 20 }, { value: 3, votes: null })).toEqual({ value: 4.4, votes: 20 });
  });
});

describe('communityRatingService.refreshAlbum', () => {
  let setColumns: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Album, 'findById').mockResolvedValue({
      id: 46, title: 'Fado curvo', musicbrainzReleaseGroupId: 'group-mbid',
      urls: { discogs: 'https://www.discogs.com/release/915881' }
    } as any);
    setColumns = jest.spyOn(Album, 'setColumns').mockResolvedValue(undefined);
    jest.spyOn(discogsService, 'isConfigured').mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('stores both communities\' ratings and votes', async () => {
    jest.spyOn(musicbrainzService, 'getReleaseGroupRating').mockResolvedValue({ value: 2, votes: 1 });
    const discogs = jest.spyOn(discogsService, 'getCommunityRating').mockResolvedValue({ value: 4.26, votes: 27 });

    await communityRatingService.refreshAlbum(46);

    expect(discogs).toHaveBeenCalledWith('915881');
    expect(setColumns).toHaveBeenCalledWith(46, { rating: 2, rating_votes: 1, discogs_rating: 4.26, discogs_rating_votes: 27 });
  });

  it('keeps a source\'s rating when it fails', async () => {
    jest.spyOn(musicbrainzService, 'getReleaseGroupRating').mockRejectedValue(new Error('busy'));
    jest.spyOn(discogsService, 'getCommunityRating').mockResolvedValue({ value: 4.26, votes: 27 });

    const result = await communityRatingService.refreshAlbum(46);

    expect(result.errors).toEqual(['MusicBrainz: busy']);
    expect(setColumns).toHaveBeenCalledWith(46, { discogs_rating: 4.26, discogs_rating_votes: 27 });
  });
});
