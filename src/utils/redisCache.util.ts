import { redisClient } from '@/config/redis';
import { logger } from './logger';

export const redisCache = {
  /**
   * Retrieve cached data by key
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redisClient.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err: any) {
      logger.warn(`[RedisCache] Failed to get key "${key}": ${err.message}`);
      return null;
    }
  },

  /**
   * Set cached data with TTL (default 5 minutes / 300s)
   */
  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await redisClient.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, serialized);
      }
    } catch (err: any) {
      logger.warn(`[RedisCache] Failed to set key "${key}": ${err.message}`);
    }
  },

  /**
   * Delete one or more specific keys
   */
  async del(keys: string | string[]): Promise<void> {
    try {
      const keyList = Array.isArray(keys) ? keys : [keys];
      if (keyList.length > 0) {
        await redisClient.del(...keyList);
      }
    } catch (err: any) {
      logger.warn(`[RedisCache] Failed to delete keys: ${err.message}`);
    }
  },

  /**
   * Invalidate all keys matching a wildcard pattern
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err: any) {
      logger.warn(`[RedisCache] Failed to delete pattern "${pattern}": ${err.message}`);
    }
  },
};
