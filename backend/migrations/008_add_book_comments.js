const { getDatabase } = require('../src/database');
const { initDatabase } = require('../src/database');

async function migrate() {
  return new Promise(async (resolve, reject) => {
    try {
      // Initialize database connection first
      await initDatabase();
      
      const db = getDatabase();
      
      console.log('Starting book_comments table migration...');
      
      // Create book_comments table
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS book_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            comment TEXT NOT NULL,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) {
            console.error('Error creating book_comments table:', err);
            reject(err);
          } else {
            console.log('book_comments table created successfully');
            resolve();
          }
        });
      });

      // Create index on book_id for faster queries
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_book_comments_book_id ON book_comments(book_id)
        `, (err) => {
          if (err) {
            console.error('Error creating index on book_comments:', err);
            reject(err);
          } else {
            console.log('Index on book_comments.book_id created successfully');
            resolve();
          }
        });
      });

      console.log('Book comments migration completed successfully');
      resolve();
    } catch (error) {
      console.error('Migration error:', error);
      reject(error);
    }
  });
}

module.exports = migrate;

