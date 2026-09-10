import request from 'supertest';
import app from '../../index';
import coverScanService from '../../src/services/coverScanService';
import musicbrainzService from '../../src/services/musicbrainzService';

const IMAGE = 'aGVsbG8=';

const release = (over: Record<string, unknown> = {}) => ({
  musicbrainzReleaseId: 'id',
  title: 'Kind of Blue',
  artist: ['Miles Davis'],
  releaseYear: 1959,
  format: 'CD',
  status: 'Official',
  discs: [],
  ...over
});

const post = (body: Record<string, unknown>) =>
  request(app).post('/api/music/scan-cover').send(body);

afterEach(() => {
  jest.restoreAllMocks();
});

const mockAnalysis = (result: Record<string, unknown>) =>
  jest.spyOn(coverScanService, 'analyzeAlbumImage').mockResolvedValue(result as any);

const mockSearch = (releases: Array<Record<string, unknown>>) => {
  jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue(releases as any);
  jest
    .spyOn(musicbrainzService, 'formatReleaseData')
    .mockImplementation((raw: any) => raw);
};

describe('POST /api/music/scan-cover', () => {
  it('rejects a request without an image', async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image/i);
  });

  it('returns what the model read plus the ranked MusicBrainz matches', async () => {
    mockAnalysis({ artist: 'Miles Davis', title: 'Kind of Blue', year: 1959, format: 'CD' });
    mockSearch([
      release({ musicbrainzReleaseId: 'other', title: 'Milestones' }),
      release({ musicbrainzReleaseId: 'exact' })
    ]);

    const res = await post({ image: IMAGE, mimeType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.llm_result.artist).toBe('Miles Davis');
    expect(res.body.results[0].musicbrainzReleaseId).toBe('exact');
    expect(res.body.confidence).toBe('high');
  });

  it('searches MusicBrainz by artist and title together', async () => {
    mockAnalysis({ artist: 'Talk Talk', title: 'Spirit of Eden', year: 1988, format: 'CD' });
    mockSearch([release({ musicbrainzReleaseId: 'a', title: 'Spirit of Eden', artist: ['Talk Talk'] })]);

    await post({ image: IMAGE });

    const query = (musicbrainzService.searchRelease as jest.Mock).mock.calls[0][0] as string;
    expect(query).toContain('Spirit of Eden');
    expect(query).toContain('Talk Talk');
  });

  it('drops digital-only releases, since we are holding a disc', async () => {
    mockAnalysis({ artist: 'Miles Davis', title: 'Kind of Blue', year: 1959 });
    mockSearch([
      release({ musicbrainzReleaseId: 'digital', format: 'Digital Media' }),
      release({ musicbrainzReleaseId: 'physical', format: 'CD' })
    ]);

    const res = await post({ image: IMAGE });

    expect(res.body.results.map((r: any) => r.musicbrainzReleaseId)).toEqual(['physical']);
  });

  it('answers 422 when the cover could not be identified', async () => {
    jest
      .spyOn(coverScanService, 'analyzeAlbumImage')
      .mockRejectedValue(new Error('Could not extract an album title from the cover image'));

    const res = await post({ image: IMAGE });

    expect(res.status).toBe(422);
  });

  it('answers 503 when the local model is unreachable', async () => {
    jest
      .spyOn(coverScanService, 'analyzeAlbumImage')
      .mockRejectedValue(new Error('Network error: No response received'));

    const res = await post({ image: IMAGE });

    expect(res.status).toBe(503);
  });

  it('reports low confidence and still returns candidates when nothing stands out', async () => {
    mockAnalysis({ artist: 'Various', title: 'Greatest Hits' });
    mockSearch([
      release({ musicbrainzReleaseId: 'one', title: 'Greatest Hits', artist: ['Various'] }),
      release({ musicbrainzReleaseId: 'two', title: 'Greatest Hits', artist: ['Various'] })
    ]);

    const res = await post({ image: IMAGE });

    expect(res.status).toBe(200);
    expect(res.body.confidence).toBe('low');
    expect(res.body.results).toHaveLength(2);
  });

  it('returns an empty result set rather than failing when MusicBrainz knows nothing', async () => {
    mockAnalysis({ artist: 'Nobody', title: 'Nothing' });
    mockSearch([]);

    const res = await post({ image: IMAGE });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.llm_result.title).toBe('Nothing');
  });
});

describe('POST /api/music/scan-cover — when MusicBrainz is down', () => {
  it('still returns what the model read off the cover', async () => {
    mockAnalysis({ artist: 'Massive Attack', title: 'Mezzanine', year: 1998 });
    jest
      .spyOn(musicbrainzService, 'searchRelease')
      .mockRejectedValue(new Error('MusicBrainz is busy or unavailable right now.'));

    const res = await post({ image: IMAGE });

    // The cover was read successfully; only the lookup failed. Throwing that
    // away would force the user to photograph the sleeve all over again.
    expect(res.body.llm_result.artist).toBe('Massive Attack');
    expect(res.body.llm_result.title).toBe('Mezzanine');
    expect(res.body.results).toEqual([]);
    expect(res.body.search_failed).toBe(true);
  });

  it('says the lookup is what failed, not the scan', async () => {
    mockAnalysis({ artist: 'A', title: 'B' });
    jest
      .spyOn(musicbrainzService, 'searchRelease')
      .mockRejectedValue(new Error('MusicBrainz is busy or unavailable right now.'));

    const res = await post({ image: IMAGE });

    expect(res.status).toBe(200);
    expect(res.body.error).toMatch(/musicbrainz/i);
  });
});
