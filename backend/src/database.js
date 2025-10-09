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
        resolve();
        return;
      }
      
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
                  
                  console.log('✓ Multiple editions support enabled');
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

/**
 * Migration: Replace watch_next BOOLEAN with watch_next_added DATETIME
 * This allows sorting watch next movies by when they were added
 */
const migrateWatchNextToDateTime = async (database) => {
  return new Promise((resolve, reject) => {
    // Check if migration is needed
    database.all("PRAGMA table_info(movies)", (err, columns) => {
      if (err) {
        console.error('Error checking table schema:', err.message);
        reject(err);
        return;
      }
      
      const hasWatchNextAdded = columns.some(col => col.name === 'watch_next_added');
      const hasWatchNext = columns.some(col => col.name === 'watch_next');
      
      if (hasWatchNextAdded && !hasWatchNext) {
        console.log('✓ Watch next datetime migration already completed');
        resolve();
        return;
      }
      
      if (!hasWatchNext) {
        console.log('✓ No watch_next column found, skipping migration');
        resolve();
        return;
      }
      
      console.log('\n=== Migrating watch_next BOOLEAN to watch_next_added DATETIME ===');
      
      database.serialize(() => {
        // Step 1: Add the new watch_next_added column
        database.run('ALTER TABLE movies ADD COLUMN watch_next_added DATETIME DEFAULT NULL', (err) => {
          if (err) {
            console.error('Error adding watch_next_added column:', err.message);
            reject(err);
            return;
          }
          
          console.log('✓ Added watch_next_added column');
          
          // Step 2: Migrate data - set timestamp for movies where watch_next = 1
          database.run(`
            UPDATE movies 
            SET watch_next_added = datetime('now') 
            WHERE watch_next = 1
          `, (err) => {
            if (err) {
              console.error('Error migrating data:', err.message);
              reject(err);
              return;
            }
            
            console.log('✓ Migrated watch_next data to timestamps');
            
            // Step 3: Create a backup of the table with old column removed
            // We need to recreate the table to remove the watch_next column
            database.all("PRAGMA table_info(movies)", (err, tableInfo) => {
              if (err) {
                console.error('Error getting table info:', err.message);
                reject(err);
                return;
              }
              
              // Get all columns except watch_next
              const newColumns = tableInfo
                .filter(col => col.name !== 'watch_next')
                .map(col => col.name);
              
              const columnList = newColumns.join(', ');
              
              // Create new table without watch_next
              const createSQL = `
                CREATE TABLE movies_new AS 
                SELECT ${columnList} FROM movies
              `;
              
              database.run(createSQL, (err) => {
                if (err) {
                  console.error('Error creating new table:', err.message);
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
                    
                    // Recreate the unique index
                    database.run(`
                      CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_edition_unique 
                      ON movies(title, tmdb_id, format)
                    `, (err) => {
                      if (err) {
                        console.error('Error creating index:', err.message);
                        reject(err);
                        return;
                      }
                      
                      console.log('✓ Removed old watch_next column');
                      console.log('✓ Watch next migration completed successfully\n');
                      resolve();
                    });
                  });
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
        console.log('Connected to SQLite database.');
        
        // Create tables
        try {
          const Movie = require('./models/movie');
          const MovieImport = require('./models/movieImport');
          const UnmatchedMovie = require('./models/unmatchedMovie');
          const MovieCast = require('./models/movieCast');
          const MovieCrew = require('./models/movieCrew');
          const Collection = require('./models/collection');
          const MovieCollection = require('./models/movieCollection');
          await Movie.createTable();
          await MovieImport.createTable();
          await UnmatchedMovie.createTable();
          await MovieCast.createTable();
          await MovieCrew.createTable();
          await Collection.createTable();
          await MovieCollection.createTable();
          
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
          } catch (migrationError) {
            // Column already exists
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
          } catch (migrationError) {
            // Column already exists
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
          } catch (migrationError) {
            // Column already exists
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
          } catch (migrationError) {
            // Column already exists
          }
          
          // Run migration to change unique constraints for multiple editions support
          try {
            await runEditionsMigration(db);
          } catch (migrationError) {
            // Migration already applied or failed
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
          } catch (migrationError) {
            // Column already exists
          }
          
          // Migrate watch_next BOOLEAN to watch_next_added DATETIME
          try {
            await migrateWatchNextToDateTime(db);
          } catch (migrationError) {
            console.error('Watch next migration error:', migrationError);
            // Migration failed, but don't block initialization
          }
          
          // Add collection fields to existing movies table if they don't exist
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies ADD COLUMN collection_name TEXT", (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          } catch (migrationError) {
            // Column already exists
          }
          
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies ADD COLUMN collection_order INTEGER", (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          } catch (migrationError) {
            // Column already exists
          }
          
          // Add box_set_name field to existing movies table if it doesn't exist
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies ADD COLUMN box_set_name TEXT", (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          } catch (migrationError) {
            // Column already exists
          }
          
          // Migrate existing collection_name data to box_set_name
          try {
            await new Promise((resolve, reject) => {
              db.run("UPDATE movies SET box_set_name = collection_name WHERE collection_name IS NOT NULL", (err) => {
                if (err) {
                  reject(err);
                } else {
                  console.log('✓ Migrated collection_name to box_set_name');
                  resolve();
                }
              });
            });
          } catch (migrationError) {
            console.error('Collection name migration error:', migrationError);
          }
          
          // Drop old collection columns after migration
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies DROP COLUMN collection_name", (err) => {
                if (err && !err.message.includes('no such column')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          } catch (dropError) {
            // Column might not exist
          }
          
          try {
            await new Promise((resolve, reject) => {
              db.run("ALTER TABLE movies DROP COLUMN collection_order", (err) => {
                if (err && !err.message.includes('no such column')) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          } catch (dropError) {
            // Column might not exist
          }
          
          console.log('Database initialized successfully.');
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
