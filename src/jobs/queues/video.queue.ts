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
    removeOnComplete: false,
  },
});
