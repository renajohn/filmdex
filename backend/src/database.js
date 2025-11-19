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
