const crypto = require('crypto');

class CacheService {
  constructor() {
    this.memoryCache = new Map();
  }

  generateCacheKey(type, params = {}) {
    const keyData = { type, params };
    const keyString = JSON.stringify(keyData);
    const key = crypto.createHash('md5').update(keyString).digest('hex');
    console.log(`🔑 Generated cache key: ${key} for type: ${type}`);
    return key;
  }

  async get(key) {
    try {
      console.log(`🔍 Cache GET request for key: ${key}`);
      
      // Check memory cache only
      if (this.memoryCache.has(key)) {
        const cached = this.memoryCache.get(key);
        if (this.isCacheValid(cached)) {
          console.log(`✅ Cache HIT in memory for key: ${key}`);
          return cached.data;
        } else {
          console.log(`❌ Cache EXPIRED in memory for key: ${key}`);
          this.memoryCache.delete(key);
        }
      } else {
        console.log(`❌ Cache MISS in memory for key: ${key}`);
      }

      console.log(`❌ Cache MISS for key: ${key}`);
      return null;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  }

  async set(key, data, ttlMinutes = 60) {
    try {
      console.log(`💾 Cache SET request for key: ${key}, TTL: ${ttlMinutes} minutes`);
      
      const cached = {
        data,
        timestamp: Date.now(),
        ttl: ttlMinutes * 60 * 1000 // Convert to milliseconds
      };

      // Store in memory cache only
      this.memoryCache.set(key, cached);
      console.log(`✅ Cache stored in memory for key: ${key}`);
    } catch (error) {
      console.error('Error writing to cache:', error);
    }
  }

  isCacheValid(cached) {
    if (!cached) return false;
    
    // Check if cache is expired
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      return false;
    }

    return true;
  }

  async invalidate(pattern) {
    try {
      // Clear memory cache only
      if (pattern === '*') {
        this.memoryCache.clear();
        console.log(`🗑️ All cache invalidated`);
      } else {
        for (const key of this.memoryCache.keys()) {
          if (key.includes(pattern)) {
            this.memoryCache.delete(key);
          }
        }
        console.log(`🗑️ Cache invalidated for pattern: ${pattern}`);
      }
    } catch (error) {
      console.error('Error invalidating cache:', error);
    }
  }

  async invalidateAnalytics() {
    await this.invalidate('analytics');
  }

  async invalidateMovies() {
    await this.invalidate('movies');
  }

  async invalidateMusic() {
    await this.invalidate('music');
  }

  async invalidateAll() {
    await this.invalidate('*');
  }

  // Get cache statistics
  getStats() {
    const memoryKeys = Array.from(this.memoryCache.keys());
    return {
      memoryCacheSize: memoryKeys.length,
      memoryKeys: memoryKeys
    };
  }
}

// Export singleton instance
module.exports = new CacheService();
