import { getRedisClient, isRedisHealthy } from '../config/redis';
import logger from '../utils/logger';

// Cache key prefixes for organization
export const CacheKeys = {
  USER: 'user:',
  LISTING: 'listing:',
  LISTINGS: 'listings:',
  FMCSA: 'fmcsa:',
  SESSION: 'session:',
  RATE_LIMIT: 'ratelimit:',
  PLATFORM_SETTINGS: 'settings:',
  STATS: 'stats:',
} as const;

// Default TTL values in seconds
export const CacheTTL = {
  SHORT: 60,              // 1 minute
  MEDIUM: 300,            // 5 minutes
  LONG: 3600,             // 1 hour
  VERY_LONG: 86400,       // 24 hours
  FMCSA: 86400,           // 24 hours for FMCSA lookups
  LISTING: 300,           // 5 minutes for listing details
  USER: 600,              // 10 minutes for user profiles
  SETTINGS: 3600,         // 1 hour for platform settings
} as const;

class CacheService {
  private enabled: boolean = true;

  constructor() {
    // Check if Redis is available on initialization
    this.checkAvailability();
  }

  private async checkAvailability(): Promise<void> {
    this.enabled = await isRedisHealthy();
    if (!this.enabled) {
      logger.warn('Cache service running in degraded mode (Redis unavailable)');
    }
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;

    try {
      const redis = getRedisClient();
      const value = await redis.get(key);

      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get error', error as Error, { key });
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const redis = getRedisClient();
      const serialized = JSON.stringify(value);

      if (ttl) {
        await redis.setex(key, ttl, serialized);
      } else {
        await redis.set(key, serialized);
      }

      return true;
    } catch (error) {
      logger.error('Cache set error', error as Error, { key });
      return false;
    }
  }

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const redis = getRedisClient();
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error', error as Error, { key });
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.enabled) return 0;

    try {
      const redis = getRedisClient();
      const keys = await redis.keys(pattern);

      if (keys.length === 0) return 0;

      const deleted = await redis.del(...keys);
      return deleted;
    } catch (error) {
      logger.error('Cache delete pattern error', error as Error, { pattern });
      return 0;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const redis = getRedisClient();
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error', error as Error, { key });
      return false;
    }
  }

  /**
   * Increment a counter (useful for rate limiting)
   */
  async incr(key: string, ttl?: number): Promise<number> {
    if (!this.enabled) return 0;

    try {
      const redis = getRedisClient();
      const value = await redis.incr(key);

      // Set TTL only on first increment
      if (ttl && value === 1) {
        await redis.expire(key, ttl);
      }

      return value;
    } catch (error) {
      logger.error('Cache increment error', error as Error, { key });
      return 0;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.enabled) return -1;

    try {
      const redis = getRedisClient();
      return await redis.ttl(key);
    } catch (error) {
      logger.error('Cache TTL error', error as Error, { key });
      return -1;
    }
  }

  /**
   * Cache with automatic fetch on miss
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = CacheTTL.MEDIUM
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const fresh = await fetchFn();

    // Cache the result
    await this.set(key, fresh, ttl);

    return fresh;
  }

  /**
   * Hash operations for complex objects
   */
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.enabled) return null;

    try {
      const redis = getRedisClient();
      return await redis.hget(key, field);
    } catch (error) {
      logger.error('Cache hget error', error as Error, { key, field });
      return null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const redis = getRedisClient();
      await redis.hset(key, field, value);
      return true;
    } catch (error) {
      logger.error('Cache hset error', error as Error, { key, field });
      return false;
    }
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    if (!this.enabled) return null;

    try {
      const redis = getRedisClient();
      const result = await redis.hgetall(key);
      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      logger.error('Cache hgetall error', error as Error, { key });
      return null;
    }
  }

  /**
   * Clear all cache (use with caution!)
   */
  async flushAll(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const redis = getRedisClient();
      await redis.flushdb();
      logger.warn('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error', error as Error);
      return false;
    }
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{
    connected: boolean;
    memoryUsage?: string;
    keyCount?: number;
  }> {
    const connected = await isRedisHealthy();

    if (!connected) {
      return { connected: false };
    }

    try {
      const redis = getRedisClient();
      const info = await redis.info('memory');
      const keyCount = await redis.dbsize();

      // Parse memory usage from info
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';

      return {
        connected: true,
        memoryUsage,
        keyCount,
      };
    } catch (error) {
      return { connected: false };
    }
  }

  // ============================================
  // Domain-specific cache helpers
  // ============================================

  /**
   * Cache user profile
   */
  async cacheUser(userId: string, userData: any): Promise<void> {
    await this.set(`${CacheKeys.USER}${userId}`, userData, CacheTTL.USER);
  }

  /**
   * Get cached user profile
   */
  async getCachedUser<T>(userId: string): Promise<T | null> {
    return this.get<T>(`${CacheKeys.USER}${userId}`);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUser(userId: string): Promise<void> {
    await this.del(`${CacheKeys.USER}${userId}`);
  }

  /**
   * Cache listing details
   */
  async cacheListing(listingId: string, listingData: any): Promise<void> {
    await this.set(`${CacheKeys.LISTING}${listingId}`, listingData, CacheTTL.LISTING);
  }

  /**
   * Get cached listing
   */
  async getCachedListing<T>(listingId: string): Promise<T | null> {
    return this.get<T>(`${CacheKeys.LISTING}${listingId}`);
  }

  /**
   * Invalidate listing cache
   */
  async invalidateListing(listingId: string): Promise<void> {
    await this.del(`${CacheKeys.LISTING}${listingId}`);
    // Also invalidate listings list cache
    await this.delPattern(`${CacheKeys.LISTINGS}*`);
  }

  /**
   * Cache FMCSA lookup result
   */
  async cacheFMCSA(identifier: string, type: 'mc' | 'dot', data: any): Promise<void> {
    await this.set(`${CacheKeys.FMCSA}${type}:${identifier}`, data, CacheTTL.FMCSA);
  }

  /**
   * Get cached FMCSA data
   */
  async getCachedFMCSA<T>(identifier: string, type: 'mc' | 'dot'): Promise<T | null> {
    return this.get<T>(`${CacheKeys.FMCSA}${type}:${identifier}`);
  }

  /**
   * Cache platform settings
   */
  async cacheSettings(settings: any): Promise<void> {
    await this.set(`${CacheKeys.PLATFORM_SETTINGS}all`, settings, CacheTTL.SETTINGS);
  }

  /**
   * Get cached platform settings
   */
  async getCachedSettings<T>(): Promise<T | null> {
    return this.get<T>(`${CacheKeys.PLATFORM_SETTINGS}all`);
  }

  /**
   * Invalidate platform settings cache
   */
  async invalidateSettings(): Promise<void> {
    await this.del(`${CacheKeys.PLATFORM_SETTINGS}all`);
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export default cacheService;
