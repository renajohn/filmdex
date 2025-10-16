/**
 * Migration: Add format column to cds table
 * Date: 2025-01-16
 * Description: Adds a format column to track the physical format (CD, Vinyl, Cassette, etc.)
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'db.sqlite');
const db = new Database(dbPath);

try {
  console.log('Adding format column to cds table...');
  
  // Add format column (default to 'CD' for existing records)
  db.exec(`
    ALTER TABLE cds ADD COLUMN format TEXT DEFAULT 'CD';
  `);
  
  console.log('✓ Format column added successfully');
  
  // Create index for format to speed up filtering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cds_format ON cds(format);
  `);
  
  console.log('✓ Index on format column created');
  
} catch (error) {
  console.error('Migration failed:', error);
  throw error;
} finally {
  db.close();
}

