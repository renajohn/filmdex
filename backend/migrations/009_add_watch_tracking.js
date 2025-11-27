/**
 * Migration: Add watch tracking columns to movies table
 * Date: 2025-11-27
 * Description: Adds last_watched and watch_count columns to track viewing history
 */

const { getDatabase, initDatabase } = require('../src/database');

async function migrate() {
  return new Promise(async (resolve, reject) => {
    try {
      // Initialize database connection first
      await initDatabase();
      
      const db = getDatabase();
      
      console.log('Starting watch tracking migration...');
      
      // Check existing columns
      const tableInfo = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(movies)`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const hasLastWatched = tableInfo.some(col => col.name === 'last_watched');
      const hasWatchCount = tableInfo.some(col => col.name === 'watch_count');
      
      // Add last_watched column (NULL means never watched or unknown)
      if (!hasLastWatched) {
        await new Promise((resolve, reject) => {
          db.run(`ALTER TABLE movies ADD COLUMN last_watched DATE`, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
              reject(err);
            } else {
              console.log('✓ last_watched column added');
              resolve();
            }
          });
        });
        
        // Create index for last_watched
        await new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_movies_last_watched ON movies(last_watched)`, (err) => {
            if (err) reject(err);
            else {
              console.log('✓ Index on last_watched created');
              resolve();
            }
          });
        });
      } else {
        console.log('Column last_watched already exists, skipping...');
      }
      
      // Add watch_count column (default 0)
      if (!hasWatchCount) {
        await new Promise((resolve, reject) => {
          db.run(`ALTER TABLE movies ADD COLUMN watch_count INTEGER DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
              reject(err);
            } else {
              console.log('✓ watch_count column added');
              resolve();
            }
          });
        });
        
        // Ensure all existing rows have watch_count = 0 (not NULL)
        await new Promise((resolve, reject) => {
          db.run(`UPDATE movies SET watch_count = 0 WHERE watch_count IS NULL`, (err) => {
            if (err) reject(err);
            else {
              console.log('✓ Initialized watch_count to 0 for all movies');
              resolve();
            }
          });
        });
      } else {
        console.log('Column watch_count already exists, skipping...');
      }
      
      console.log('Watch tracking migration completed successfully');
      resolve();
      
    } catch (error) {
      console.error('Watch tracking migration failed:', error);
      reject(error);
    }
  });
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

