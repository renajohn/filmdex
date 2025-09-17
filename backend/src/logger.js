const configManager = require('./config');

class Logger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  getLogLevel() {
    try {
      const level = configManager.getLogLevel();
      // Ensure lowercase for consistency with levels object
      return level ? level.toLowerCase() : 'info';
    } catch (error) {
      return 'info';
    }
  }

  shouldLog(level) {
    const currentLogLevel = this.getLogLevel();
    return this.levels[level] <= this.levels[currentLogLevel];
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (args.length > 0) {
      return [`${prefix} ${message}`, ...args];
    }
    return [`${prefix} ${message}`];
  }

  error(message, ...args) {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, ...args);
      console.error(...formatted);
    }
  }

  warn(message, ...args) {
    if (this.shouldLog('warn')) {
      // Filter out Chrome DevTools warnings
      if (message.includes('.well-known/appspecific/com.chrome.devtools.json')) {
        return;
      }
      const formatted = this.formatMessage('warn', message, ...args);
      console.warn(...formatted);
    }
  }

  info(message, ...args) {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, ...args);
      console.log(...formatted);
    }
  }

  debug(message, ...args) {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, ...args);
      console.log(...formatted);
    }
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
