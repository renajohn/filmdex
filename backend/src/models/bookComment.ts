import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';
import type { BookCommentRow, BookCommentFormatted, BookCommentCreateData } from '../types';

interface BookCommentUpdateData {
  name: string;
  comment: string;
  date?: string;
}

interface BookCommentNameSuggestion {
  name: string;
}

const BookComment = {
  createTable: (): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const db = getDatabase();
        const sql = `
          CREATE TABLE IF NOT EXISTS book_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            comment TEXT NOT NULL,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
          )
        `;
        db.run(sql, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            // Create index
            db.run('CREATE INDEX IF NOT EXISTS idx_book_comments_book_id ON book_comments(book_id)', (err: Error | null) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Get all comments for a book
  findByBookId: (bookId: number): Promise<BookCommentFormatted[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT * FROM book_comments
        WHERE book_id = ?
        ORDER BY date DESC, created_at DESC
      `;
      db.all(sql, [bookId], (err: Error | null, rows: BookCommentRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => BookComment.formatRow(row)!));
        }
      });
    });
  },

  // Get a single comment by ID
  findById: (id: number): Promise<BookCommentFormatted | null> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM book_comments WHERE id = ?';
      db.get(sql, [id], (err: Error | null, row: BookCommentRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? BookComment.formatRow(row) : null);
        }
      });
    });
  },

  // Create a new comment
  create: (commentData: BookCommentCreateData): Promise<BookCommentFormatted | null> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      const sql = `
        INSERT INTO book_comments (book_id, name, comment, date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const params = [
        commentData.bookId,
        commentData.name,
        commentData.comment,
        commentData.date || now,
        now,
        now
      ];
      db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          BookComment.findById(this.lastID)
            .then(comment => resolve(comment))
            .catch(reject);
        }
      });
    });
  },

  // Update a comment
  update: (id: number, commentData: BookCommentUpdateData): Promise<BookCommentFormatted | null> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();

      // First get the existing comment to preserve its date
      BookComment.findById(id)
        .then(existing => {
          if (!existing) {
            reject(new Error('Comment not found'));
            return;
          }

          // Preserve the original date - never update it
          const sql = `
            UPDATE book_comments
            SET name = ?, comment = ?, updated_at = ?
            WHERE id = ?
          `;
          const params = [
            commentData.name,
            commentData.comment,
            now,
            id
          ];

          db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
            if (err) {
              reject(err);
            } else {
              BookComment.findById(id)
                .then(comment => resolve(comment))
                .catch(reject);
            }
          });
        })
        .catch(reject);
    });
  },

  // Delete a comment
  delete: (id: number): Promise<{ deleted: boolean }> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM book_comments WHERE id = ?';
      db.run(sql, [id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  },

  // Format database row to object
  formatRow: (row: BookCommentRow): BookCommentFormatted | null => {
    if (!row) return null;
    return {
      id: row.id,
      bookId: row.book_id,
      name: row.name,
      comment: row.comment,
      date: row.date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  // Get autocomplete suggestions for comment names (combines owners and comment names)
  getCommentNameSuggestions: (query: string = ''): Promise<BookCommentNameSuggestion[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const trimmedValue = query ? String(query).trim() : '';

      // Query to get distinct names from both owners and comment names
      let sql: string;
      let params: string[];

      if (!trimmedValue) {
        // Return all distinct names when query is empty
        sql = `
          SELECT DISTINCT name
          FROM (
            SELECT DISTINCT owner AS name FROM books WHERE owner IS NOT NULL AND owner != ''
            UNION
            SELECT DISTINCT name FROM book_comments WHERE name IS NOT NULL AND name != ''
          )
          ORDER BY name
          LIMIT 50
        `;
        params = [];
      } else {
        // Search for matching names
        sql = `
          SELECT DISTINCT name
          FROM (
            SELECT DISTINCT owner AS name FROM books WHERE owner IS NOT NULL AND owner != '' AND owner LIKE ?
            UNION
            SELECT DISTINCT name FROM book_comments WHERE name IS NOT NULL AND name != '' AND name LIKE ?
          )
          ORDER BY name
          LIMIT 50
        `;
        params = [`%${trimmedValue}%`, `%${trimmedValue}%`];
      }

      db.all(sql, params, (err: Error | null, rows: BookCommentNameSuggestion[]) => {
        if (err) {
          reject(err);
        } else {
          // Return names as array of objects with 'name' field
          resolve(rows.map(row => ({ name: row.name })));
        }
      });
    });
  }
};

export default BookComment;
