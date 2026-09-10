import { getDatabase } from '../../src/database';
import musicService from '../../src/services/musicService';

const get = (sql: string, params: unknown[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const countAlbums = async (title: string): Promise<number> =>
  (await get('SELECT COUNT(*) AS n FROM albums WHERE title = ?', [title])).n;

const countTracks = async (albumId: number): Promise<number> =>
  (await get('SELECT COUNT(*) AS n FROM tracks WHERE album_id = ?', [albumId])).n;

describe('musicService.addAlbum — atomicity', () => {
  it('stores the album together with every track of every disc', async () => {
    const album = await musicService.addAlbum({
      title: 'The Visitors',
      artist: ['ABBA'],
      discs: [
        { number: 1, tracks: [{ trackNumber: 1, title: 'The Visitors' }, { trackNumber: 2, title: 'Head Over Heels' }] },
        { number: 2, tracks: [{ trackNumber: 1, title: 'Should I Laugh or Cry' }] }
      ]
    } as any);

    expect(await countTracks(album.id)).toBe(3);
  });

  it('leaves no orphan album behind when a track insert fails', async () => {
    const title = 'Atomicity Probe';

    await expect(
      musicService.addAlbum({
        title,
        artist: ['Test'],
        discs: [
          {
            number: 1,
            tracks: [
              { trackNumber: 1, title: 'fine' },
              // title is NOT NULL in the tracks table, so this row must fail
              { trackNumber: 2, title: null }
            ]
          }
        ]
      } as any)
    ).rejects.toThrow();

    expect(await countAlbums(title)).toBe(0);
  });

  it('keeps the album addable again after such a failure', async () => {
    const title = 'Retry Probe';

    await expect(
      musicService.addAlbum({
        title,
        artist: ['Test'],
        musicbrainzReleaseId: 'retry-probe-mbid',
        discs: [{ number: 1, tracks: [{ trackNumber: 1, title: null }] }]
      } as any)
    ).rejects.toThrow();

    const retried = await musicService.addAlbum({
      title,
      artist: ['Test'],
      musicbrainzReleaseId: 'retry-probe-mbid',
      discs: [{ number: 1, tracks: [{ trackNumber: 1, title: 'fine' }] }]
    } as any);

    expect(retried.id).toBeDefined();
    expect(await countAlbums(title)).toBe(1);
    expect(await countTracks(retried.id)).toBe(1);
  });
});
