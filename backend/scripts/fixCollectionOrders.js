const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Get database path
const dbPath = path.join(__dirname, '..', 'data', 'db.sqlite');

async function fixCollectionOrders() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        return reject(err);
      }
      console.log('Connected to database');
    });

    db.serialize(() => {
      // Get all collections
      db.all(`
        SELECT id, name 
        FROM collections 
        ORDER BY name
      `, [], (err, collections) => {
        if (err) {
          console.error('Error fetching collections:', err.message);
          return reject(err);
        }

        console.log(`Found ${collections.length} collections to fix`);

        let processedCollections = 0;
        
        collections.forEach((collection) => {
          // Get all movies in this collection, ordered by current order or release date
          db.all(`
            SELECT mc.movie_id, mc.collection_order, m.title, m.release_date
            FROM movie_collections mc
            JOIN movies m ON mc.movie_id = m.id
            WHERE mc.collection_id = ?
            ORDER BY 
              CASE WHEN mc.collection_order IS NOT NULL THEN mc.collection_order ELSE 999999 END,
              m.release_date ASC,
              m.title ASC
          `, [collection.id], (err, movies) => {
            if (err) {
              console.error(`Error fetching movies for collection ${collection.name}:`, err.message);
              return;
            }

            console.log(`\nFixing collection "${collection.name}" (${movies.length} movies):`);

            // Update each movie with sequential order
            movies.forEach((movie, index) => {
              const newOrder = index + 1;
              
              db.run(`
                UPDATE movie_collections 
                SET collection_order = ?
                WHERE movie_id = ? AND collection_id = ?
              `, [newOrder, movie.movie_id, collection.id], function(err) {
                if (err) {
                  console.error(`Error updating order for movie ${movie.title}:`, err.message);
                } else {
                  console.log(`  ${newOrder}. ${movie.title} (was: ${movie.collection_order || 'NULL'})`);
                }
              });
            });

            processedCollections++;
            if (processedCollections === collections.length) {
              console.log('\n✅ All collection orders have been fixed!');
              db.close((err) => {
                if (err) {
                  console.error('Error closing database:', err.message);
                  reject(err);
                } else {
                  console.log('Database connection closed');
                  resolve();
                }
              });
            }
          });
        });
      });
    });
  });
}

// Run the fix
if (require.main === module) {
  fixCollectionOrders()
    .then(() => {
      console.log('Collection order fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Collection order fix failed:', error);
      process.exit(1);
    });
}

module.exports = { fixCollectionOrders };
