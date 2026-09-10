import { Worker, Job } from 'bullmq';
import { redisConfig } from '@/config/redis';
import { VIDEO_QUEUE_NAME, IVideoProcessingJobData } from '../queues/video.queue';
import { logger } from '@/utils/logger';

export const videoWorker = new Worker<IVideoProcessingJobData>(
  VIDEO_QUEUE_NAME,
  async (job: Job<IVideoProcessingJobData>) => {
    logger.info(`Processing Video Job [${job.id}] for Video ID: ${job.data.videoId}`);
    // Async video transcoding/processing execution logic placeholder
    await new Promise((resolve) => setTimeout(resolve, 1000));
    logger.info(`Video successfully processed for Video ID: ${job.data.videoId}`);
  },
  { connection: redisConfig },
);

videoWorker.on('completed', (job) => {
  logger.info(`Video Job [${job.id}] completed successfully`);
});

videoWorker.on('failed', (job, err) => {
  logger.error(`Video Job [${job?.id}] failed: ${err.message}`);
});
