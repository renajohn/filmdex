import axios from 'axios';
import musicbrainzService from '../../src/services/musicbrainzService';

const busy = () => {
  const error: any = new Error('Request failed with status code 503');
  error.isAxiosError = true;
  error.response = { status: 503, data: { error: 'The MusicBrainz web server is currently busy.' } };
  return error;
};

const ok = (releases: unknown[]) => ({ data: { releases } });

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('musicbrainzService.searchRelease — transient failures', () => {
  it('retries when MusicBrainz says it is busy, and returns the later success', async () => {
    jest.useFakeTimers();
    const get = jest
      .spyOn(axios, 'get')
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce(ok([{ id: 'found' }]) as any);

    const pending = musicbrainzService.searchRelease('release:"Kind of Blue"');
    await jest.advanceTimersByTimeAsync(10_000);
    const releases = await pending;

    expect(get).toHaveBeenCalledTimes(2);
    expect(releases).toEqual([{ id: 'found' }]);
  });

  it('gives up after a few attempts with a message naming the cause', async () => {
    jest.useFakeTimers();
    jest.spyOn(axios, 'get').mockRejectedValue(busy());

    const pending = musicbrainzService.searchRelease('release:"Kind of Blue"');
    const assertion = expect(pending).rejects.toThrow(/busy|unavailable|try again/i);
    await jest.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it('does not retry a client error such as a malformed query', async () => {
    const badRequest: any = new Error('Request failed with status code 400');
    badRequest.isAxiosError = true;
    badRequest.response = { status: 400, data: 'bad query' };
    const get = jest.spyOn(axios, 'get').mockRejectedValue(badRequest);

    await expect(musicbrainzService.searchRelease('release:"x"')).rejects.toThrow();

    expect(get).toHaveBeenCalledTimes(1);
  });
});
