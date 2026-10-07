import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';

export interface AlbumNote {
  id: number;
  albumId: number;
  note: string;
  /** The day of the listening, which the owner may set to an earlier one. */
  date: string;
  createdAt: string;
  updatedAt: string;
}

type AlbumNoteRow = { id: number; album_id: number; note: string; date: string; created_at: string; updated_at: string };

const toNote = (row: AlbumNoteRow): AlbumNote => ({
  id: row.id, albumId: row.album_id, note: row.note, date: row.date, createdAt: row.created_at, updatedAt: row.updated_at,
});

const run = (sql: string, params: unknown[]): Promise<sqlite3.RunResult> =>
  new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
      if (err) reject(err);
      else resolve(this);
    });
  });

/** A listening journal: what the owner noted of a CD, one dated entry per listening. */
const AlbumNoteModel = {
  createTable: async (): Promise<void> => {
    await run(`CREATE TABLE IF NOT EXISTS album_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
    )`, []);
    await run('CREATE INDEX IF NOT EXISTS idx_album_notes_album_id ON album_notes(album_id)', []);
  },

  /** The latest listening first. */
  findByAlbumId: (albumId: number): Promise<AlbumNote[]> =>
    new Promise((resolve, reject) => {
      getDatabase().all('SELECT * FROM album_notes WHERE album_id = ? ORDER BY date DESC, id DESC', [albumId],
        (err: Error | null, rows: AlbumNoteRow[]) => (err ? reject(err) : resolve(rows.map(toNote))));
    }),

  findById: (id: number): Promise<AlbumNote | null> =>
    new Promise((resolve, reject) => {
      getDatabase().get('SELECT * FROM album_notes WHERE id = ?', [id],
        (err: Error | null, row?: AlbumNoteRow) => (err ? reject(err) : resolve(row ? toNote(row) : null)));
    }),

  create: async (albumId: number, note: string, date: string): Promise<AlbumNote> => {
    const now = new Date().toISOString();
    const result = await run('INSERT INTO album_notes (album_id, note, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [albumId, note, date, now, now]);
    return (await AlbumNoteModel.findById(result.lastID))!;
  },

  update: async (id: number, note: string, date: string): Promise<AlbumNote | null> => {
    await run('UPDATE album_notes SET note = ?, date = ?, updated_at = ? WHERE id = ?', [note, date, new Date().toISOString(), id]);
    return AlbumNoteModel.findById(id);
  },

  delete: async (id: number): Promise<boolean> => (await run('DELETE FROM album_notes WHERE id = ?', [id])).changes > 0,

};

export default AlbumNoteModel;
