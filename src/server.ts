import { Server } from 'http';
import app from './app';
import { env } from '@/config/env';
import { connectDB, disconnectDB } from '@/config/db';
import { seedSuperAdmin } from '@/db/seedAdmin';
import { initBackgroundJobs } from '@/jobs';
import { logger } from '@/utils/logger';

let server: Server;

async function bootstrap() {
  try {
    // 1. Connect to Database
    await connectDB();

    // Auto-seed Super Admin if not present
    await seedSuperAdmin();

    // 2. Initialize BullMQ Background Workers (Only if Redis is configured)
    if ((process.env.REDIS_HOST && process.env.REDIS_HOST !== '127.0.0.1') || !process.env.RENDER) {
      initBackgroundJobs();
    } else {
      logger.warn(
        'Skipping BullMQ background workers on Render because external Redis is not configured.',
      );
    }

    // 3. Start HTTP Server
    const port = Number(process.env.PORT) || env.PORT || 5000;
    server = app.listen(port, '0.0.0.0', () => {
      logger.info(`⚽ K10 Football Academy Server running in ${env.NODE_ENV} mode on port ${port}`);
    });

    /**
     * Slowloris Attack Mitigation:
     * Prevent slow connection attacks by enforcing header and keep-alive timeouts.
     */
    server.headersTimeout = 15000; // 15 seconds max to receive complete request headers
    server.keepAliveTimeout = 30000; // 30 seconds keep-alive connection timeout
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();

// Graceful Shutdown & Unhandled Error Handling
const exitHandler = () => {
  if (server) {
    server.close(async () => {
      logger.info('HTTP Server closed');
      await disconnectDB();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

const unexpectedErrorHandler = (error: unknown) => {
  logger.error({ err: error }, 'Unexpected Error Encountered');
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  exitHandler();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  exitHandler();
});
