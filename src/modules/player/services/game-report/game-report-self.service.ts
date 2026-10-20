import { calculateMatchPerformance } from '@/utils/ratingCalculator';
import { MatchRecord } from '@/modules/player/player.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { parseTimerInput, resolveOrCreatePlayerProfile } from './game-report.utils';

export class GameReportSelfService {
  /**
   * Flow 1: "I Will Complete It" (Player submits all steps 1-5 directly)
   */
  async createSelfGameReport(userId: string, payload: any) {
    const playerProfile = await resolveOrCreatePlayerProfile(userId, payload);

    payload.playerId = playerProfile._id;
    payload.reportCompletionType = 'SELF';
    payload.coachReview = {
      paymentStatus: 'FREE',
      paymentAmount: 0,
      status: 'UNREQUESTED',
    };

    // Auto-fill playerInfo from Screen 1 if not provided or merge
    payload.playerInfo = {
      playerName: payload.playerInfo?.playerName || playerProfile.fullName,
      dateOfBirth: payload.playerInfo?.dateOfBirth || playerProfile.dateOfBirth,
      clubName: payload.playerInfo?.clubName || playerProfile.currentClub,
      position: payload.playerInfo?.position || playerProfile.position,
      foot: payload.playerInfo?.foot || playerProfile.preferredFoot,
      characteristics: payload.playerInfo?.characteristics || playerProfile.playerStyles || [],
      weight: payload.playerInfo?.weight || playerProfile.weight,
      height: payload.playerInfo?.height || playerProfile.height,
    };

    // Map UI Screen 2 to internal fields
    if (payload.gameType && !payload.leagueType) payload.leagueType = payload.gameType;
    if (payload.gameDate && !payload.matchDate) payload.matchDate = payload.gameDate;
    if (payload.gameLocation && !payload.location) payload.location = payload.gameLocation;
    const resolvedHomeTeam =
      payload.ownTeam ||
      payload.homeTeam ||
      payload.playerInfo?.clubName ||
      playerProfile.currentClub ||
      'Home Team';
    const resolvedOpponent =
      payload.opponentTeam || payload.opponent || payload.awayTeam || 'Opponent';
    const resolvedHomeScore = payload.ownTeamScore ?? payload.homeScore ?? 0;
    const resolvedAwayScore = payload.opponentTeamScore ?? payload.awayScore ?? 0;

    let resolvedResult = payload.result;
    if (!resolvedResult) {
      if (resolvedHomeScore > resolvedAwayScore) resolvedResult = 'W';
      else if (resolvedHomeScore === resolvedAwayScore) resolvedResult = 'D';
      else resolvedResult = 'L';
    }

    payload.homeTeam = resolvedHomeTeam;
    payload.awayTeam = resolvedOpponent;
    payload.homeScore = resolvedHomeScore;
    payload.awayScore = resolvedAwayScore;
    payload.result = resolvedResult;
    payload.matchResult = `${resolvedHomeTeam} ${resolvedHomeScore}-${resolvedAwayScore} ${resolvedOpponent}`;

    // Auto-map UI stats counters to MATCH_EVENTS for client's excel formula
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

    const timerResult = parseTimerInput(payload);
    payload.minutesPlayed = timerResult.minutesPlayed;
    payload.matchDuration = timerResult.matchDuration;
    const minutes = timerResult.minutesPlayed;

    // Apply 100% Client's Excel formula for player rating
    if (payload.events && payload.events.length > 0) {
      const position = playerProfile.position || 'CM';
      const perfResult = calculateMatchPerformance(position, minutes, payload.events);

      payload.playerRating = Math.round((perfResult.overallRating / 10) * 10) / 10;
      payload.positivePoints = perfResult.positivePoints;
      payload.negativePoints = perfResult.negativePoints;
      payload.netContribution = perfResult.netContribution;
      payload.interpretation = perfResult.interpretation;
      payload.categoryScores = perfResult.categoryAdjustedScores;
      payload.categoryRatings = perfResult.categoryRatings;
    }

    // Direct stats shortcuts
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

    const record = await MatchRecord.create(payload);
    await playerStatsService.recalculatePlayerStats(playerProfile._id);

    return record;
  }
}

export const gameReportSelfService = new GameReportSelfService();
