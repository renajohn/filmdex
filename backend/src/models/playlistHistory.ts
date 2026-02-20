import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';
import type { PlaylistHistoryRow, SuggestionCount } from '../types';

interface PlaylistHistoryRecordResult {
  id: number;
  album_id: number;
}

interface PlaylistHistoryBulkResult {
  count: number;
}

interface PlaylistHistoryCleanupResult {
  deleted: number;
}

const PlaylistHistory = {
  createTable: (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS playlist_suggestion_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          album_id INTEGER NOT NULL,
          suggested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE CASCADE
        )
      `;
      db.run(sql, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          // Create index for efficient querying
          db.run(`CREATE INDEX IF NOT EXISTS idx_playlist_history_album ON playlist_suggestion_history(album_id)`, (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              db.run(`CREATE INDEX IF NOT EXISTS idx_playlist_history_date ON playlist_suggestion_history(suggested_at)`, (err: Error | null) => {
                if (err) reject(err);
                else resolve();
              });
            }
          });
        }
      });
    });
  },

  // Record that an album was suggested
  recordSuggestion: (albumId: number): Promise<PlaylistHistoryRecordResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        INSERT INTO playlist_suggestion_history (album_id, suggested_at)
        VALUES (?, CURRENT_TIMESTAMP)
      `;
      db.run(sql, [albumId], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, album_id: albumId });
        }
      });
    });
  },

  // Record multiple suggestions at once
  recordSuggestions: (albumIds: number[]): Promise<PlaylistHistoryBulkResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const placeholders = albumIds.map(() => '(?, CURRENT_TIMESTAMP)').join(', ');
      const sql = `
        INSERT INTO playlist_suggestion_history (album_id, suggested_at)
        VALUES ${placeholders}
      `;
      db.run(sql, albumIds, function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ count: albumIds.length });
        }
      });
    });
  },

  // Get recent suggestions (within last N days) to avoid repeating
  getRecentSuggestions: (daysBack: number = 14): Promise<number[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT DISTINCT album_id
        FROM playlist_suggestion_history
        WHERE suggested_at >= datetime('now', '-${daysBack} days')
        ORDER BY suggested_at DESC
      `;
      db.all(sql, [], (err: Error | null, rows: PlaylistHistoryRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows ? rows.map(r => r.album_id) : []);
        }
      });
    });
  },

  // Get suggestion count per album (for weighted selection)
  getSuggestionCounts: (): Promise<SuggestionCount[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT album_id, COUNT(*) as suggestion_count
        FROM playlist_suggestion_history
        GROUP BY album_id
        ORDER BY suggestion_count DESC
      `;
      db.all(sql, [], (err: Error | null, rows: SuggestionCount[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  // Clean up old history (keep last 90 days)
  cleanupOldHistory: (): Promise<PlaylistHistoryCleanupResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        DELETE FROM playlist_suggestion_history
        WHERE suggested_at < datetime('now', '-90 days')
      `;
      db.run(sql, function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes });
        }
      });
    });
  }
};

export default PlaylistHistory;
