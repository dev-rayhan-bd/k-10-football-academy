import helmet from 'helmet';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import cors from 'cors';
import { RequestHandler } from 'express';
import { logger } from '@/utils/logger';

/**
 * 1. Helmet Custom Content Security Policy & Security Headers
 */
export const helmetSecurity = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
});

/**
 * 2. HTTP Parameter Pollution (HPP) Prevention
 */
export const hppProtection = hpp({
  whitelist: ['role', 'status', 'page', 'limit', 'sort', 'search', 'fields'],
});

/**
 * 3. NoSQL Injection Sanitizer (express-mongo-sanitize)
 */
export const mongoSanitizer = mongoSanitize({
  allowDots: false,
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn({ ip: req.ip, key }, 'NoSQL Injection attempt detected and sanitized');
  },
}) as unknown as RequestHandler;

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://13.49.210.5',
  'https://k10football.com',
  'https://www.k10football.com',
  'http://k10football.com',
  'http://www.k10football.com',
];

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/$/, ''))
  : [];

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envAllowedOrigins]));

/**
 * Checks if incoming origin matches allowed patterns:
 * - Explicit origins in allowedOrigins
 * - Wildcard '*'
 * - Any subdomain or root of k10football.com (e.g. k10football.com, www.k10football.com, api.k10football.com)
 * - Any localhost / 127.0.0.1 port (for local frontend testing)
 */
const isAllowedOrigin = (origin?: string): boolean => {
  // Allow non-browser requests (Postman, mobile apps, server-to-server, curl)
  if (!origin) return true;

  const normalizedOrigin = origin.trim().replace(/\/$/, '');

  // Exact match or global wildcard
  if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes('*')) {
    return true;
  }

  // Allow any k10football.com domain or subdomain
  if (/^https?:\/\/([a-zA-Z0-9-]+\.)*k10football\.com(:\d+)?$/.test(normalizedOrigin)) {
    return true;
  }

  // Allow localhost or 127.0.0.1 on any port in development/testing
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin)) {
    return true;
  }

  return false;
};

/**
 * 4. Dynamic & Robust CORS Security Configuration
 * - Reflects origin dynamically to support credentials (cookies & auth headers)
 * - Dynamically accepts request headers (prevents preflight failures on custom/tracing headers)
 * - optionsSuccessStatus: 200 ensures older proxies/browsers don't fail on 204
 */
export const corsSecurity = cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      // Reflect origin back to satisfy credentials: true
      callback(null, origin || true);
    } else {
      logger.warn({ origin }, 'Blocked by CORS security policy');
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  exposedHeaders: ['Set-Cookie', 'Authorization'],
  optionsSuccessStatus: 200,
});
