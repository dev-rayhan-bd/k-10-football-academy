import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { calculateMatchPerformance } from '@/utils/ratingCalculator';
import { IMatchRecord } from '../player.interface';
import { PlayerProfile, MatchRecord } from '../player.model';
import { playerStatsService } from './player-stats.service';

export class PlayerMatchService {
  async addMatchRecord(payload: Partial<IMatchRecord>) {
    let targetProfile = null;
    if (payload.playerId) {
      targetProfile = await PlayerProfile.findOne({
        $or: [{ _id: payload.playerId }, { userId: payload.playerId }],
      });

      if (!targetProfile) {
        throw new AppError(404, 'Player profile not found. Please create a player profile first.');
      }

      payload.playerId = targetProfile._id as unknown as Types.ObjectId;

      if (payload.minutesPlayed && payload.events && payload.events.length > 0) {
        const position = targetProfile.position || 'CM';

        const perfResult = calculateMatchPerformance(
          position,
          payload.minutesPlayed,
          payload.events,
        );

        payload.playerRating = Math.round((perfResult.overallRating / 10) * 10) / 10;
        payload.positivePoints = perfResult.positivePoints;
        payload.negativePoints = perfResult.negativePoints;
        payload.netContribution = perfResult.netContribution;
        payload.interpretation = perfResult.interpretation;
        payload.categoryScores = perfResult.categoryAdjustedScores;
        payload.categoryRatings = perfResult.categoryRatings;
      } else if (payload.playerRating && payload.playerRating > 10) {
        payload.playerRating = Math.round((payload.playerRating / 10) * 10) / 10;
      }
    }

    const record = await MatchRecord.create(payload);

    if (targetProfile) {
      await playerStatsService.recalculatePlayerStats(targetProfile._id);
    }

    return record;
  }

  async getMatchRecordsByPlayerId(playerId: string) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    const targetPlayerId = profile ? profile._id : playerId;

    return MatchRecord.find({ playerId: targetPlayerId }).sort({ matchDate: -1 });
  }
}

export const playerMatchService = new PlayerMatchService();
