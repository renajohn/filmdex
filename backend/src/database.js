const sqlite3 = require('sqlite3').verbose();
const configManager = require('./config');

const getDbSource = () => {
  try {
    return configManager.getDatabasePath();
  } catch (error) {
    // Fallback to default if config not loaded
    return 'db.sqlite';
  }
};

let db = null;

/**
 * Migration: Change unique constraints to support multiple editions
 * This migration changes from unique (tmdb_id, imdb_id) to unique (title, tmdb_id, format)
 */
const runEditionsMigration = async (database) => {
  return new Promise((resolve, reject) => {
    console.log('\n--- Checking Multiple Editions Migration ---');
    
    // Check if migration is needed
    database.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='movies'", (err, indexes) => {
      if (err) {
        console.error('Error checking indexes:', err.message);
        reject(err);
        return;
      }
      
      // Check if new index already exists
      const hasNewIndex = indexes.some(idx => idx.name === 'idx_movie_edition_unique');
      if (hasNewIndex) {
        console.log('✓ Multiple editions support already enabled');
        resolve();
        return;
      }
      
      console.log('🔄 Migrating database to support multiple editions...');
      
      database.serialize(() => {
        // Create new table with updated schema
        database.run(`
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
          
          // Copy data from old table to new table
          database.run(`INSERT INTO movies_new SELECT * FROM movies`, (err) => {
            if (err) {
              console.error('Error copying data:', err.message);
              reject(err);
              return;
            }
            
            // Drop old table
            database.run('DROP TABLE movies', (err) => {
              if (err) {
                console.error('Error dropping old table:', err.message);
                reject(err);
                return;
              }
              
              // Rename new table
              database.run('ALTER TABLE movies_new RENAME TO movies', (err) => {
                if (err) {
                  console.error('Error renaming table:', err.message);
                  reject(err);
                  return;
                }
                
                // Create new composite unique index
                database.run(`
                  CREATE UNIQUE INDEX idx_movie_edition_unique 
                  ON movies(title, tmdb_id, format)
                `, (err) => {
                  if (err) {
                    console.error('Error creating unique index:', err.message);
                    reject(err);
                    return;
                  }
                  
                  console.log('✓ Multiple editions migration completed successfully');
                  console.log('  - New constraint: UNIQUE (title, tmdb_id, format)');
                  console.log('  - You can now add multiple editions of the same movie!');
                  resolve();
                });
              });
            });
          });
        });
      });
    });
  });
};

const initDatabase = async () => {
  return new Promise(async (resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    db = new sqlite3.Database(getDbSource(), async (err) => {
      if (err) {
        console.error('Database connection error:', err.message);
        reject(err);
      } else {
        console.log('Connected to the SQLite database.');
        
        // Create tables
        try {
          const Movie = require('./models/movie');
          const MovieImport = require('./models/movieImport');
          const UnmatchedMovie = require('./models/unmatchedMovie');
          const MovieCast = require('./models/movieCast');
          const MovieCrew = require('./models/movieCrew');
          await Movie.createTable();
          await MovieImport.createTable();
          await UnmatchedMovie.createTable();
          await MovieCast.createTable();
          await MovieCrew.createTable();
          
          // Add media_type column to existing movies table if it doesn't exist
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies ADD COLUMN media_type TEXT DEFAULT 'movie'", (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
            console.log('Added media_type column to movies table.');
          } catch (migrationError) {
            console.log('media_type column already exists or migration failed:', migrationError.message);
          }
          
          // Add recommended_age column to existing movies table if it doesn't exist
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies ADD COLUMN recommended_age INTEGER", (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
            console.log('Added recommended_age column to movies table.');
          } catch (migrationError) {
            console.log('recommended_age column already exists or migration failed:', migrationError.message);
          }
          
          // Add age_processed column to existing movies table if it doesn't exist
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies ADD COLUMN age_processed BOOLEAN DEFAULT 0", (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
            console.log('Added age_processed column to movies table.');
          } catch (migrationError) {
            console.log('age_processed column already exists or migration failed:', migrationError.message);
          }
          
          // Add title_status column to existing movies table if it doesn't exist
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies ADD COLUMN title_status TEXT DEFAULT 'owned'", (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
            console.log('Added title_status column to movies table.');
          } catch (migrationError) {
            console.log('title_status column already exists or migration failed:', migrationError.message);
          }
          
          // Run migration to change unique constraints for multiple editions support
          try {
            await runEditionsMigration(db);
          } catch (migrationError) {
            console.log('Editions migration check:', migrationError.message);
          }
          
          // Add watch_next column to existing movies table if it doesn't exist
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies ADD COLUMN watch_next BOOLEAN DEFAULT 0", (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
            console.log('Added watch_next column to movies table.');
          } catch (migrationError) {
            console.log('watch_next column already exists or migration failed:', migrationError.message);
          }
          
          console.log('Database tables created successfully.');
        } catch (error) {
          console.error('Database creation error:', error);
          reject(error);
          return;
        }
        
        resolve(db);
      }
    });
  });
};

const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

module.exports = {
  initDatabase,
  getDatabase
};
