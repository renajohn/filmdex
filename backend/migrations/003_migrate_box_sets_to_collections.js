const { getDatabase } = require('../src/database');
const Collection = require('../src/models/collection');
const MovieCollection = require('../src/models/movieCollection');

const migrateBoxSetsToCollections = async () => {
  const db = getDatabase();
  
  try {
    console.log('Starting box sets to collections migration...');
    
    // Get all unique box set names
    const boxSetNames = await new Promise((resolve, reject) => {
      db.all(`
        SELECT DISTINCT box_set_name 
        FROM movies 
        WHERE box_set_name IS NOT NULL 
        AND box_set_name != '' 
        ORDER BY box_set_name
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.box_set_name));
        }
      });
    });
    
    console.log(`Found ${boxSetNames.length} box sets to migrate:`, boxSetNames);
    
    for (const boxSetName of boxSetNames) {
      console.log(`Migrating box set: "${boxSetName}"`);
      
      // Create collection for this box set
      const collection = await Collection.create({
        name: boxSetName,
        type: 'box_set',
        is_system: false
      });
      
      console.log(`Created collection "${boxSetName}" with ID ${collection.id}`);
      
      // Get all movies in this box set
      const movies = await new Promise((resolve, reject) => {
        db.all(`
          SELECT id FROM movies 
          WHERE box_set_name = ? 
          ORDER BY release_date ASC, title ASC
        `, [boxSetName], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
      
      console.log(`Found ${movies.length} movies in box set "${boxSetName}"`);
      
      // Add movies to collection with proper ordering
      for (let i = 0; i < movies.length; i++) {
        const movieId = movies[i].id;
        const order = i + 1; // Sequential order for box sets
        
        await MovieCollection.create({
          movie_id: movieId,
          collection_id: collection.id,
          collection_order: order
        });
        
        console.log(`Added movie ${movieId} to collection "${boxSetName}" with order ${order}`);
      }
      
      // Clear box_set_name from movies (keep the field for now, just clear the values)
      await new Promise((resolve, reject) => {
        db.run(`
          UPDATE movies 
          SET box_set_name = NULL 
          WHERE box_set_name = ?
        `, [boxSetName], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      console.log(`Cleared box_set_name for movies in "${boxSetName}"`);
    }
    
    console.log('✓ Box sets migration completed successfully');
    
  } catch (error) {
    console.error('Error during box sets migration:', error);
    throw error;
  }
};

module.exports = migrateBoxSetsToCollections;
