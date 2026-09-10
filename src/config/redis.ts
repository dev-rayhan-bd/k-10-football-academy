import Redis from 'ioredis';
import { env } from './env';
import { logger } from '@/utils/logger';

export const redisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Critical requirement for BullMQ compatibility
  retryStrategy(times: number) {
    // Backoff reconnect delay: 2s, 4s, max 5s between retry attempts
    const delay = Math.min(times * 2000, 5000);
    return delay;
  },
};

export const redisClient = new Redis(redisConfig);

let isRedisLoggedError = false;

redisClient.on('connect', () => {
  isRedisLoggedError = false;
  logger.info('Redis Client Connected Successfully');
});

redisClient.on('error', (err) => {
  if (!isRedisLoggedError) {
    logger.error(
      `Redis Connection Error: ${err.message}. Ensure Redis server is running at ${env.REDIS_HOST}:${env.REDIS_PORT}`,
    );
    isRedisLoggedError = true;
  }
});
