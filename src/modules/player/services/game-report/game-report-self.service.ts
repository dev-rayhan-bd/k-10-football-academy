import { calculateMatchPerformance } from '@/utils/ratingCalculator';
import { MatchRecord } from '@/modules/player/player.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { User } from '@/modules/user/user.model';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { parseTimerInput, resolveOrCreatePlayerProfile } from './game-report.utils';

export class GameReportSelfService {
  /**
   * Flow 1: Option A - "Parent / Self Creates Report"
   * Author is tagged as Parent or Player.
   * isProfessionallyVerified is false.
   * Initiates $3.99 Stripe checkout session for platform fee.
   */
  async createSelfGameReport(userId: string, payload: any, currentUser?: any) {
    const playerProfile = await resolveOrCreatePlayerProfile(userId, payload);

    const userRole = currentUser?.role || 'PLAYER';
    const isParent = userRole === 'PARENT';

    payload.playerId = playerProfile._id;
    payload.reportCompletionType = isParent ? 'PARENT' : payload.reportCompletionType || 'SELF';
    payload.authorRole = userRole;
    payload.authorName =
      currentUser?.name || (isParent ? 'Parent' : playerProfile.fullName || 'Player');
    payload.isProfessionallyVerified = false;

    const resolvedPrice = Number(payload.price || payload.amount || 3.99);

    payload.coachReview = {
      paymentStatus: 'UNPAID',
      paymentAmount: resolvedPrice,
      status: 'COMPLETED', // Data already completed by author, activates on payment
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
    await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);

    // Create Stripe Checkout Session ($3.99 Platform Fee)
    const stripe = getStripeClient();
    const successUrl = env.STRIPE_SUCCESS_URL;
    const cancelUrl = env.STRIPE_CANCEL_URL;
    const userDoc = await User.findById(userId);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(resolvedPrice * 100),
            product_data: {
              name: 'K10 Match Report Platform Fee',
              description: `${payload.authorRole === 'PARENT' ? 'Parent' : 'Self'} Match Report for ${playerProfile.fullName || 'Player'} (${resolvedHomeTeam} vs ${resolvedOpponent})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reportType: 'MATCH_RECORD',
        subType: payload.reportCompletionType,
        reportId: record._id.toString(),
        playerId: playerProfile._id.toString(),
        userId: String(userId),
      },
      payment_intent_data: {
        metadata: {
          reportType: 'MATCH_RECORD',
          subType: payload.reportCompletionType,
          reportId: record._id.toString(),
          playerId: playerProfile._id.toString(),
          userId: String(userId),
        },
      },
      customer_email: userDoc?.email || undefined,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&reportId=${record._id}&type=MATCH_RECORD`,
      cancel_url: cancelUrl,
    });

    record.coachReview!.transactionId = session.id;
    await record.save();

    return {
      reportId: record._id,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: resolvedPrice,
      status: 'AWAITING_PAYMENT',
      isProfessionallyVerified: false,
      authorName: payload.authorName,
      authorRole: payload.authorRole,
      reportCompletionType: payload.reportCompletionType,
      record,
    };
  }
}

export const gameReportSelfService = new GameReportSelfService();
