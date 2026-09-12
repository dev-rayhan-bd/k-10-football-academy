import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from './redis';
import { env } from './env';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';

const isDev = env.NODE_ENV === 'development';

const createRedisStore = (prefix: string) => {
  try {
    return new RedisStore({
      // Send command wrapper for ioredis compatibility
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as any,
      prefix: `k10_rl:${prefix}:`,
    });
  } catch {
    // Return undefined to fallback to express-rate-limit in-memory store if Redis is unavailable
    return undefined;
  }
};

/**
 * 1. Global Limiter: 100 requests per 15 minutes across all general API routes (Relaxed in DEV)
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 5000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('global'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Too many requests from this IP. Please try again after 15 minutes.',
      ),
    );
  },
});

/**
 * 2. Auth Limiter: Brute-force protection (Relaxed to 1000 in DEV mode for Postman testing)
 */
export const authRateLimiter = rateLimit({
  windowMs: isDev ? 1 * 60 * 1000 : 60 * 60 * 1000, // 1 min in dev, 1 hour in prod
  max: isDev ? 1000 : 30, // 1000 in dev, 30 in prod
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('auth'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Too many authentication attempts. Please try again after an hour.',
      ),
    );
  },
});

/**
 * 3. Search / Heavy Operations Limiter: 30 requests per minute
 */
export const searchRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('search'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Search rate limit exceeded. Please slow down your queries.',
      ),
    );
  },
});
