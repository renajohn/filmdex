import sqlite3 from 'sqlite3';
import configManager from './config';

const verbose = sqlite3.verbose();

const getDbSource = (): string => {
  try {
    return configManager.getDatabasePath();
  } catch (error) {
    // Fallback to default if config not loaded
    return 'db.sqlite';
  }
};

let db: sqlite3.Database | null = null;

interface PragmaColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

interface MigrationDef {
  name: string;
  up: () => Promise<void>;
}

// Run auto-migrations for schema changes
const runAutoMigrations = async (): Promise<void> => {
  console.log('Checking for schema migrations...');

  if (!db) throw new Error('Database not initialized');
  const currentDb = db;

  // Create migrations tracking table if it doesn't exist
  await new Promise<void>((resolve, reject) => {
    currentDb.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_name TEXT UNIQUE NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Define migrations - add new ones here
  const migrations: MigrationDef[] = [
    {
      name: '009_add_last_watched',
      up: async () => {
        // Check if column exists
        const columns = await new Promise<PragmaColumnInfo[]>((resolve, reject) => {
          currentDb.all(`PRAGMA table_info(movies)`, (err: Error | null, rows: PragmaColumnInfo[]) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        if (!columns.some(col => col.name === 'last_watched')) {
          await new Promise<void>((resolve, reject) => {
            currentDb.run(`ALTER TABLE movies ADD COLUMN last_watched DATE`, (err: Error | null) => {
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
        const columns = await new Promise<PragmaColumnInfo[]>((resolve, reject) => {
          currentDb.all(`PRAGMA table_info(movies)`, (err: Error | null, rows: PragmaColumnInfo[]) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        if (!columns.some(col => col.name === 'watch_count')) {
          await new Promise<void>((resolve, reject) => {
            currentDb.run(`ALTER TABLE movies ADD COLUMN watch_count INTEGER DEFAULT 0`, (err: Error | null) => {
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
        const result = await new Promise<number>((resolve, reject) => {
          currentDb.run(`
            UPDATE movies
            SET watch_count = 0
            WHERE last_watched IS NULL
          `, function(this: sqlite3.RunResult, err: Error | null) {
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
        const columns = await new Promise<PragmaColumnInfo[]>((resolve, reject) => {
          currentDb.all(`PRAGMA table_info(books)`, (err: Error | null, rows: PragmaColumnInfo[]) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        if (!columns.some(col => col.name === 'book_type')) {
          await new Promise<void>((resolve, reject) => {
            currentDb.run(`ALTER TABLE books ADD COLUMN book_type TEXT DEFAULT 'book' CHECK(book_type IN ('book', 'graphic-novel', 'score'))`, (err: Error | null) => {
              if (err && !err.message.includes('duplicate column')) reject(err);
              else resolve();
            });
          });
          console.log('  ✓ Added book_type column to books table');

          const scoresByIsbn = await new Promise<number>((resolve, reject) => {
            currentDb.run(`
              UPDATE books
              SET book_type = 'score'
              WHERE isbn13 LIKE '9790%'
            `, function(this: sqlite3.RunResult, err: Error | null) {
              if (err) reject(err);
              else resolve(this.changes);
            });
          });
          console.log(`  ✓ Backfilled ${scoresByIsbn} books as 'score' (by ISMN)`);

          const scoresByGenre = await new Promise<number>((resolve, reject) => {
            currentDb.run(`
              UPDATE books
              SET book_type = 'score'
              WHERE book_type = 'book'
                AND genres LIKE '%Music /%'
            `, function(this: sqlite3.RunResult, err: Error | null) {
              if (err) reject(err);
              else resolve(this.changes);
            });
          });
          console.log(`  ✓ Backfilled ${scoresByGenre} books as 'score' (by Music genre)`);

          const graphicNovels = await new Promise<number>((resolve, reject) => {
            currentDb.run(`
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
            `, function(this: sqlite3.RunResult, err: Error | null) {
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
    const applied = await new Promise<unknown>((resolve, reject) => {
      currentDb.get(`SELECT * FROM schema_migrations WHERE migration_name = ?`, [migration.name], (err: Error | null, row: unknown) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!applied) {
      try {
        await migration.up();
        await new Promise<void>((resolve, reject) => {
          currentDb.run(`INSERT INTO schema_migrations (migration_name) VALUES (?)`, [migration.name], (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log(`  ✓ Applied migration: ${migration.name}`);
      } catch (error) {
        console.error(`  ✗ Migration ${migration.name} failed:`, (error as Error).message);
        // Continue with other migrations
      }
    }
  }

  console.log('Schema migrations complete.');
};

const initDatabase = async (): Promise<sqlite3.Database> => {
  return new Promise(async (resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    db = new verbose.Database(getDbSource(), async (err: Error | null) => {
      if (err) {
        console.error('Database connection error:', err.message);
        reject(err);
      } else {
        const currentDb = db!;
        // Enable foreign key constraints
        currentDb.run('PRAGMA foreign_keys = ON', (err: Error | null) => {
          if (err) {
            console.error('Error enabling foreign keys:', err.message);
          } else {
            console.log('Foreign key constraints enabled');
          }
        });

        // Create tables with final schema
        try {
          const Movie = (await import('./models/movie')).default;
          const MovieImport = (await import('./models/movieImport')).default;
          const UnmatchedMovie = (await import('./models/unmatchedMovie')).default;
          const MovieCast = (await import('./models/movieCast')).default;
          const MovieCrew = (await import('./models/movieCrew')).default;
          const Collection = (await import('./models/collection')).default;
          const MovieCollection = (await import('./models/movieCollection')).default;
          const Album = (await import('./models/album')).default;
          const Track = (await import('./models/track')).default;
          const AlbumCollection = (await import('./models/albumCollection')).default;
          const Book = (await import('./models/book')).default;
          const BookComment = (await import('./models/bookComment')).default;
          const PlaylistHistory = (await import('./models/playlistHistory')).default;

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
          await PlaylistHistory.createTable();

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

        resolve(currentDb);
      }
    });
  });
};

const getDatabase = (): sqlite3.Database => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

export {
  initDatabase,
  getDatabase
};
