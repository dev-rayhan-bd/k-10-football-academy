import { Types } from 'mongoose';
import { redisCache } from '@/utils/redisCache.util';
import { PlayerProfile } from '../player.model';
import { ClubFavourite } from '@/modules/club/club.model';
import { AcademyProfile } from '@/modules/academy/academy.model';

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
      const pId = profileId.toString();
      await redisCache.delByPattern(`CACHE:PLAYER:*${pId}*`);
    }
    if (userId) {
      const uId = userId.toString();
      await redisCache.delByPattern(`CACHE:PLAYER:*${uId}*`);
    }
  }

  /**
   * Recomputes exact player totalLikes from ClubFavourite (Club/Agent) + AcademyProfile.likedPlayerIds,
   * persists it on PlayerProfile, and immediately invalidates all player Redis caches.
   */
  async syncPlayerTotalLikes(
    profileId: string | Types.ObjectId,
    userId?: string | Types.ObjectId,
  ): Promise<number> {
    const pObjId = new Types.ObjectId(profileId.toString());
    const [clubFavLikes, academyLikes] = await Promise.all([
      ClubFavourite.countDocuments({ targetType: 'PLAYER', targetPlayerId: pObjId }),
      AcademyProfile.countDocuments({ likedPlayerIds: pObjId }),
    ]);
    const totalLikes = clubFavLikes + academyLikes;
    await PlayerProfile.updateOne({ _id: pObjId }, { $set: { totalLikes } });
    await this.invalidatePlayerCache(pObjId, userId);
    return totalLikes;
  }
}

export const playerCacheService = new PlayerCacheService();
