import coverScanService from '../../src/services/coverScanService';

const release = (over: Record<string, unknown> = {}) => ({
  musicbrainzReleaseId: 'id',
  title: 'Kind of Blue',
  artist: ['Miles Davis'],
  releaseYear: 1959,
  format: 'CD',
  status: 'Official',
  country: 'US',
  ...over
});

const llm = (over: Record<string, unknown> = {}) => ({
  artist: 'Miles Davis',
  title: 'Kind of Blue',
  year: 1959,
  format: 'CD',
  ...over
});

describe('rankAlbumResults', () => {
  it('puts the release matching artist, title and year first', () => {
    const ranked = coverScanService.rankAlbumResults(
      [
        release({ musicbrainzReleaseId: 'wrong-artist', artist: ['John Coltrane'] }),
        release({ musicbrainzReleaseId: 'exact' }),
        release({ musicbrainzReleaseId: 'wrong-year', releaseYear: 1997 })
      ] as any,
      llm() as any
    );

    expect(ranked[0].musicbrainzReleaseId).toBe('exact');
  });

  it('matches an artist listed among several credited artists', () => {
    const ranked = coverScanService.rankAlbumResults(
      [
        release({ musicbrainzReleaseId: 'other', artist: ['Someone Else'], title: 'Other Record' }),
        release({ musicbrainzReleaseId: 'collab', artist: ['Miles Davis', 'Gil Evans'] })
      ] as any,
      llm() as any
    );

    expect(ranked[0].musicbrainzReleaseId).toBe('collab');
  });

  it('prefers a physical CD over a digital release when everything else ties', () => {
    const ranked = coverScanService.rankAlbumResults(
      [
        release({ musicbrainzReleaseId: 'digital', format: 'Digital Media' }),
        release({ musicbrainzReleaseId: 'cd', format: 'CD' })
      ] as any,
      llm() as any
    );

    expect(ranked[0].musicbrainzReleaseId).toBe('cd');
  });

  it('tolerates a year that is off by one', () => {
    const ranked = coverScanService.rankAlbumResults(
      [
        release({ musicbrainzReleaseId: 'far', releaseYear: 1975 }),
        release({ musicbrainzReleaseId: 'near', releaseYear: 1960 })
      ] as any,
      llm() as any
    );

    expect(ranked[0].musicbrainzReleaseId).toBe('near');
  });

  it('returns the input untouched when the LLM gave nothing', () => {
    const input = [release({ musicbrainzReleaseId: 'a' }), release({ musicbrainzReleaseId: 'b' })];
    const ranked = coverScanService.rankAlbumResults(input as any, null);

    expect(ranked.map((r: any) => r.musicbrainzReleaseId)).toEqual(['a', 'b']);
  });

  it('handles an empty result list', () => {
    expect(coverScanService.rankAlbumResults([], llm() as any)).toEqual([]);
  });

  it('reports high confidence on an exact artist+title+year match that stands alone', () => {
    const ranked = coverScanService.rankAlbumResults(
      [release({ musicbrainzReleaseId: 'exact' })] as any,
      llm() as any
    );

    expect(coverScanService.getConfidence(ranked as any)).toBe('high');
  });

  it('reports low confidence when two releases match equally well', () => {
    const ranked = coverScanService.rankAlbumResults(
      [
        release({ musicbrainzReleaseId: 'one' }),
        release({ musicbrainzReleaseId: 'two' })
      ] as any,
      llm() as any
    );

    expect(coverScanService.getConfidence(ranked as any)).toBe('low');
  });
});
