import axios from 'axios';
import musicbrainzService from '../../src/services/musicbrainzService';

/**
 * In its own file: requests are paced through module-level state, so sharing a
 * file with the retry tests would make this wait out their simulated delays.
 */
describe('musicbrainzService — client errors', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
