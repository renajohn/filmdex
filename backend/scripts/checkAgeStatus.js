const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Get database path
const getDbPath = () => {
  const possiblePaths = [
    path.join(__dirname, '../data/db.sqlite'),
    path.join(__dirname, '../../data/db.sqlite'),
    'data/db.sqlite',
    'db.sqlite'
  ];
  
  for (const dbPath of possiblePaths) {
    try {
      const fs = require('fs');
      if (fs.existsSync(dbPath)) {
        return dbPath;
      }
    } catch (error) {
      // Continue to next path
    }
  }
  
  return 'data/db.sqlite';
};

const checkAgeStatus = () => {
  const dbPath = getDbPath();
  console.log(`Checking database: ${dbPath}`);
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
    console.log('Connected to the SQLite database.');
  });

  // Check total movies/TV shows
  db.get('SELECT COUNT(*) as total FROM movies', (err, row) => {
    if (err) {
      console.error('Error counting total:', err.message);
      return;
    }
    console.log(`Total movies/TV shows: ${row.total}`);
  });

  // Check movies/TV shows with age
  db.get('SELECT COUNT(*) as withAge FROM movies WHERE recommended_age IS NOT NULL', (err, row) => {
    if (err) {
      console.error('Error counting with age:', err.message);
      return;
    }
    console.log(`With recommended age: ${row.withAge}`);
  });

  // Check movies/TV shows without age
  db.get('SELECT COUNT(*) as withoutAge FROM movies WHERE recommended_age IS NULL', (err, row) => {
    if (err) {
      console.error('Error counting without age:', err.message);
      return;
    }
    console.log(`Without recommended age: ${row.withoutAge}`);
  });

  // Show breakdown by media type
  db.all(`
    SELECT 
      media_type,
      COUNT(*) as total,
      COUNT(recommended_age) as withAge,
      COUNT(*) - COUNT(recommended_age) as withoutAge
    FROM movies 
    GROUP BY media_type
  `, (err, rows) => {
    if (err) {
      console.error('Error getting breakdown:', err.message);
      return;
    }
    
    console.log('\nBreakdown by media type:');
    rows.forEach(row => {
      console.log(`${row.media_type || 'movie'}: ${row.total} total, ${row.withAge} with age, ${row.withoutAge} without age`);
    });
  });

  // Show some examples without age
  db.all('SELECT id, title, media_type, tmdb_id, imdb_id FROM movies WHERE recommended_age IS NULL LIMIT 5', (err, rows) => {
    if (err) {
      console.error('Error getting examples:', err.message);
      return;
    }
    
    console.log('\nExamples without age:');
    rows.forEach(row => {
      console.log(`- ${row.title} (${row.media_type || 'movie'}) - TMDB: ${row.tmdb_id}, IMDB: ${row.imdb_id}`);
    });
    
    // Close the database connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
      } else {
        console.log('\nDatabase connection closed.');
      }
    });
  });
};

// Run the check
checkAgeStatus();
