import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { calculateMatchPerformance } from '@/utils/ratingCalculator';
import { IMatchRecord } from '../player.interface';
import { PlayerProfile, MatchRecord } from '../player.model';
import { playerStatsService } from './player-stats.service';
import { parseTimerInput } from './game-report.service';

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

      // Auto-populate events array from stats counters if events was not explicitly passed
      if ((!payload.events || payload.events.length === 0) && payload.stats) {
        const eventsMap: Record<string, number> = {};
        const s = payload.stats;
        if (s.goalScored) eventsMap['goal'] = (eventsMap['goal'] || 0) + Number(s.goalScored);
        if (s.assists) eventsMap['assist'] = (eventsMap['assist'] || 0) + Number(s.assists);
        if (s.shotsOnGoal)
          eventsMap['shot_on_target'] = (eventsMap['shot_on_target'] || 0) + Number(s.shotsOnGoal);
        if (s.passAccurate)
          eventsMap['key_pass'] = (eventsMap['key_pass'] || 0) + Number(s.passAccurate);
        if (s.standTackle)
          eventsMap['tackle_won'] = (eventsMap['tackle_won'] || 0) + Number(s.standTackle);
        if (s.slidingTackle)
          eventsMap['tackle_won'] = (eventsMap['tackle_won'] || 0) + Number(s.slidingTackle);
        if (s.interception)
          eventsMap['interception'] = (eventsMap['interception'] || 0) + Number(s.interception);
        if (s.fault)
          eventsMap['foul_committed'] = (eventsMap['foul_committed'] || 0) + Number(s.fault);
        if (s.yellowCard)
          eventsMap['yellow_card'] = (eventsMap['yellow_card'] || 0) + Number(s.yellowCard);
        if (s.redCard) eventsMap['red_card'] = (eventsMap['red_card'] || 0) + Number(s.redCard);
        if (s.savesAccurate) eventsMap['save'] = (eventsMap['save'] || 0) + Number(s.savesAccurate);
        if (s.goalUnsave)
          eventsMap['goal_conceded'] = (eventsMap['goal_conceded'] || 0) + Number(s.goalUnsave);

        payload.events = Object.entries(eventsMap).map(([eventId, count]) => ({
          eventId,
          count,
        }));
      }

      const timerResult = parseTimerInput(payload as any);
      payload.minutesPlayed = timerResult.minutesPlayed;
      payload.matchDuration = timerResult.matchDuration;
      const minutes = timerResult.minutesPlayed;

      if (payload.events && payload.events.length > 0) {
        const position = targetProfile.position || 'CM';

        const perfResult = calculateMatchPerformance(position, minutes, payload.events);

        // Keep 0-10 format for rating display and preserve full 0-100 metrics
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

      // Sync direct count shortcuts
      if (payload.stats) {
        if (payload.stats.goalScored !== undefined) payload.goals = payload.stats.goalScored;
        if (payload.stats.assists !== undefined) payload.assists = payload.stats.assists;
        if (payload.stats.passAccurate !== undefined) {
          const acc = Number(payload.stats.passAccurate) || 0;
          const wrong = Number(payload.stats.wrongPass) || 0;
          payload.passes = acc + wrong;
          payload.passAccuracy = payload.passes > 0 ? Math.round((acc / payload.passes) * 100) : 0;
        }
        if (payload.stats.yellowCard !== undefined) payload.yellowCards = payload.stats.yellowCard;
        if (payload.stats.redCard !== undefined) payload.redCards = payload.stats.redCard;
        if (payload.stats.standTackle !== undefined || payload.stats.slidingTackle !== undefined) {
          payload.tackles =
            (Number(payload.stats.standTackle) || 0) + (Number(payload.stats.slidingTackle) || 0);
        }
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
