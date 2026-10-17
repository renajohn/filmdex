import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import navidromeService, { type NavidromeSong } from '../../src/services/navidromeService';
import ripStatusService from '../../src/services/ripStatusService';
import NavidromeListener from '../../src/models/navidromeListener';
import listenHistoryService from '../../src/services/listenHistoryService';

const TOKEN = 'plugin-secret';
const tag = () => Math.random().toString(36).slice(2, 8);

const sql = (statement: string, params: unknown[] = []) =>
  new Promise<void>((resolve, reject) => getDatabase().run(statement, params, (err: Error | null) => (err ? reject(err) : resolve())));

const playsOf = (songId: string) =>
  new Promise<Array<{ day: string; plays: number }>>((resolve, reject) =>
    getDatabase().all('SELECT day, plays FROM navidrome_plays WHERE song_id = ?', [songId],
      (err: Error | null, rows: Array<{ day: string; plays: number }>) => (err ? reject(err) : resolve(rows))));

const listen = (body: Record<string, unknown>, token = TOKEN) =>
  request(app).post('/api/music/navidrome/plugin/listens').set('Authorization', `Bearer ${token}`).send(body);

const favourites = (user: string, body: Record<string, unknown>) =>
  request(app).put(`/api/music/navidrome/plugin/favourites/${user}`).set('Authorization', `Bearer ${TOKEN}`).send(body);

/** Noon on 2026-10-10, in Unix seconds. */
const NOON = Math.floor(new Date('2026-10-10T12:00:00').getTime() / 1000);

const env = { ...process.env };
beforeEach(() => {
  process.env.NAVIDROME_PLUGIN_TOKEN = TOKEN;
  process.env.NAVIDROME_USER = 'renault';
});
afterEach(() => {
  process.env = { ...env };
  jest.restoreAllMocks();
});

describe('le plugin DexVault dans Navidrome', () => {
  it('n’est écouté qu’avec le bon jeton, et pas du tout sans jeton dans la stack', async () => {
    const play = { user: 'violaine', songId: `s-${tag()}`, playedAt: NOON };
    expect((await listen(play, 'wrong')).status).toBe(401);
    delete process.env.NAVIDROME_PLUGIN_TOKEN;
    expect((await listen(play)).status).toBe(503);
  });

  it('compte une écoute à son jour, une seule fois même renvoyée', async () => {
    const songId = `s-${tag()}`;
    const play = { user: 'violaine', songId, playedAt: NOON };

    expect((await listen(play)).body).toMatchObject({ added: true });
    expect((await listen(play)).body).toMatchObject({ added: false });
    await listen({ ...play, playedAt: NOON + 300 });

    expect(await playsOf(songId)).toEqual([{ day: '2026-10-10', plays: 2 }]);
  });

  it('compte aussi les écoutes de NAVIDROME_USER : ses compteurs ne sont plus que notés', async () => {
    const songId = `s-${tag()}`;
    await listen({ user: 'renault', songId, playedAt: NOON }).expect(200);
    const song: NavidromeSong = { albumId: 'a', id: songId, suffix: 'mp3', bitDepth: null, playCount: 1, played: '2026-10-10T12:00:00' };
    await listenHistoryService.record([song]);
    await listenHistoryService.record([{ ...song, playCount: 3 }]);

    expect(await playsOf(songId)).toEqual([{ day: '2026-10-10', plays: 1 }]);
  });

  it('rattrape une fois les écoutes de NAVIDROME_USER gardées avant la bascule que ses compteurs n’avaient pas prises', async () => {
    const [before, after] = [`s-${tag()}`, `s-${tag()}`];
    // Counters noted at 12:30 UTC; one play kept from before that, one after it.
    for (const songId of [before, after]) {
      await sql(`INSERT INTO navidrome_play_counts (song_id, play_count, updated_at) VALUES (?, 1, '2026-10-10 12:30:00')`, [songId]);
    }
    const noted = Date.UTC(2026, 9, 10, 12, 30) / 1000;
    await sql('INSERT INTO navidrome_listens (navidrome_user, song_id, played_at, counted) VALUES (?, ?, ?, 0)', ['renault', before, noted - 600]);
    await sql('INSERT INTO navidrome_listens (navidrome_user, song_id, played_at, counted) VALUES (?, ?, ?, 0)', ['renault', after, noted + 600]);

    expect(await NavidromeListener.countUncounted('renault')).toBe(1);
    expect(await NavidromeListener.countUncounted('renault')).toBe(0);

    expect(await playsOf(before)).toEqual([]);
    expect((await playsOf(after)).map(row => row.plays)).toEqual([1]);
  });

  it('sans le plugin, compte comme avant ce que les compteurs ont gagné', async () => {
    delete process.env.NAVIDROME_PLUGIN_TOKEN;
    const songId = `s-${tag()}`;
    const song: NavidromeSong = { albumId: 'a', id: songId, suffix: 'mp3', bitDepth: null, playCount: 1, played: '2026-10-10T12:00:00' };
    await listenHistoryService.record([song]);
    await listenHistoryService.record([{ ...song, playCount: 3 }]);

    expect(await playsOf(songId)).toEqual([{ day: '2026-10-10', plays: 3 }]);
  });

  it('refuse ce qui n’est pas une écoute', async () => {
    expect((await listen({ user: 'violaine', songId: '../etc', playedAt: NOON })).status).toBe(400);
    expect((await listen({ user: 'violaine', songId: 's1', playedAt: 'hier' })).status).toBe(400);
    expect((await listen({ user: '', songId: 's1', playedAt: NOON })).status).toBe(400);
  });

  it('met dans Buy un album dont une piste a le cœur d’un autre compte, et le dit dans la page', async () => {
    const albumId = `nd-${tag()}`;
    const songs: NavidromeSong[] = [1, 2].map(no => ({
      albumId, id: `${albumId}-${no}`, suffix: 'mp3', bitDepth: null, bitRate: 192, discNumber: 1, track: no,
      durationSec: 200, playCount: 0, played: null,
    }));
    ripStatusService.clearCache();
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(navidromeService, 'getAlbums').mockResolvedValue([{ id: albumId, name: 'Hearted', artist: 'Moby', musicBrainzId: null, songCount: 2, userRating: 0 }]);
    jest.spyOn(navidromeService, 'getSongs').mockResolvedValue(songs);
    const inBuy = async () => {
      const res = await request(app).get('/api/music/digital');
      return { album: res.body.albums.find((a: { navidromeId: string }) => a.navidromeId === albumId), plugin: res.body.plugin };
    };
    expect((await inBuy()).album.buy).toBeNull();

    // NAVIDROME_USER's own copy from the plugin is not weighed: DexVault reads it fresh.
    await favourites('renault', { songs: [{ id: `${albumId}-1`, rating: 5, starred: true }], albums: [] }).expect(200);
    expect((await inBuy()).album.buy).toBeNull();

    await favourites('violaine', { songs: [{ id: `${albumId}-2`, rating: 0, starred: true }], albums: [] }).expect(200);
    const { album, plugin } = await inBuy();
    expect(album).toMatchObject({ starred: false, favouriteTracks: 1, buy: { rated: true } });
    expect(plugin).toMatchObject({ stale: false, lastReportAt: expect.any(Number) });
    expect(plugin.accounts).toContain('violaine');
    expect(plugin.accounts).not.toContain('renault');

    // A later report replaces the account's likes: the heart taken back, the album leaves Buy.
    await favourites('violaine', { songs: [], albums: [] }).expect(200);
    expect((await inBuy()).album.buy).toBeNull();
  });

  it('dit quand le plugin ne fait plus son rapport horaire depuis trois heures', async () => {
    jest.spyOn(navidromeService, 'isConfigured').mockReturnValue(false);
    const now = Math.floor(Date.now() / 1000);
    const users = await NavidromeListener.listeners();
    for (const { user } of users) await NavidromeListener.replaceFavourites(user, [], [], now - 4 * 3600);
    await NavidromeListener.replaceFavourites(`old-${tag()}`, [], [], now - 4 * 3600);

    expect((await request(app).get('/api/music/digital')).body.plugin).toMatchObject({ stale: true });
  });
});
