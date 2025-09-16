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
