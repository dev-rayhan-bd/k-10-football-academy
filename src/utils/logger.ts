import pino from 'pino';
import { env } from '@/config/env';

const isDev = env.NODE_ENV === 'development' && !process.env.RENDER;

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
