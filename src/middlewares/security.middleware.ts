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
];

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envAllowedOrigins]));

/**
 * 4. Strict CORS Security Configuration
 */
export const corsSecurity = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, origin);
    }

    // In development mode, allow any localhost origin
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, origin);
    }

    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
});
