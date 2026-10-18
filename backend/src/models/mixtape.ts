import { getDatabase } from '../database';

/** One song of a mixtape, as Navidrome's playlist has it. */
export interface MixtapeSong {
  songId: string;
  title: string;
  artist: string;
  album: string;
  /** The album in Navidrome the file belongs to: the CD or digital album of DexVault it stands for. */
  navidromeAlbumId: string;
  discNumber: number;
  track: number;
  durationSec: number | null;
}

/** The cache of a Navidrome playlist: an album of DexVault, `title_status = 'playlist'`, with its songs in order. */
export interface MixtapeRecord {
  albumId: number;
  playlistId: string;
  /** Navidrome's `changed` when last read: the playlist is read again when it moves. */
  changed: string | null;
  songs: MixtapeSong[];
}

interface MixtapeRow {
  album_id: number;
  playlist_id: string;
  changed: string | null;
  songs: string;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const toRecord = (row: MixtapeRow): MixtapeRecord => {
  let songs: MixtapeSong[] = [];
  try { songs = JSON.parse(row.songs || '[]'); } catch { /* an unreadable cache is read again from Navidrome */ }
  return { albumId: row.album_id, playlistId: row.playlist_id, changed: row.changed, songs: Array.isArray(songs) ? songs : [] };
};

const Mixtape = {
  createTable: async (): Promise<void> => {
    await run(`CREATE TABLE IF NOT EXISTS mixtapes (
      album_id INTEGER PRIMARY KEY,
      playlist_id TEXT NOT NULL UNIQUE,
      changed TEXT,
      songs TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE CASCADE
    )`);
  },

  all: async (): Promise<MixtapeRecord[]> => (await all<MixtapeRow>('SELECT * FROM mixtapes')).map(toRecord),

  findByAlbumId: async (albumId: number): Promise<MixtapeRecord | null> => {
    const [row] = await all<MixtapeRow>('SELECT * FROM mixtapes WHERE album_id = ?', [albumId]);
    return row ? toRecord(row) : null;
  },

  save: (record: MixtapeRecord): Promise<void> =>
    run(`INSERT INTO mixtapes (album_id, playlist_id, changed, songs) VALUES (?, ?, ?, ?)
      ON CONFLICT(album_id) DO UPDATE SET playlist_id = excluded.playlist_id, changed = excluded.changed, songs = excluded.songs`,
    [record.albumId, record.playlistId, record.changed, JSON.stringify(record.songs)]),

  /** The album standing for the mixtape: its name, its artists (most tracks first), its length, its cover. */
  setAlbum: (albumId: number, fields: { title: string; artists: string[]; durationSec: number; cover?: string | null }): Promise<void> =>
    run(`UPDATE albums SET title = ?, artist = ?, total_duration = ?${fields.cover !== undefined ? ', cover = ?' : ''}, updated_at = ? WHERE id = ?`, [
      fields.title, JSON.stringify(fields.artists), fields.durationSec,
      ...(fields.cover !== undefined ? [fields.cover] : []), new Date().toISOString(), albumId,
    ]),
};

export default Mixtape;
