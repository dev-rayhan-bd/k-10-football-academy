import { emailWorker } from './workers/email.worker';
import { videoWorker } from './workers/video.worker';
import { emailQueue } from './queues/email.queue';
import { videoQueue } from './queues/video.queue';
import { logger } from '@/utils/logger';

export * from './queues/email.queue';
export * from './queues/video.queue';

export const initBackgroundJobs = (): void => {
  logger.info('Initializing BullMQ Background Workers (Email & Video)...');
  emailWorker.on('ready', () => logger.info('Email Worker is ready'));
  videoWorker.on('ready', () => logger.info('Video Worker is ready'));
};

export const closeBackgroundJobs = async (): Promise<void> => {
  logger.info('Closing BullMQ Background Workers and Queues...');
  try {
    await Promise.allSettled([
      emailWorker.close(),
      videoWorker.close(),
      emailQueue.close(),
      videoQueue.close(),
    ]);
    logger.info('BullMQ Background Workers and Queues closed successfully');
  } catch (err: any) {
    logger.warn(`Error closing BullMQ jobs: ${err.message}`);
  }
};
