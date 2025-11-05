const { getDatabase } = require('../src/database');
const { initDatabase } = require('../src/database');

async function migrate() {
  return new Promise(async (resolve, reject) => {
    try {
      // Initialize database connection first
      await initDatabase();
      
      const db = getDatabase();
      
      console.log('Starting books table migration...');
      
      // Create books table
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            isbn TEXT,
            isbn13 TEXT,
            title TEXT NOT NULL,
            subtitle TEXT,
            authors TEXT,
            publisher TEXT,
            published_year INTEGER,
            language TEXT,
            format TEXT,
            filetype TEXT,
            drm TEXT,
            narrator TEXT,
            runtime INTEGER,
            series TEXT,
            series_number INTEGER,
            genres TEXT,
            tags TEXT,
            rating REAL,
            cover TEXT,
            owner TEXT,
            borrowed BOOLEAN DEFAULT 0,
            borrowed_date DATE,
            returned_date DATE,
            borrowed_notes TEXT,
            page_count INTEGER,
            description TEXT,
            urls TEXT,
            annotation TEXT,
            title_status TEXT DEFAULT 'owned' CHECK(title_status IN ('owned', 'wish')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('✓ Created books table');
            resolve();
          }
        });
      });
      
      // Create indexes
      const indexPromises = [
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn)`, (err) => {
            if (err) reject(err); else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_isbn13 ON books(isbn13)`, (err) => {
            if (err) reject(err); else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_title ON books(title)`, (err) => {
            if (err) reject(err); else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_authors ON books(authors)`, (err) => {
            if (err) reject(err); else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_owner ON books(owner)`, (err) => {
            if (err) reject(err); else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_series ON books(series)`, (err) => {
            if (err) reject(err); else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_language ON books(language)`, (err) => {
            if (err) reject(err); else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_format ON books(format)`, (err) => {
            if (err) reject(err); else resolve();
          });
        }),
        new Promise((resolve, reject) => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_books_title_status ON books(title_status)`, (err) => {
            if (err) reject(err); else resolve();
          });
        })
      ];
      
      await Promise.all(indexPromises);
      console.log('✓ Created all indexes');
      
      console.log('Books migration completed successfully');
      resolve();
      
    } catch (error) {
      console.error('Books migration failed:', error);
      reject(error);
    }
  });
}

module.exports = { migrate };

