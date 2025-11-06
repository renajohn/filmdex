/**
 * Migration: Add artists column to books table
 * Date: 2025-01-XX
 * Description: Adds an artists column to track comic book artists/illustrators
 *              Separate from authors (writers) to properly credit comics creators
 */

const { getDatabase } = require('../src/database');
const { initDatabase } = require('../src/database');

async function migrate() {
  return new Promise(async (resolve, reject) => {
    try {
      // Initialize database connection first
      await initDatabase();
      
      const db = getDatabase();
      
      console.log('Starting artists column migration for books...');
      
      // Check if column already exists
      db.all("PRAGMA table_info(books)", (err, columns) => {
        if (err) {
          console.error('Error checking table info:', err);
          reject(err);
          return;
        }
        
        const hasArtistsColumn = columns.some(col => col.name === 'artists');
        
        if (hasArtistsColumn) {
          console.log('✓ Artists column already exists');
          resolve();
          return;
        }
        
        // Add artists column
        db.run(`
          ALTER TABLE books ADD COLUMN artists TEXT
        `, (err) => {
          if (err) {
            console.error('Error adding artists column:', err);
            reject(err);
            return;
          }
          
          console.log('✓ Added artists column to books table');
          
          // Create index for artists to speed up searches
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_books_artists ON books(artists)
          `, (err) => {
            if (err) {
              console.error('Error creating artists index:', err);
              reject(err);
              return;
            }
            
            console.log('✓ Created index on artists column');
            console.log('Migration completed successfully');
            resolve();
          });
        });
      });
      
    } catch (error) {
      console.error('Migration failed:', error);
      reject(error);
    }
  });
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrate };



