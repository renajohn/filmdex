const { getDatabase } = require('../src/database');

/**
 * Migration: Drop old columns after data has been migrated
 * - watch_next: migrated to collection-based system
 * - watch_next_added: migrated to collection-based system
 * - box_set_name: migrated to collections
 */
const dropOldColumns = async () => {
  const db = getDatabase();
  
  return new Promise(async (resolve, reject) => {
    try {
      console.log('Starting drop old columns migration...');
      
      // Check which columns need to be dropped
      const columns = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(movies)", (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
      
      const columnNames = columns.map(col => col.name);
      const columnsToCheck = ['watch_next', 'watch_next_added', 'box_set_name'];
      const columnsToDropList = columnsToCheck.filter(col => columnNames.includes(col));
      
      if (columnsToDropList.length === 0) {
        console.log('✓ No old columns to drop, migration already completed');
        resolve();
        return;
      }
      
      console.log(`Dropping columns: ${columnsToDropList.join(', ')}`);
      
      // Drop each column using ALTER TABLE DROP COLUMN (SQLite 3.35.0+)
      const dropColumn = (columnName) => {
        return new Promise((resolve, reject) => {
          db.run(`ALTER TABLE movies DROP COLUMN ${columnName}`, (err) => {
            if (err && !err.message.includes('no such column')) {
              reject(err);
            } else {
              console.log(`✓ Dropped column: ${columnName}`);
              resolve();
            }
          });
        });
      };
      
      // Drop all columns sequentially
      for (const columnName of columnsToDropList) {
        await dropColumn(columnName);
      }
      
      console.log('✓ Drop old columns migration completed successfully');
      resolve();
      
    } catch (error) {
      console.error('Error during drop old columns migration:', error);
      reject(error);
    }
  });
};

module.exports = dropOldColumns;

