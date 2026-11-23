import { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import jwt from 'jsonwebtoken';
import { redisClient } from './redis';
import { env } from './env';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';

const isDev = env.NODE_ENV === 'development';
const FIFTEEN_MINUTES = 15 * 60 * 1000;

const createRedisStore = (prefix: string) => {
  if (
    process.env.NODE_ENV === 'test' ||
    (process.env.RENDER && (!process.env.REDIS_HOST || process.env.REDIS_HOST === '127.0.0.1'))
  ) {
    // Fallback to fast in-memory rate limiting if external Redis is not provided on cloud
    return undefined;
  }
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

const clientIpKey = (req: Request): string => ipKeyGenerator(req.ip || 'unknown');

/**
 * Resolves the authenticated user ID from a Bearer token whose signature verifies.
 * Forged/expired tokens fail verification and fall back to IP-based limiting,
 * so an attacker cannot mint new buckets by sending random tokens.
 * Result is memoised on the request so multiple limiters verify only once.
 */
const getVerifiedUserId = (req: Request): string | null => {
  const cached = (req as Request & { _rlUserId?: string | null })._rlUserId;
  if (cached !== undefined) return cached;

  let userId: string | null = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as { userId?: string };
      userId = decoded?.userId ? String(decoded.userId) : null;
    } catch {
      userId = null;
    }
  }
  (req as Request & { _rlUserId?: string | null })._rlUserId = userId;
  return userId;
};

/** Normalised email from the (already parsed) JSON body, if present. */
const getBodyEmail = (req: Request): string | null => {
  const email = req.body?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
};

// Paths that must never be throttled by the global limiter
const GLOBAL_SKIP_PATHS = new Set(['/', '/health', '/api/v1/payments/webhook']);

/**
 * 1. Global Limiter (per 15 minutes)
 * - Authenticated requests are bucketed per verified user, so users behind a shared
 *   IP (office NAT, mobile carrier, Cloudflare/proxy edge) no longer throttle each other.
 * - Anonymous requests are bucketed per client IP (IPv6 grouped by /56 subnet).
 * - Stripe webhook (signature-verified) and health checks are exempt.
 */
export const globalRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: (req) => {
    if (isDev) return 10000;
    return getVerifiedUserId(req) ? env.RATE_LIMIT_USER_MAX : env.RATE_LIMIT_IP_MAX;
  },
  keyGenerator: (req) => {
    const userId = getVerifiedUserId(req);
    return userId ? `user:${userId}` : `ip:${clientIpKey(req)}`;
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS' || GLOBAL_SKIP_PATHS.has(req.path),
  store: createRedisStore('global'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Too many requests. Please slow down and try again shortly.',
      ),
    );
  },
});

/**
 * 2. Auth Limiter — brute-force protection for credential/OTP verification
 * (login, verify-otp, verify-reset-otp, reset-password, parent consent).
 * Only FAILED attempts (status >= 400) are counted, so normal logins never get throttled,
 * while password/OTP guessing is capped per IP + target account.
 */
export const authRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: isDev ? 1000 : 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = getBodyEmail(req);
    return email ? `${clientIpKey(req)}:${email}` : clientIpKey(req);
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  store: createRedisStore('auth'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Too many failed attempts. Please try again after 15 minutes.',
      ),
    );
  },
});

/**
 * 3. Email/OTP Dispatch Limiter — prevents email bombing & account-creation spam
 * (register, resend-otp, forgot-password). Every request counts, success or not.
 */
export const otpDispatchRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: (req) => {
    if (isDev) return 1000;
    // Per target email when known; looser per-IP cap when email is not in a JSON body (multipart register)
    return getBodyEmail(req) ? 5 : 20;
  },
  keyGenerator: (req) => {
    const email = getBodyEmail(req);
    return email ? `email:${email}` : `ip:${clientIpKey(req)}`;
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  store: createRedisStore('otp'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Too many verification emails requested. Please try again after 15 minutes.',
      ),
    );
  },
});

/**
 * 4. Search / Heavy Operations Limiter: 30 requests per minute per user (or IP)
 */
export const searchRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 30,
  keyGenerator: (req) => {
    const userId = getVerifiedUserId(req);
    return userId ? `user:${userId}` : `ip:${clientIpKey(req)}`;
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
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
