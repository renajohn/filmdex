import axios from 'axios';
import musicbrainzService from '../../src/services/musicbrainzService';

/**
 * MusicBrainz allows one request per second per client and answers 429 beyond
 * that, so requests have to be spaced out rather than fired in parallel.
 */
describe('musicbrainzService — request pacing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('spaces consecutive requests about a second apart', async () => {
    jest.useFakeTimers();
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: { releases: [] } } as any);

    const first = musicbrainzService.searchRelease('release:"one"');
    const second = musicbrainzService.searchRelease('release:"two"');

    // Let the first one through.
    await jest.advanceTimersByTimeAsync(10);
    expect(get).toHaveBeenCalledTimes(1);

    // The second must still be waiting its turn.
    await jest.advanceTimersByTimeAsync(500);
    expect(get).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1500);
    expect(get).toHaveBeenCalledTimes(2);

    await Promise.all([first, second]);
  });
});
