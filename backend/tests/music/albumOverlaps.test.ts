import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Track from '../../src/models/track';

const tag = () => Math.random().toString(36).slice(2, 8);

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

/** An album with its tracks: [title, recording, isrc]. */
const album = async (title: string, status: string, tracks: Array<[string, string | null, string | null]>) => {
  const id = await run(`INSERT INTO albums (title, artist, format, title_status) VALUES (?, ?, 'CD', ?)`, [title, JSON.stringify(['Cat Stevens']), status]);
  for (const [index, [name, recording, isrc]] of tracks.entries()) {
    await Track.create({ albumId: id, discNumber: 1, trackNumber: index + 1, title: name, isrc, musicbrainzRecordingId: recording });
  }
  return id;
};

describe('GET /api/music/albums/:id/overlaps', () => {
  it('gives the other albums of the collection holding the same recordings, the most first', async () => {
    const t = tag();
    const tillerman = await album(`Tillerman ${t}`, 'owned', [['Wild World', `r1${t}`, null], ['Father and Son', `r2${t}`, null], ['Miles', `r3${t}`, null]]);
    const remember = await album(`Remember ${t}`, 'digital', [['Father and Son', `r2${t}`, null], ['Wild World', `r1${t}`, null], ['Morning', `r9${t}`, null]]);
    const single = await album(`Single ${t}`, 'owned', [['Miles', `r3${t}`, null]]);
    await album(`Wished ${t}`, 'wish', [['Wild World', `r1${t}`, null]]);

    const res = await request(app).get(`/api/music/albums/${tillerman}/overlaps`);

    expect(res.status).toBe(200);
    expect(res.body.map((other: { id: number }) => other.id)).toEqual([remember, single]);
    expect(res.body[0]).toMatchObject({
      title: `Remember ${t}`, titleStatus: 'digital', shared: 2, trackCount: 3,
      tracks: [{ disc: 1, no: 1, title: 'Wild World' }, { disc: 1, no: 2, title: 'Father and Son' }],
    });
  });

  it('takes an ISRC as the same track only when each album gives it to one track', async () => {
    const t = tag();
    const grieg = await album(`Grieg ${t}`, 'owned', [['Morning', null, `IS${t}`], ['Anitra', null, `IS${t}`], ['Solveig', null, `SO${t}`]]);
    const peer = await album(`Peer ${t}`, 'owned', [['Morning Mood', null, `IS${t}`], ['Solveig’s Song', null, `SO${t}`]]);

    const res = await request(app).get(`/api/music/albums/${grieg}/overlaps`);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: peer, shared: 1, tracks: [{ title: 'Solveig' }] });
  });

  it('gives nothing for an album no other one shares a track with', async () => {
    const lonely = await album(`Lonely ${tag()}`, 'owned', [['Alone', `solo${tag()}`, null]]);
    expect((await request(app).get(`/api/music/albums/${lonely}/overlaps`)).body).toEqual([]);
  });
});
