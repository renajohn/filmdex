const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.deploymentConfig = null;
    this.dataConfig = null;
    this.dataPath = null;
  }

  // Load deployment configuration
  loadDeploymentConfig(deploymentFile = null) {
    try {
      let configPath;
      
      if (deploymentFile) {
        // Use provided deployment file
        configPath = path.resolve(deploymentFile);
      } else {
        // Look for deployment.json in current working directory
        const defaultPath = path.join(process.cwd(), 'deployment.json');
        if (fs.existsSync(defaultPath)) {
          configPath = defaultPath;
        } else {
          throw new Error('No deployment file provided and deployment.json not found in working directory');
        }
      }

      if (!fs.existsSync(configPath)) {
        throw new Error(`Deployment file not found: ${configPath}`);
      }

      const configData = fs.readFileSync(configPath, 'utf8');
      this.deploymentConfig = JSON.parse(configData);
      
      // Set data path from deployment config
      this.dataPath = path.resolve(this.deploymentConfig.data_path);
      
      console.log(`Loaded deployment config from: ${configPath}`);
      console.log(`Data path set to: ${this.dataPath}`);
      
      return this.deploymentConfig;
    } catch (error) {
      console.error('Failed to load deployment config:', error.message);
      throw error;
    }
  }

  // Load data options from data_path
  loadDataConfig() {
    try {
      if (!this.dataPath) {
        throw new Error('Data path not set. Load deployment config first.');
      }

      const optionsPath = path.join(this.dataPath, 'options.json');
      
      if (!fs.existsSync(optionsPath)) {
        throw new Error(`Data options file not found: ${optionsPath}`);
      }

      const optionsData = fs.readFileSync(optionsPath, 'utf8');
      this.dataConfig = JSON.parse(optionsData);
      
      console.log(`Loaded data options from: ${optionsPath}`);
      console.log(`Options loaded:`, {
        logLevel: this.dataConfig.log_level,
        hasOmdbKey: !!this.dataConfig.omdb_api_key,
        hasTmdbKey: !!this.dataConfig.tmdb_api_key,
        maxUploadMb: this.dataConfig.max_upload_mb
      });
      
      return this.dataConfig;
    } catch (error) {
      console.error('Failed to load data options:', error.message);
      throw error;
    }
  }

  // Get deployment configuration
  getDeploymentConfig() {
    if (!this.deploymentConfig) {
      throw new Error('Deployment config not loaded');
    }
    return this.deploymentConfig;
  }

  // Get data options
  getDataConfig() {
    if (!this.dataConfig) {
      throw new Error('Data options not loaded');
    }
    return this.dataConfig;
  }

  // Get data path
  getDataPath() {
    if (!this.dataPath) {
      throw new Error('Data path not set');
    }
    return this.dataPath;
  }

  // Get database path
  getDatabasePath() {
    return path.join(this.getDataPath(), 'db.sqlite');
  }

  // Get images directory path
  getImagesPath() {
    return path.join(this.getDataPath(), 'images');
  }

  // Get ebooks directory path
  getEbooksPath() {
    return path.join(this.getDataPath(), 'ebooks');
  }

  // Get API keys
  // Environment variables take precedence over options.json values
  getApiKeys() {
    const dataConfig = this.getDataConfig();
    return {
      omdb: process.env.OMDB_API_KEY || dataConfig.omdb_api_key,
      tmdb: process.env.TMDB_API_KEY || dataConfig.tmdb_api_key
    };
  }

  // Get log level
  getLogLevel() {
    return this.getDataConfig().log_level || 'info';
  }

  // Get max upload size in MB
  getMaxUploadMb() {
    return this.getDataConfig().max_upload_mb || 20;
  }

  // Get max upload size in bytes
  getMaxUploadBytes() {
    return this.getMaxUploadMb() * 1024 * 1024;
  }
}

// Create singleton instance
const configManager = new ConfigManager();

module.exports = configManager;
