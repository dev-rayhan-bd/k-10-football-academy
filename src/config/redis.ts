import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';
import { logger } from '@/utils/logger';

const redisUrl = process.env.REDIS_URL || env.REDIS_URL;

// Parse connection options if a REDIS_URL is provided (supports rediss:// TLS for Upstash, Render, AWS, etc.)
let parsedUrlOptions: Partial<RedisOptions> = {};
if (redisUrl) {
  try {
    const dummy = new Redis(redisUrl, { lazyConnect: true });
    parsedUrlOptions = {
      ...dummy.options,
      ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
    };
    // Clean up temporary dummy client
    dummy.disconnect();
  } catch (err: any) {
    logger.warn(
      `[RedisConfig] Failed parsing REDIS_URL: ${err.message}. Falling back to host/port.`,
    );
  }
}

export const redisConfig: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Critical requirement for BullMQ compatibility
  lazyConnect: true,
  retryStrategy(times: number) {
    if (process.env.RENDER && times > 3 && !redisUrl && env.REDIS_HOST === '127.0.0.1') {
      // Don't keep blocking forever on Render if Redis is missing and using default localhost
      return null;
    }
    // Backoff reconnect delay: 2s, 4s, max 5s between retry attempts
    const delay = Math.min(times * 2000, 5000);
    return delay;
  },
  ...parsedUrlOptions,
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
      `Redis Connection Error: ${err.message}. Ensure Redis server is running at ${redisConfig.host || env.REDIS_HOST}:${redisConfig.port || env.REDIS_PORT}`,
    );
    isRedisLoggedError = true;
  }
});
