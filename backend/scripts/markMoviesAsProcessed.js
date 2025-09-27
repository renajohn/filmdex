const { initDatabase, getDatabase } = require('../src/database');
const logger = require('../src/logger');

async function markMoviesAsProcessed() {
  try {
    await initDatabase();
    const db = getDatabase();

    await new Promise((resolve, reject) => {
      db.run("UPDATE movies SET age_processed = 1", (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info('Successfully marked all movies as processed for age recommendations.');
          resolve();
        }
      });
    });

    db.close((err) => {
      if (err) {
        logger.error('Error closing database:', err.message);
      } else {
        logger.info('Database connection closed.');
      }
    });

  } catch (error) {
    logger.error('Error marking movies as processed:', error);
    process.exit(1);
  }
}

markMoviesAsProcessed();
