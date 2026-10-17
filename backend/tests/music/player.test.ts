import request from 'supertest';
import { Readable } from 'stream';
import app from '../../index';
import navidromeService from '../../src/services/navidromeService';

afterEach(() => jest.restoreAllMocks());

describe('DexVault’s player', () => {
  it('hands on a song’s bytes from Navidrome, a seek included', async () => {
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
    const stream = jest.spyOn(navidromeService, 'stream').mockResolvedValue({
      status: 206,
      headers: { 'content-type': 'audio/flac', 'content-range': 'bytes 10-13/100', 'content-length': '4', 'accept-ranges': 'bytes' },
      data: Readable.from([Buffer.from('fLaC')]),
    });

    const res = await request(app).get('/api/music/navidrome/stream/abc123').set('Range', 'bytes=10-13');

    expect(res.status).toBe(206);
    expect(res.headers['content-type']).toBe('audio/flac');
    expect(res.headers['content-range']).toBe('bytes 10-13/100');
    expect(res.body.toString()).toBe('fLaC');
    expect(stream).toHaveBeenCalledWith('abc123', 'bytes=10-13');
  });

  it('refuses what is not a song id, and a song Navidrome does not know', async () => {
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
    expect((await request(app).get('/api/music/navidrome/stream/..%2Fetc')).status).toBe(400);

    jest.spyOn(navidromeService, 'stream').mockResolvedValue({
      status: 200, headers: { 'content-type': 'application/json' }, data: Readable.from(['{}']),
    });
    expect((await request(app).get('/api/music/navidrome/stream/nope')).status).toBe(404);
  });

  it('tells Navidrome a song is playing, then that it was listened to', async () => {
    const scrobble = jest.spyOn(navidromeService, 'scrobble').mockResolvedValue();

    await request(app).post('/api/music/navidrome/scrobble/abc123').send({ submission: false }).expect(200);
    await request(app).post('/api/music/navidrome/scrobble/abc123').send({ submission: true }).expect(200);

    expect(scrobble.mock.calls).toEqual([['abc123', false], ['abc123', true]]);
  });
});
