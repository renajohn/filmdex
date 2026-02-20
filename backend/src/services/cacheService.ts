import crypto from 'crypto';
import type { CacheEntry } from '../types';

interface CacheStats {
  memoryCacheSize: number;
  memoryKeys: string[];
}

class CacheService {
  private memoryCache: Map<string, CacheEntry>;

  constructor() {
    this.memoryCache = new Map();
  }

  generateCacheKey(type: string, params: Record<string, unknown> = {}): string {
    const keyData = { type, params };
    const keyString = JSON.stringify(keyData);
    const key = crypto.createHash('md5').update(keyString).digest('hex');
    console.log(`🔑 Generated cache key: ${key} for type: ${type}`);
    return key;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      console.log(`🔍 Cache GET request for key: ${key}`);

      // Check memory cache only
      if (this.memoryCache.has(key)) {
        const cached = this.memoryCache.get(key)!;
        if (this.isCacheValid(cached)) {
          console.log(`✅ Cache HIT in memory for key: ${key}`);
          return cached.data as T;
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

  async set(key: string, data: unknown, ttlMinutes: number = 60): Promise<void> {
    try {
      console.log(`💾 Cache SET request for key: ${key}, TTL: ${ttlMinutes} minutes`);

      const cached: CacheEntry = {
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

  isCacheValid(cached: CacheEntry | undefined): boolean {
    if (!cached) return false;

    // Check if cache is expired
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      return false;
    }

    return true;
  }

  async invalidate(pattern: string): Promise<void> {
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

  async invalidateAnalytics(): Promise<void> {
    await this.invalidate('analytics');
  }

  async invalidateMovies(): Promise<void> {
    await this.invalidate('movies');
  }

  async invalidateMusic(): Promise<void> {
    await this.invalidate('music');
  }

  async invalidateAll(): Promise<void> {
    await this.invalidate('*');
  }

  // Get cache statistics
  getStats(): CacheStats {
    const memoryKeys = Array.from(this.memoryCache.keys());
    return {
      memoryCacheSize: memoryKeys.length,
      memoryKeys: memoryKeys
    };
  }
}

// Export singleton instance
export default new CacheService();
