import configManager from './config';

class Logger {
  levels: Record<string, number>;

  constructor() {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  getLogLevel(): string {
    try {
      const level = configManager.getLogLevel();
      // Ensure lowercase for consistency with levels object
      return level ? level.toLowerCase() : 'info';
    } catch (error) {
      return 'info';
    }
  }

  shouldLog(level: string): boolean {
    const currentLogLevel = this.getLogLevel();
    return this.levels[level] <= this.levels[currentLogLevel];
  }

  formatMessage(level: string, message: string, ...args: unknown[]): unknown[] {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (args.length > 0) {
      return [`${prefix} ${message}`, ...args];
    }
    return [`${prefix} ${message}`];
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, ...args);
      console.error(...formatted);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      // Filter out Chrome DevTools warnings
      if (message.includes('.well-known/appspecific/com.chrome.devtools.json')) {
        return;
      }
      const formatted = this.formatMessage('warn', message, ...args);
      console.warn(...formatted);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, ...args);
      console.log(...formatted);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, ...args);
      console.log(...formatted);
    }
  }
}

// Create singleton instance
const logger = new Logger();

export = logger;
