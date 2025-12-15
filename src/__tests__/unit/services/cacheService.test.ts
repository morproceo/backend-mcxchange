/**
 * Cache Service Unit Tests
 */

import Redis from 'ioredis';

// Mock Redis is already set up in setup.ts

describe('CacheService', () => {
  let cacheService: any;
  let mockRedis: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Clear the module cache to get a fresh instance
    jest.resetModules();

    // Re-import to get fresh instance
    const module = await import('../../../services/cacheService');
    cacheService = module.cacheService;

    // Get the mock redis instance
    mockRedis = (Redis as jest.Mock).mock.results[0]?.value;
  });

  describe('get', () => {
    it('should return parsed JSON for cached value', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      const result = await cacheService.get('test-key');

      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null for non-existent key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cacheService.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('should return raw string if JSON parse fails', async () => {
      mockRedis.get.mockResolvedValue('plain-string');

      const result = await cacheService.get('string-key');

      expect(result).toBe('plain-string');
    });

    it('should return null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.get('error-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with default TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await cacheService.set('test-key', { data: 'value' });

      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should set value with custom TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await cacheService.set('test-key', 'value', 3600);

      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should stringify objects before storing', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const testObj = { name: 'test', nested: { value: 123 } };

      await cacheService.set('test-key', testObj);

      const setCall = mockRedis.set.mock.calls[0];
      expect(JSON.parse(setCall[1])).toEqual(testObj);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(cacheService.set('error-key', 'value')).resolves.not.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete key from cache', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cacheService.delete('test-key');

      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle non-existent keys', async () => {
      mockRedis.del.mockResolvedValue(0);

      await expect(cacheService.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('deletePattern', () => {
    it('should delete all keys matching pattern', async () => {
      mockRedis.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedis.del.mockResolvedValue(3);

      await cacheService.deletePattern('key*');

      expect(mockRedis.keys).toHaveBeenCalledWith('key*');
      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should not call del if no keys match', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await cacheService.deletePattern('no-match*');

      expect(mockRedis.keys).toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('should return true for existing key', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await cacheService.exists('existing-key');

      expect(result).toBe(true);
    });

    it('should return false for non-existing key', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await cacheService.exists('non-existing-key');

      expect(result).toBe(false);
    });
  });

  describe('increment', () => {
    it('should increment key value', async () => {
      mockRedis.incr.mockResolvedValue(5);

      const result = await cacheService.increment('counter');

      expect(result).toBe(5);
      expect(mockRedis.incr).toHaveBeenCalledWith('counter');
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const cachedValue = { cached: true };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedValue));

      const fetchFn = jest.fn().mockResolvedValue({ fresh: true });
      const result = await cacheService.getOrSet('cached-key', fetchFn);

      expect(result).toEqual(cachedValue);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not cached', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const freshValue = { fresh: true };
      const fetchFn = jest.fn().mockResolvedValue(freshValue);

      const result = await cacheService.getOrSet('new-key', fetchFn, 3600);

      expect(result).toEqual(freshValue);
      expect(fetchFn).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('User caching', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
    };

    it('should cache user data', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await cacheService.cacheUser(mockUser);

      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[0]).toContain('user:user-123');
    });

    it('should get cached user', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockUser));

      const result = await cacheService.getCachedUser('user-123');

      expect(result).toEqual(mockUser);
    });

    it('should invalidate user cache', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cacheService.invalidateUser('user-123');

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('Listing caching', () => {
    const mockListing = {
      id: 'listing-123',
      title: 'Test Listing',
      price: 50000,
    };

    it('should cache listing data', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await cacheService.cacheListing(mockListing);

      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[0]).toContain('listing:listing-123');
    });

    it('should get cached listing', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockListing));

      const result = await cacheService.getCachedListing('listing-123');

      expect(result).toEqual(mockListing);
    });

    it('should invalidate listing cache', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cacheService.invalidateListing('listing-123');

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('Rate limiting', () => {
    it('should track rate limit', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      const result = await cacheService.checkRateLimit('user-123', 'api', 100, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should block when limit exceeded', async () => {
      mockRedis.incr.mockResolvedValue(101);
      mockRedis.ttl.mockResolvedValue(30);

      const result = await cacheService.checkRateLimit('user-123', 'api', 100, 60);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedis.keys.mockResolvedValue(['key1', 'key2', 'key3']);

      const stats = await cacheService.getStats();

      expect(stats).toHaveProperty('totalKeys');
      expect(stats.totalKeys).toBe(3);
    });
  });
});
