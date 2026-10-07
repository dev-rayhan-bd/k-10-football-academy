import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
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
app.use((req, res, next) => {
  if (req.path.startsWith('/api/docs')) {
    return next();
  }
  helmetSecurity(req, res, next);
});
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
      docs: '/api/docs',
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
 * 8. API Documentation (Redocly UI)
 * Helmet CSP is disabled for this route to allow Redocly CDN scripts & styles.
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

app.get('/api/docs/openapi.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(getSwaggerDocument());
});

app.get(
  '/api/docs',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  helmet({ contentSecurityPolicy: false }) as any,
  (_req: Request, res: Response) => {
    const swaggerDoc = getSwaggerDocument();
    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!DOCTYPE html>
<html>
  <head>
    <title>K10 Football Academy API Documentation</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/png" href="https://redocly.com/favicon.ico"/>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: 'Inter', sans-serif;
        background-color: #fafafa;
      }
    </style>
  </head>
  <body>
    <div id="redoc-container"></div>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
    <script>
      const spec = ${JSON.stringify(swaggerDoc)};
      Redoc.init(spec, {
        scrollYOffset: 0,
        hideDownloadButton: false,
        expandResponses: "200,201",
        theme: {
          colors: {
            primary: {
              main: "#1e40af"
            }
          },
          typography: {
            fontFamily: "Inter, sans-serif"
          }
        }
      }, document.getElementById('redoc-container'));
    </script>
  </body>
</html>
    `);
  },
);

/**
 * 9. Application API Routes
 */
app.use('/api/v1', applicationRoutes);

/**
 * 10. 404 Not Found Middleware
 */
app.use(notFound);

/**
 * 11. Centralized Global Error Handler Middleware
 */
app.use(globalErrorHandler);

export default app;
