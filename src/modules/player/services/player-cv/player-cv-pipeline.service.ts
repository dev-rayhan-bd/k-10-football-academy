import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { PlayerProfile, PlayerAttributes } from '@/modules/player/player.model';
import { UserModel } from '@/modules/user/user.model';

export class PlayerCvPipelineService {
  /**
   * Resolve match stage from ID and viewer
   */
  resolveMatchStageAndCacheKey(
    id: string,
    viewer?: { userId?: string; role?: string },
  ): { matchStage: any; cacheKey: string | null } {
    if ((id === 'me' || id === 'my-profile') && viewer?.userId) {
      return {
        matchStage: { userId: new Types.ObjectId(viewer.userId) },
        cacheKey: `CACHE:PLAYER:PROFILE:USER:${viewer.userId}`,
      };
    } else if (Types.ObjectId.isValid(id)) {
      const objId = new Types.ObjectId(id);
      return {
        matchStage: { $or: [{ _id: objId }, { userId: objId }] },
        cacheKey: `CACHE:PLAYER:PROFILE:${id}`,
      };
    } else {
      throw new AppError(404, 'Player profile not found');
    }
  }

  /**
   * Run High-performance Single-Pass Aggregation pipeline replacing populate & multiple queries
   */
  async runAggregationPipeline(matchStage: any): Promise<any> {
    const [aggregatedProfile] = await PlayerProfile.aggregate([
      { $match: matchStage },
      // 1. $lookup user info (fast, non-blocking lookup)
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, email: 1, avatar: 1, phone: 1 } }],
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
      // 2. $lookup player attributes in the same query
      {
        $lookup: {
          from: 'playerattributes',
          localField: '_id',
          foreignField: 'playerId',
          as: 'attributesDoc',
        },
      },
      {
        $unwind: {
          path: '$attributesDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      // 3. $lookup fifa card stats
      {
        $lookup: {
          from: 'fifacardstats',
          localField: '_id',
          foreignField: 'playerId',
          as: 'fifaCardDoc',
        },
      },
      {
        $unwind: {
          path: '$fifaCardDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      // 4. $lookup match records in the same pipeline (sorted desc)
      {
        $lookup: {
          from: 'matchrecords',
          let: { pId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$playerId', '$$pId'] } } },
            { $sort: { matchDate: -1 } },
          ],
          as: 'matchRecords',
        },
      },
      // 5. $lookup professional coach reports (limit 10)
      {
        $lookup: {
          from: 'parentmatchreports',
          let: { pId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$childPlayerId', '$$pId'] } } },
            { $sort: { matchDate: -1 } },
            { $limit: 10 },
          ],
          as: 'professionalReports',
        },
      },
    ]);

    return aggregatedProfile;
  }

  /**
   * Fetch aggregated profile or handle auto-creation fallback for user if not yet created
   */
  async fetchAggregatedPlayerProfile(
    id: string,
    viewer?: { userId?: string; role?: string },
  ): Promise<any> {
    const { matchStage } = this.resolveMatchStageAndCacheKey(id, viewer);
    let aggregatedProfile = await this.runAggregationPipeline(matchStage);

    if (!aggregatedProfile) {
      const searchUserId =
        (id === 'me' || id === 'my-profile') && viewer?.userId
          ? viewer.userId
          : Types.ObjectId.isValid(id)
            ? id
            : null;

      if (searchUserId) {
        const user = await UserModel.findById(searchUserId);
        if (user) {
          const newProfile = await PlayerProfile.create({
            userId: user._id,
            fullName: user.name || 'New Player',
            position: user.position || 'Forward',
            age: user.age || 18,
            country: user.country || 'Bangladesh',
            profileImage: user.avatar || '',
          });
          await PlayerAttributes.findOneAndUpdate(
            { playerId: newProfile._id },
            { playerId: newProfile._id },
            { upsert: true, new: true },
          );
          aggregatedProfile = await this.runAggregationPipeline({ _id: newProfile._id });
          if (aggregatedProfile) {
            return aggregatedProfile;
          }
        }
      }
      throw new AppError(404, 'Player profile not found');
    }

    return aggregatedProfile;
  }
}

export const playerCvPipelineService = new PlayerCvPipelineService();
