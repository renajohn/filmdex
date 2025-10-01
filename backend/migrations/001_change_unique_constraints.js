/**
 * Migration: Change unique constraints to support multiple editions
 * 
 * Before: 
 *   - tmdb_id INTEGER UNIQUE
 *   - imdb_id TEXT UNIQUE
 * 
 * After:
 *   - Composite unique constraint on (title, tmdb_id, format)
 *   - Allows multiple editions of the same movie with different titles or formats
 * 
 * Usage:
 *   node backend/migrations/001_change_unique_constraints.js [--deployment=path/to/deployment.json]
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const configManager = require('../src/config');

// Parse command line arguments
const args = process.argv.slice(2);
const deploymentFile = args.find(arg => arg.startsWith('--deployment='))?.split('=')[1] || 
                      args.find(arg => arg.startsWith('-d='))?.split('=')[1];

// Load configuration
try {
  configManager.loadDeploymentConfig(deploymentFile);
  configManager.loadDataConfig();
} catch (error) {
  console.error('Configuration loading failed:', error.message);
  console.log('Usage: node 001_change_unique_constraints.js [--deployment=path/to/deployment.json]');
  process.exit(1);
}

const dbPath = configManager.getDatabasePath();
console.log(`Using database: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to the database.');
});

// Run migration
async function migrate() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Starting Migration: Change Unique Constraints ===\n');
    
    db.serialize(() => {
      // Step 1: Check if migration is needed
      db.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='movies'", (err, indexes) => {
        if (err) {
          console.error('Error checking indexes:', err.message);
          reject(err);
          return;
        }
        
        console.log('Current indexes:', indexes.map(i => i.name).join(', '));
        
        // Check if new index already exists
        const hasNewIndex = indexes.some(idx => idx.name === 'idx_movie_edition_unique');
        if (hasNewIndex) {
          console.log('\n✓ Migration already applied. New constraint exists.');
          resolve();
          return;
        }
        
        console.log('\nStep 1: Creating backup table...');
        
        // Step 2: Create new table with updated schema
        db.run(`
          CREATE TABLE IF NOT EXISTS movies_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            original_title TEXT,
            original_language TEXT,
            genre TEXT,
            director TEXT,
            cast TEXT,
            release_date TEXT,
            format TEXT,
            imdb_rating REAL,
            rotten_tomato_rating INTEGER,
            rotten_tomatoes_link TEXT,
            tmdb_rating REAL,
            tmdb_id INTEGER,
            imdb_id TEXT,
            price REAL,
            runtime INTEGER,
            plot TEXT,
            comments TEXT,
            never_seen BOOLEAN,
            acquired_date DATE,
            import_id TEXT,
            poster_path TEXT,
            backdrop_path TEXT,
            budget INTEGER,
            revenue INTEGER,
            trailer_key TEXT,
            trailer_site TEXT,
            status TEXT,
            popularity REAL,
            vote_count INTEGER,
            adult BOOLEAN,
            video BOOLEAN,
            media_type TEXT DEFAULT 'movie',
            recommended_age INTEGER,
            age_processed BOOLEAN DEFAULT 0,
            title_status TEXT DEFAULT 'owned'
          )
        `, (err) => {
          if (err) {
            console.error('Error creating new table:', err.message);
            reject(err);
            return;
          }
          
          console.log('✓ New table created');
          console.log('\nStep 2: Copying data from old table...');
          
          // Step 3: Copy data from old table to new table
          db.run(`
            INSERT INTO movies_new 
            SELECT * FROM movies
          `, (err) => {
            if (err) {
              console.error('Error copying data:', err.message);
              reject(err);
              return;
            }
            
            console.log('✓ Data copied successfully');
            console.log('\nStep 3: Dropping old table...');
            
            // Step 4: Drop old table
            db.run('DROP TABLE movies', (err) => {
              if (err) {
                console.error('Error dropping old table:', err.message);
                reject(err);
                return;
              }
              
              console.log('✓ Old table dropped');
              console.log('\nStep 4: Renaming new table...');
              
              // Step 5: Rename new table to original name
              db.run('ALTER TABLE movies_new RENAME TO movies', (err) => {
                if (err) {
                  console.error('Error renaming table:', err.message);
                  reject(err);
                  return;
                }
                
                console.log('✓ Table renamed');
                console.log('\nStep 5: Creating new unique constraint...');
                
                // Step 6: Create new composite unique index
                db.run(`
                  CREATE UNIQUE INDEX idx_movie_edition_unique 
                  ON movies(title, tmdb_id, format)
                `, (err) => {
                  if (err) {
                    console.error('Error creating unique index:', err.message);
                    reject(err);
                    return;
                  }
                  
                  console.log('✓ New unique constraint created: (title, tmdb_id, format)');
                  console.log('\n=== Migration Completed Successfully ===\n');
                  console.log('Summary:');
                  console.log('  - Removed: UNIQUE constraint on tmdb_id');
                  console.log('  - Removed: UNIQUE constraint on imdb_id');
                  console.log('  - Added: UNIQUE constraint on (title, tmdb_id, format)');
                  console.log('\nThis allows multiple editions of the same movie!');
                  resolve();
                });
              });
            });
          });
        });
      });
    });
  });
}

// Run migration and close database
migrate()
  .then(() => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
      }
      console.log('\nDatabase connection closed.');
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error('\n!!! Migration failed !!!');
    console.error(err);
    db.close(() => {
      process.exit(1);
    });
  });

