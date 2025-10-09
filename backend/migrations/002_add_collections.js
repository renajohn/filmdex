const { getDatabase } = require('../src/database');

async function migrate() {
  return new Promise(async (resolve, reject) => {
    try {
      const db = getDatabase();
      
      console.log('Starting collections migration...');
      
      // Create collections table
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('✓ Created collections table');
            resolve();
          }
        });
      });
      
      // Create movie_collections junction table
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS movie_collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_id INTEGER NOT NULL,
            collection_id INTEGER NOT NULL,
            collection_order INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE,
            FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE,
            UNIQUE(movie_id, collection_id)
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('✓ Created movie_collections table');
            resolve();
          }
        });
      });
      
      // Create indexes for better performance
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_movie_collections_movie_id 
          ON movie_collections (movie_id)
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('✓ Created movie_collections movie_id index');
            resolve();
          }
        });
      });
      
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_movie_collections_collection_id 
          ON movie_collections (collection_id)
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('✓ Created movie_collections collection_id index');
            resolve();
          }
        });
      });
      
      console.log('Collections migration completed successfully');
      resolve();
      
    } catch (error) {
      console.error('Collections migration failed:', error);
      reject(error);
    }
  });
}

module.exports = { migrate };
