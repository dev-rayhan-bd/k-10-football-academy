import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from './redis';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';

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
 * 1. Global Limiter: 100 requests per 15 minutes across all general API routes
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
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
 * 2. Auth Limiter: 10 attempts per 1 hour for login & registration (Brute-force protection)
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
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
