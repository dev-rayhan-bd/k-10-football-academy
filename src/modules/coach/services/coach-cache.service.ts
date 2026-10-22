import { Types } from 'mongoose';
import { redisCache } from '@/utils/redisCache.util';

export class CoachCacheService {
  async invalidateCoachCache(coachId?: string | Types.ObjectId, userId?: string | Types.ObjectId) {
    const keys: string[] = [];
    if (coachId) {
      const cId = coachId.toString();
      keys.push(`CACHE:COACH:PROFILE:${cId}`);
      keys.push(`CACHE:COACH:CV:${cId}`);
    }
    if (userId) {
      const uId = userId.toString();
      keys.push(`CACHE:COACH:PROFILE:${uId}`);
      keys.push(`CACHE:COACH:PROFILE:USER:${uId}`);
      keys.push(`CACHE:COACH:CV:${uId}`);
      keys.push(`CACHE:COACH:CV:USER:${uId}`);
    }
    if (keys.length > 0) {
      await redisCache.del(keys).catch(() => {});
    }
    if (coachId) {
      await redisCache.delByPattern(`CACHE:COACH:*:${coachId.toString()}*`).catch(() => {});
    }
    if (userId) {
      await redisCache.delByPattern(`CACHE:COACH:*:${userId.toString()}*`).catch(() => {});
    }
  }
}

export const coachCacheService = new CoachCacheService();
