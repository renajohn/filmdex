import request from 'supertest';
import app from '../../index';
import musicService from '../../src/services/musicService';

const post = (source: string, releaseId: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/music/releases/${source}/${releaseId}`).send(body);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/music/releases/:source/:releaseId', () => {
  it('adds from Discogs', async () => {
    const add = jest
      .spyOn(musicService, 'addAlbumFromDiscogs')
      .mockResolvedValue({ id: 1, title: 'Drones' } as any);

    const res = await post('discogs', '7156458', { condition: 'NM' });

    expect(res.status).toBe(201);
    expect(add).toHaveBeenCalledWith('7156458', expect.objectContaining({ condition: 'NM' }));
  });

  it('adds from MusicBrainz', async () => {
    const add = jest
      .spyOn(musicService, 'addAlbumFromMusicBrainz')
      .mockResolvedValue({ id: 2, title: 'Kind of Blue' } as any);

    const res = await post('musicbrainz', 'mbid-1');

    expect(res.status).toBe(201);
    expect(add).toHaveBeenCalledWith('mbid-1', expect.anything());
  });

  it('rejects an unknown source rather than guessing', async () => {
    const res = await post('spotify', 'whatever');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source/i);
  });

  it('reports a duplicate as 409 with a code the client can branch on', async () => {
    jest
      .spyOn(musicService, 'addAlbumFromDiscogs')
      .mockRejectedValue(new Error('Album already exists in collection'));

    const res = await post('discogs', '7156458');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_ALBUM');
  });

  it('answers 400 on an invalid condition rather than 500', async () => {
    const res = await post('discogs', '7156458', { condition: 'Poor' });

    expect(res.status).toBe(400);
  });

  it('reports the unique-index violation of a double tap as a duplicate too', async () => {
    // Two taps close enough together both clear the service's duplicate checks
    // and the second insert trips the partial unique index on the release id.
    const constraint = Object.assign(
      new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: albums.discogs_release_id'),
      { code: 'SQLITE_CONSTRAINT' }
    );
    jest.spyOn(musicService, 'addAlbumFromDiscogs').mockRejectedValue(constraint);

    const res = await post('discogs', '7156458');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_ALBUM');
  });
});
