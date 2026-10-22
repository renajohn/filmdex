import { getDatabase } from '../database';

/**
 * The readings of a book: each time it was read, by its date, so a book read
 * again keeps its first reading. books.read_date follows the last of them, for
 * the sorts and the forms that know one date only.
 */

/** A reading of no date (readDate null): read, one does not know when. */
export interface BookReading { id: number; bookId: number; readDate: string | null }

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> => new Promise((resolve, reject) => {
  getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows || [])));
});
const run = (sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> => new Promise((resolve, reject) => {
  getDatabase().run(sql, params, function (this: { lastID: number; changes: number }, err: Error | null) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
});

const day = (date: string | null | undefined): string | null => {
  const text = String(date || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

const BookReading = {
  createTable: async (): Promise<void> => {
    await run(`CREATE TABLE IF NOT EXISTS book_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      read_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await run('CREATE INDEX IF NOT EXISTS idx_book_readings_book ON book_readings(book_id)');
  },

  day,

  /** Every reading, the first first: of one book, or of all of them. */
  list: async (bookId?: number): Promise<BookReading[]> => {
    await BookReading.createTable();
    const rows = await all<{ id: number; book_id: number; read_date: string }>(
      bookId ? 'SELECT * FROM book_readings WHERE book_id = ? ORDER BY read_date, id' : 'SELECT * FROM book_readings ORDER BY read_date, id',
      bookId ? [bookId] : []);
    return rows.map(r => ({ id: r.id, bookId: r.book_id, readDate: r.read_date }));
  },

  findById: async (id: number): Promise<BookReading | null> => {
    await BookReading.createTable();
    const [row] = await all<{ id: number; book_id: number; read_date: string }>('SELECT * FROM book_readings WHERE id = ?', [id]);
    return row ? { id: row.id, bookId: row.book_id, readDate: row.read_date } : null;
  },

  /** The book's read_date: its last reading, or none. */
  follow: async (bookId: number): Promise<void> => {
    await run(`UPDATE books SET read_date = (SELECT MAX(read_date) FROM book_readings WHERE book_id = ?) WHERE id = ?`, [bookId, bookId]);
  },

  /** A reading of its date, or of none when undated is asked: read, one does not know when. */
  add: async (bookId: number, date: string | null, undated = false): Promise<BookReading> => {
    const readDate = day(date);
    if (!readDate && !undated) throw new Error('A reading needs its date');
    await BookReading.createTable();
    const { lastID } = await run('INSERT INTO book_readings (book_id, read_date) VALUES (?, ?)', [bookId, readDate]);
    await BookReading.follow(bookId);
    return { id: lastID, bookId, readDate };
  },

  changeDate: async (id: number, date: string): Promise<BookReading | null> => {
    const readDate = day(date);
    if (!readDate) throw new Error('A reading needs its date');
    const reading = await BookReading.findById(id);
    if (!reading) return null;
    await run('UPDATE book_readings SET read_date = ? WHERE id = ?', [readDate, id]);
    await BookReading.follow(reading.bookId);
    return { ...reading, readDate };
  },

  remove: async (id: number): Promise<boolean> => {
    const reading = await BookReading.findById(id);
    if (!reading) return false;
    await run('DELETE FROM book_readings WHERE id = ?', [id]);
    // Its comments stay, with the reading their date tells.
    await run('UPDATE book_comments SET reading_id = NULL WHERE reading_id = ?', [id]).catch(() => undefined);
    await BookReading.follow(reading.bookId);
    return true;
  },

  /** A comment written now: with the reading it is about, or the book's last one. */
  pinComment: async (commentId: number, bookId: number, readingId?: number | null): Promise<void> => {
    await BookReading.createTable();
    if (readingId && (await BookReading.findById(Number(readingId)))?.bookId === bookId) {
      await run('UPDATE book_comments SET reading_id = ? WHERE id = ?', [Number(readingId), commentId]);
      return;
    }
    await run(`UPDATE book_comments SET reading_id = (SELECT id FROM book_readings WHERE book_id = ? ORDER BY read_date DESC, id DESC LIMIT 1) WHERE id = ?`, [bookId, commentId]);
  },

  removeAllOf: async (bookId: number): Promise<void> => {
    await BookReading.createTable();
    await run('DELETE FROM book_readings WHERE book_id = ?', [bookId]);
  },

  /**
   * The one date of a form changed: its last reading corrected, a reading
   * added when it had none, the last one taken away when the date is cleared.
   */
  followForm: async (bookId: number, before: string | null | undefined, after: string | null | undefined): Promise<void> => {
    const was = day(before);
    const now = day(after);
    if (was === now) return;
    const readings = await BookReading.list(bookId);
    const last = readings[readings.length - 1];
    if (now && readings.some(r => r.readDate === now)) { await BookReading.follow(bookId); return; }
    if (now && last && was && last.readDate === was) await BookReading.changeDate(last.id, now);
    else if (now) await BookReading.add(bookId, now);
    else if (last && was && last.readDate === was) await BookReading.remove(last.id);
    else await BookReading.follow(bookId);
  },
};

export default BookReading;
