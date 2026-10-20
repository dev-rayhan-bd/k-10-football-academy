import { Types } from 'mongoose';
import { redisCache } from '@/utils/redisCache.util';

export class PlayerCacheService {
  async invalidatePlayerCache(
    profileId?: string | Types.ObjectId,
    userId?: string | Types.ObjectId,
  ) {
    const keys: string[] = [];
    if (profileId) {
      const pId = profileId.toString();
      keys.push(`CACHE:PLAYER:PROFILE:${pId}`);
      keys.push(`CACHE:PLAYER:ATTRIBUTES:${pId}`);
      keys.push(`CACHE:PLAYER:CV:${pId}`);
      keys.push(`CACHE:PLAYER:ANALYTICS:${pId}`);
    }
    if (userId) {
      const uId = userId.toString();
      keys.push(`CACHE:PLAYER:PROFILE:${uId}`);
      keys.push(`CACHE:PLAYER:PROFILE:USER:${uId}`);
      keys.push(`CACHE:PLAYER:ATTRIBUTES:${uId}`);
      keys.push(`CACHE:PLAYER:ATTRIBUTES:USER:${uId}`);
      keys.push(`CACHE:PLAYER:CV:${uId}`);
      keys.push(`CACHE:PLAYER:CV:USER:${uId}`);
      keys.push(`CACHE:PLAYER:ANALYTICS:${uId}`);
      keys.push(`CACHE:PLAYER:ANALYTICS:USER:${uId}`);
    }
    if (keys.length > 0) {
      await redisCache.del(keys);
    }
    if (profileId) {
      await redisCache.delByPattern(`CACHE:PLAYER:ANALYTICS:${profileId.toString()}*`);
    }
  }
}

export const playerCacheService = new PlayerCacheService();
