import Redis, { RedisOptions } from 'ioredis';
import { config } from './index';
import logger from '../utils/logger';

// Redis connection options
const redisOptions: RedisOptions = {
  host: config.redis?.host || 'localhost',
  port: config.redis?.port || 6379,
  password: config.redis?.password || undefined,
  db: config.redis?.db || 0,
  connectTimeout: 15000,
  retryStrategy: (times: number) => {
    // Never give up — reconnect with capped backoff so a transient outage
    // self-heals instead of leaving the client permanently dead.
    const delay = Math.min(times * 200, 5000);
    if (times === 1 || times % 15 === 0) {
      logger.warn(`Redis reconnecting (attempt ${times}), next try in ${delay}ms`);
    }
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
};

// Create Redis client
let redis: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redis) {
    if (config.redis?.url) {
      // Heroku Redis uses self-signed certificates, so we need to disable TLS verification
      // Also handle both redis:// and rediss:// URLs
      const url = config.redis.url;
      const useTls = url.startsWith('rediss://');

      redis = new Redis(url, {
        tls: useTls ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 15000,
        maxRetriesPerRequest: 3,
        // Never give up: a transient outage (e.g. the addon's maintenance
        // window) must self-heal rather than leaving the client permanently
        // dead. Reconnect with capped backoff, logging occasionally.
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 200, 5000);
          if (times === 1 || times % 15 === 0) {
            logger.warn(`Redis reconnecting (attempt ${times}), next try in ${delay}ms`);
          }
          return delay;
        },
      });
    } else {
      redis = new Redis(redisOptions);
    }

    redis.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    redis.on('ready', () => {
      logger.info('Redis client ready');
    });

    redis.on('error', (err) => {
      logger.error('Redis client error', err);
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redis.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });
  }

  return redis;
};

// Connect to Redis
export const connectRedis = async (): Promise<void> => {
  try {
    const client = getRedisClient();
    await client.connect();
    // Test connection
    await client.ping();
    logger.info('Redis connected successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis', error as Error);
    // Don't throw - allow app to start without Redis (graceful degradation)
  }
};

// Disconnect from Redis
export const disconnectRedis = async (): Promise<void> => {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis disconnected');
  }
};

// Check Redis health
export const isRedisHealthy = async (): Promise<boolean> => {
  try {
    if (!redis) return false;
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
};

// Export default client getter
export default getRedisClient;
