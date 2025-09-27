const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Get database path
const getDbPath = () => {
  // Try to find the database file
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
  
  return 'data/db.sqlite'; // Default fallback
};

const resetAgeColumn = () => {
  const dbPath = getDbPath();
  console.log(`Using database: ${dbPath}`);
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
    console.log('Connected to the SQLite database.');
  });

  // Reset all recommended_age values to NULL
  const sql = 'UPDATE movies SET recommended_age = NULL';
  
  db.run(sql, function(err) {
    if (err) {
      console.error('Error resetting age column:', err.message);
      process.exit(1);
    } else {
      console.log(`Successfully reset recommended_age for ${this.changes} movies`);
    }
    
    // Close the database connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
      } else {
        console.log('Database connection closed.');
        console.log('You can now test the backfill functionality!');
      }
    });
  });
};

// Run the reset
resetAgeColumn();
