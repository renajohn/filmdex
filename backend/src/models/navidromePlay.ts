import { getDatabase } from '../database';

/** Plays a song gained on a day, as the counters Navidrome keeps tell them. */
export interface PlayChange {
  songId: string;
  /** The song's counter as Navidrome now reports it. */
  playCount: number;
  /** YYYY-MM-DD, local time. */
  day: string;
  plays: number;
}

export interface DayPlays {
  songId: string;
  day: string;
  plays: number;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

/**
 * What NAVIDROME_USER listened to, day by day. Navidrome's Subsonic API only
 * tells each song's play count and the date of its last play, so DexVault
 * notes the counters and turns what they gained into dated plays. Also the
 * albums one listens to without wanting their CD.
 */
const NavidromePlay = {
  createTable: async (): Promise<void> => {
    await run(`CREATE TABLE IF NOT EXISTS navidrome_play_counts (
      song_id TEXT PRIMARY KEY,
      play_count INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS navidrome_plays (
      song_id TEXT NOT NULL,
      day TEXT NOT NULL,
      plays INTEGER NOT NULL,
      PRIMARY KEY (song_id, day)
    )`);
    await run('CREATE INDEX IF NOT EXISTS idx_navidrome_plays_day ON navidrome_plays (day)');
    await run(`CREATE TABLE IF NOT EXISTS digital_dismissals (
      navidrome_id TEXT PRIMARY KEY,
      name TEXT,
      artist TEXT,
      dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  },

  /** Each song's counter as last noted. */
  counts: async (): Promise<Map<string, number>> => {
    const rows = await all<{ song_id: string; play_count: number }>('SELECT song_id, play_count FROM navidrome_play_counts');
    return new Map(rows.map(row => [row.song_id, row.play_count]));
  },

  /** Notes the counters and adds what they gained to their day, all at once. */
  record: async (changes: PlayChange[]): Promise<void> => {
    if (changes.length === 0) return;
    await run('BEGIN');
    try {
      for (const change of changes) {
        await run(`INSERT INTO navidrome_play_counts (song_id, play_count, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(song_id) DO UPDATE SET play_count = excluded.play_count, updated_at = CURRENT_TIMESTAMP`,
        [change.songId, change.playCount]);
        if (change.plays > 0) {
          await run(`INSERT INTO navidrome_plays (song_id, day, plays) VALUES (?, ?, ?)
            ON CONFLICT(song_id, day) DO UPDATE SET plays = plays + excluded.plays`,
          [change.songId, change.day, change.plays]);
        }
      }
      await run('COMMIT');
    } catch (error) {
      await run('ROLLBACK').catch(() => undefined);
      throw error;
    }
  },

  /** The plays from that day on. */
  since: async (day: string): Promise<DayPlays[]> =>
    (await all<{ song_id: string; day: string; plays: number }>('SELECT song_id, day, plays FROM navidrome_plays WHERE day >= ?', [day]))
      .map(row => ({ songId: row.song_id, day: row.day, plays: row.plays })),

  /** The Navidrome albums set aside as "Not interested". */
  dismissed: async (): Promise<Set<string>> =>
    new Set((await all<{ navidrome_id: string }>('SELECT navidrome_id FROM digital_dismissals')).map(row => row.navidrome_id)),

  dismiss: (navidromeId: string, name: string, artist: string): Promise<void> =>
    run('INSERT OR REPLACE INTO digital_dismissals (navidrome_id, name, artist) VALUES (?, ?, ?)', [navidromeId, name, artist]),

  undismiss: (navidromeId: string): Promise<void> =>
    run('DELETE FROM digital_dismissals WHERE navidrome_id = ?', [navidromeId]),
};

export default NavidromePlay;
