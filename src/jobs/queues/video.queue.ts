import { Queue } from 'bullmq';
import { redisConfig } from '@/config/redis';

export interface IVideoProcessingJobData {
  videoId: string;
  videoUrl: string;
  playerId?: string;
  userId?: string;
  role?: string;
  resolutions?: string[];
}

export const VIDEO_QUEUE_NAME = 'video-processing-queue';

export const videoQueue = new Queue<IVideoProcessingJobData>(VIDEO_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: {
      count: 500,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 1000,
      age: 7 * 24 * 3600, // 7 days retention for failed video jobs
    },
  },
});
