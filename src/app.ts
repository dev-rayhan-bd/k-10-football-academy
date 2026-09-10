import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import pinoHttp from 'pino-http';
import { StatusCodes } from 'http-status-codes';
import {
  helmetSecurity,
  corsSecurity,
  mongoSanitizer,
  hppProtection,
} from '@/middlewares/security.middleware';
import { globalRateLimiter } from '@/config/rateLimit.config';
import notFound from '@/middlewares/notFound';
import { parseBodyData } from '@/middlewares/parseBodyData';
import { applicationRoutes } from '@/routes';
import { globalErrorHandler } from '@/middlewares/globalErrorHandler';
import { logger } from '@/utils/logger';
import { sendResponse } from '@/utils/sendResponse';

const app: Application = express();

/**
 * 1. Trust Proxy Configuration
 * Essential for accurate IP address detection behind reverse proxies (NGINX, Cloudflare, AWS ALB)
 * Prevents false 429 Rate Limit errors and IP spoofing.
 */
app.set('trust proxy', 1);

/**
 * 2. HTTP Header & CORS Security
 */
app.use(helmetSecurity);
app.use(corsSecurity);

/**
 * 3. Global Rate Limiter (Redis-backed)
 */
app.use(globalRateLimiter);

/**
 * 4. Strict Body Parsers (Payload Size Limiting - 10kb DOS Protection)
 */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(parseBodyData);

/**
 * 5. Data Sanitization & Parameter Pollution Protection
 */
app.use(mongoSanitizer as unknown as express.RequestHandler);
app.use(hppProtection as unknown as express.RequestHandler);

/**
 * 6. Request Logging
 */
app.use(pinoHttp({ logger }));

/**
 * 7. Welcome & Health Check Routes
 */
app.get('/', (_req: Request, res: Response) => {
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Welcome to K10 Football Academy Platform API',
    data: {
      version: '1.0.0',
      health: '/health',
      apiBase: '/api/v1',
    },
  });
});

app.get('/health', (_req: Request, res: Response) => {
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'K10 Football Academy Platform API is healthy',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * 8. API Documentation (Swagger)
 * Helmet CSP is disabled for this route because Swagger UI requires inline scripts/styles.
 */
const getSwaggerDocument = () => {
  const jsonPath = path.resolve(__dirname, './swagger.json');
  const yamlPath = path.resolve(__dirname, './swagger.yaml');
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
  if (fs.existsSync(yamlPath)) {
    return YAML.parse(fs.readFileSync(yamlPath, 'utf8'));
  }
  return {};
};

app.use(
  '/api/docs',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  helmet({ contentSecurityPolicy: false }) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...(swaggerUi.serve as any[]),
  (_req: Request, res: Response) => {
    const swaggerDoc = getSwaggerDocument();
    res.send(swaggerUi.generateHTML(swaggerDoc));
  },
);

/**
 * 9. Application API Routes
 */
app.use('/api/v1', applicationRoutes);

/**
 * 9. 404 Not Found Middleware
 */
app.use(notFound);

/**
 * 10. Centralized Global Error Handler Middleware
 */
app.use(globalErrorHandler);

export default app;
