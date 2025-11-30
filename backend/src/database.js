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

// Run auto-migrations for schema changes
const runAutoMigrations = async () => {
  console.log('Checking for schema migrations...');
  
  // Create migrations tracking table if it doesn't exist
  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_name TEXT UNIQUE NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Define migrations - add new ones here
  const migrations = [
    {
      name: '009_add_last_watched',
      up: async () => {
        // Check if column exists
        const columns = await new Promise((resolve, reject) => {
          db.all(`PRAGMA table_info(movies)`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        if (!columns.some(col => col.name === 'last_watched')) {
          await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE movies ADD COLUMN last_watched DATE`, (err) => {
              if (err && !err.message.includes('duplicate column')) reject(err);
              else resolve();
            });
          });
          console.log('  ✓ Added last_watched column');
        }
      }
    },
    {
      name: '010_add_watch_count',
      up: async () => {
        // Check if column exists
        const columns = await new Promise((resolve, reject) => {
          db.all(`PRAGMA table_info(movies)`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        if (!columns.some(col => col.name === 'watch_count')) {
          await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE movies ADD COLUMN watch_count INTEGER DEFAULT 0`, (err) => {
              if (err && !err.message.includes('duplicate column')) reject(err);
              else resolve();
            });
          });
          
          console.log('  ✓ Added watch_count column');
        }
      }
    },
    {
      name: '011_fix_watch_count_data',
      up: async () => {
        // FIX: Reset watch_count to 0 for all movies that don't have an explicit last_watched date
        // This corrects the mistake in 010 which set watch_count=1 based on never_seen=0
        const result = await new Promise((resolve, reject) => {
          db.run(`
            UPDATE movies 
            SET watch_count = 0 
            WHERE last_watched IS NULL
          `, function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          });
        });
        console.log(`  ✓ Reset watch_count to 0 for ${result} movies without last_watched date`);
      }
    },
    {
      name: '012_add_book_type',
      up: async () => {
        // Check if column exists
        const columns = await new Promise((resolve, reject) => {
          db.all(`PRAGMA table_info(books)`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        if (!columns.some(col => col.name === 'book_type')) {
          // Add book_type column with default 'book'
          await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE books ADD COLUMN book_type TEXT DEFAULT 'book' CHECK(book_type IN ('book', 'graphic-novel', 'score'))`, (err) => {
              if (err && !err.message.includes('duplicate column')) reject(err);
              else resolve();
            });
          });
          console.log('  ✓ Added book_type column to books table');
          
          // Smart backfill based on ISBN and genres
          // 1. Music scores: ISBN13 starts with 9790 (ISMN) OR genres contain "Music /"
          const scoresByIsbn = await new Promise((resolve, reject) => {
            db.run(`
              UPDATE books 
              SET book_type = 'score' 
              WHERE isbn13 LIKE '9790%'
            `, function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            });
          });
          console.log(`  ✓ Backfilled ${scoresByIsbn} books as 'score' (by ISMN)`);
          
          const scoresByGenre = await new Promise((resolve, reject) => {
            db.run(`
              UPDATE books 
              SET book_type = 'score' 
              WHERE book_type = 'book' 
                AND genres LIKE '%Music /%'
            `, function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            });
          });
          console.log(`  ✓ Backfilled ${scoresByGenre} books as 'score' (by Music genre)`);
          
          // 2. Graphic novels: genres contain comic-related patterns
          const graphicNovels = await new Promise((resolve, reject) => {
            db.run(`
              UPDATE books 
              SET book_type = 'graphic-novel' 
              WHERE book_type = 'book' 
                AND (
                  genres LIKE '%Comics & Graphic Novels%'
                  OR genres LIKE '%Bandes dessinées%'
                  OR genres LIKE '%bandes dessinées%'
                  OR genres LIKE '%Comic Strips%'
                  OR genres LIKE '%Manga%'
                )
            `, function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            });
          });
          console.log(`  ✓ Backfilled ${graphicNovels} books as 'graphic-novel'`);
        }
      }
    }
  ];
  
  // Run pending migrations
  for (const migration of migrations) {
    const applied = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM schema_migrations WHERE migration_name = ?`, [migration.name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!applied) {
      try {
        await migration.up();
        await new Promise((resolve, reject) => {
          db.run(`INSERT INTO schema_migrations (migration_name) VALUES (?)`, [migration.name], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log(`  ✓ Applied migration: ${migration.name}`);
      } catch (error) {
        console.error(`  ✗ Migration ${migration.name} failed:`, error.message);
        // Continue with other migrations
      }
    }
  }
  
  console.log('Schema migrations complete.');
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
        // Enable foreign key constraints
        db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) {
            console.error('Error enabling foreign keys:', err.message);
          } else {
            console.log('Foreign key constraints enabled');
          }
        });
        
        // Create tables with final schema
        try {
          const Movie = require('./models/movie');
          const MovieImport = require('./models/movieImport');
          const UnmatchedMovie = require('./models/unmatchedMovie');
          const MovieCast = require('./models/movieCast');
          const MovieCrew = require('./models/movieCrew');
          const Collection = require('./models/collection');
          const MovieCollection = require('./models/movieCollection');
          const Album = require('./models/album');
          const Track = require('./models/track');
          const AlbumCollection = require('./models/albumCollection');
          const Book = require('./models/book');
          const BookComment = require('./models/bookComment');
          
          // Create all tables with their final schema
          await Movie.createTable();
          await MovieImport.createTable();
          await UnmatchedMovie.createTable();
          await MovieCast.createTable();
          await MovieCrew.createTable();
          await Collection.createTable();
          await MovieCollection.createTable();
          await Album.createTable();
          await Track.createTable();
          await AlbumCollection.createTable();
          await Book.createTable();
          await BookComment.createTable();
          
          // Run auto-migrations for schema updates
          await runAutoMigrations();
          
          // Initialize system collections
          try {
            await Collection.initializeSystemCollections();
          } catch (error) {
            console.error('Error initializing system collections:', error);
            // Don't block initialization
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
