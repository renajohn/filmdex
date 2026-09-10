import { getDatabase } from '../../src/database';
import musicService from '../../src/services/musicService';

const get = (sql: string, params: unknown[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const all = (sql: string, params: unknown[] = []): Promise<any[]> =>
  new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const createRichAlbum = () =>
  musicService.addAlbum({
    title: 'OK Computer',
    artist: ['Radiohead'],
    cover: '/api/images/cd/front.jpg',
    backCover: '/api/images/cd/back.jpg',
    discs: [
      {
        number: 1,
        tracks: [
          {
            trackNumber: 1,
            title: 'Airbag',
            durationSec: 284,
            isrc: 'GBAYE9700263',
            musicbrainzRecordingId: 'rec-airbag',
            toc: 'toc-1'
          }
        ]
      }
    ]
  } as any);

describe('musicService.updateAlbum — does not destroy data it was not given', () => {
  it('keeps the back cover when the edit form does not carry it', async () => {
    const album = await createRichAlbum();

    // MusicForm's FormDataState has no backCover field, so an edit posts
    // everything except it.
    await musicService.updateAlbum(album.id, {
      title: 'OK Computer',
      artist: ['Radiohead'],
      cover: '/api/images/cd/front.jpg'
    } as any);

    const row = await get('SELECT back_cover FROM albums WHERE id = ?', [album.id]);
    expect(row.back_cover).toBe('/api/images/cd/back.jpg');
  });

  it('keeps the front cover when the edit form does not carry it', async () => {
    const album = await createRichAlbum();

    await musicService.updateAlbum(album.id, {
      title: 'OK Computer',
      artist: ['Radiohead']
    } as any);

    const row = await get('SELECT cover FROM albums WHERE id = ?', [album.id]);
    expect(row.cover).toBe('/api/images/cd/front.jpg');
  });

  it('keeps per-track ISRC and MusicBrainz ids when the edit only carries title and duration', async () => {
    const album = await createRichAlbum();

    // This is the shape getAlbumById hands the form: no, title, durationSec.
    await musicService.updateAlbum(album.id, {
      title: 'OK Computer',
      artist: ['Radiohead'],
      discs: [{ number: 1, tracks: [{ no: 1, title: 'Airbag', durationSec: 284 }] }]
    } as any);

    const tracks = await all(
      'SELECT track_number, title, isrc, musicbrainz_recording_id, toc FROM tracks WHERE album_id = ?',
      [album.id]
    );

    expect(tracks).toHaveLength(1);
    expect(tracks[0].isrc).toBe('GBAYE9700263');
    expect(tracks[0].musicbrainz_recording_id).toBe('rec-airbag');
    expect(tracks[0].toc).toBe('toc-1');
  });

  it('still applies real track edits', async () => {
    const album = await createRichAlbum();

    await musicService.updateAlbum(album.id, {
      title: 'OK Computer',
      artist: ['Radiohead'],
      discs: [{ number: 1, tracks: [{ no: 1, title: 'Airbag (remaster)', durationSec: 290 }] }]
    } as any);

    const tracks = await all(
      'SELECT title, duration_sec, isrc FROM tracks WHERE album_id = ?',
      [album.id]
    );

    expect(tracks[0].title).toBe('Airbag (remaster)');
    expect(tracks[0].duration_sec).toBe(290);
    // the edit did not mention ISRC, so it must survive
    expect(tracks[0].isrc).toBe('GBAYE9700263');
  });

  it('removes a track that the edit dropped', async () => {
    const album = await musicService.addAlbum({
      title: 'Two Tracker',
      artist: ['Test'],
      discs: [
        {
          number: 1,
          tracks: [
            { trackNumber: 1, title: 'Keep me' },
            { trackNumber: 2, title: 'Drop me' }
          ]
        }
      ]
    } as any);

    await musicService.updateAlbum(album.id, {
      title: 'Two Tracker',
      artist: ['Test'],
      discs: [{ number: 1, tracks: [{ no: 1, title: 'Keep me' }] }]
    } as any);

    const tracks = await all('SELECT title FROM tracks WHERE album_id = ?', [album.id]);
    expect(tracks.map((t) => t.title)).toEqual(['Keep me']);
  });
});
