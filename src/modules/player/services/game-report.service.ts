import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { calculateMatchPerformance } from '@/utils/ratingCalculator';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { User } from '@/modules/user/user.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { getStripeClient } from '@/config/stripe';
import { emailQueue } from '@/jobs/queues/email.queue';
import {
  getCoachReportRequestEmailTemplate,
  getPlayerReportCompletedEmailTemplate,
} from '@/utils/emailTemplates';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';

/**
 * Parse timer formatted as min:sec (e.g. "08:08", "76:30") or numeric minutes
 */
export function parseTimerInput(payload: {
  timer?: any;
  matchTime?: any;
  matchDuration?: any;
  minutesPlayed?: any;
}): { minutesPlayed: number; matchDuration: string } {
  const raw = payload.timer ?? payload.matchTime ?? payload.matchDuration ?? payload.minutesPlayed;

  if (raw === undefined || raw === null || raw === '') {
    throw new AppError(
      400,
      'Match timer is strictly required in min:sec format (e.g. "08:08" or "76:30"). Please provide the exact timer value.',
    );
  }

  if (typeof raw === 'number') {
    if (raw <= 0) {
      throw new AppError(400, 'Match timer must be greater than 0.');
    }
    const mins = Math.floor(raw);
    const secs = Math.round((raw - mins) * 60);
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return { minutesPlayed: Math.round(raw * 100) / 100, matchDuration: formatted };
  }

  const str = String(raw).trim();
  if (!str) {
    throw new AppError(
      400,
      'Match timer is strictly required in min:sec format (e.g. "08:08" or "76:30").',
    );
  }

  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secs = parseInt(parts[1], 10);
      if (
        isNaN(mins) ||
        isNaN(secs) ||
        mins < 0 ||
        secs < 0 ||
        secs >= 60 ||
        (mins === 0 && secs === 0)
      ) {
        throw new AppError(
          400,
          'Invalid min:sec timer format. Format must be "mm:ss" (e.g. "08:08", "76:30") with seconds between 00-59 and time > 0.',
        );
      }
      const totalMinutes = Math.round((mins + secs / 60) * 100) / 100;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      return { minutesPlayed: totalMinutes, matchDuration: formatted };
    }
  }

  const parsedNum = parseFloat(str);
  if (isNaN(parsedNum) || parsedNum <= 0) {
    throw new AppError(
      400,
      'Invalid timer input. Format must be min:sec (e.g., "08:08" or "76:30").',
    );
  }
  const mins = Math.floor(parsedNum);
  const secs = Math.round((parsedNum - mins) * 60);
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return { minutesPlayed: Math.round(parsedNum * 100) / 100, matchDuration: formatted };
}

export class GameReportService {
  /**
   * Helper to resolve PlayerProfile by userId or auto-create it from Screen 1 playerInfo
   */
  private async resolveOrCreatePlayerProfile(userId: string, payload: any) {
    let playerProfile = null;

    if (userId && Types.ObjectId.isValid(userId)) {
      playerProfile = await PlayerProfile.findOne({
        $or: [{ userId: new Types.ObjectId(userId) }, { _id: new Types.ObjectId(userId) }],
      });
    }

    if (!playerProfile && payload?.playerId && Types.ObjectId.isValid(payload.playerId)) {
      playerProfile = await PlayerProfile.findById(payload.playerId);
    }

    if (!playerProfile && userId && Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
      if (user) {
        playerProfile = await PlayerProfile.create({
          userId: user._id,
          fullName: payload.playerInfo?.playerName || user.name || 'Player',
          dateOfBirth: payload.playerInfo?.dateOfBirth
            ? new Date(payload.playerInfo.dateOfBirth)
            : undefined,
          position: payload.playerInfo?.position || 'CM',
          preferredFoot: payload.playerInfo?.foot?.toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT',
          currentClub: payload.playerInfo?.clubName || 'Free Agent',
          weight: payload.playerInfo?.weight,
          height: payload.playerInfo?.height,
          playerStyles: payload.playerInfo?.characteristics || [],
        });
      }
    }

    if (!playerProfile) {
      throw new AppError(
        404,
        'Player profile not found for this user. Please ensure you are logged in as a valid player.',
      );
    }

    return playerProfile;
  }

  /**
   * Flow 1: "I Will Complete It" (Player submits all steps 1-5 directly)
   */
  async createSelfGameReport(userId: string, payload: any) {
    const playerProfile = await this.resolveOrCreatePlayerProfile(userId, payload);

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
    if (!payload.homeTeam && payload.playerInfo?.clubName)
      payload.homeTeam = payload.playerInfo.clubName;
    if (!payload.awayTeam) payload.awayTeam = 'Opponent';

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

  /**
   * Flow 2 - Step A: "Request From Coach" (Screen 1 & 2 + Coach Selection & $6.99 Payment checkout session)
   */
  async requestCoachGameReport(userId: string, payload: any) {
    const playerProfile = await this.resolveOrCreatePlayerProfile(userId, payload);

    const {
      coachId,
      coachEmail,
      coachName,
      playerInfo,
      gameType,
      gameDate,
      gameLocation,
      matchResult,
      weather,
      temperature,
      scoutName,
    } = payload;

    const successUrl = env.STRIPE_SUCCESS_URL;
    const cancelUrl = env.STRIPE_CANCEL_URL;

    // Support both coachId selection from Dropdown (User ID or CoachProfile ID) or manual coachEmail
    let coachUser = null;
    let targetCoachEmail = coachEmail?.toLowerCase().trim();
    let targetCoachName = coachName;

    if (coachId && Types.ObjectId.isValid(coachId)) {
      coachUser = await User.findById(coachId);
      if (!coachUser) {
        const coachProf = await CoachProfile.findById(coachId);
        if (coachProf) {
          coachUser = await User.findById(coachProf.userId);
          if (!targetCoachName) targetCoachName = coachProf.fullName;
        }
      }
      if (coachUser) {
        targetCoachEmail = coachUser.email;
        if (!targetCoachName) targetCoachName = coachUser.name;
      }
    } else if (targetCoachEmail) {
      coachUser = await User.findOne({ email: targetCoachEmail });
      if (coachUser && !targetCoachName) {
        targetCoachName = coachUser.name;
      }
    }

    if (!targetCoachEmail) {
      throw new AppError(
        400,
        'Selected coach was not found or coach email is missing. Please select a valid coach from the list.',
      );
    }

    // Auto-fill playerInfo from Screen 1
    const mergedPlayerInfo = {
      playerName: playerInfo?.playerName || playerProfile.fullName,
      dateOfBirth: playerInfo?.dateOfBirth || playerProfile.dateOfBirth,
      clubName: playerInfo?.clubName || playerProfile.currentClub,
      position: playerInfo?.position || playerProfile.position,
      foot: playerInfo?.foot || playerProfile.preferredFoot,
      characteristics: playerInfo?.characteristics || playerProfile.playerStyles || [],
      weight: playerInfo?.weight || playerProfile.weight,
      height: playerInfo?.height || playerProfile.height,
    };

    const resolvedGameType = gameType || payload.leagueType || 'Friendly Championship Catarinese';
    const resolvedMatchDate = gameDate || payload.matchDate || new Date();
    const resolvedLocation = gameLocation || payload.location || 'London';
    const resolvedHomeTeam = mergedPlayerInfo.clubName || payload.homeTeam || 'Home Team';
    const resolvedAwayTeam = payload.awayTeam || 'Opponent';

    // Create Draft Match Record waiting for payment
    const matchRecord = await MatchRecord.create({
      playerId: playerProfile._id,
      playerInfo: mergedPlayerInfo,
      gameType: resolvedGameType,
      gameDate: resolvedMatchDate,
      gameLocation: resolvedLocation,
      matchResult:
        matchResult || payload.matchResult || `${resolvedHomeTeam} vs ${resolvedAwayTeam}`,
      matchDate: resolvedMatchDate,
      leagueType: resolvedGameType,
      homeTeam: resolvedHomeTeam,
      awayTeam: resolvedAwayTeam,
      homeScore: payload.homeScore ?? 0,
      awayScore: payload.awayScore ?? 0,
      result: payload.result || 'W',
      location: resolvedLocation,
      weather: weather || 'RAINY',
      temperature: temperature ?? 19,
      scoutName: scoutName || 'Scout',
      minutesPlayed: 0, // Will be set by Coach from Screen 3 match timer
      reportCompletionType: 'COACH',
      playerRating: 0,
      goals: 0,
      assists: 0,
      passes: 0,
      passAccuracy: 0,
      coachReview: {
        coachId: coachUser
          ? coachUser._id
          : coachId && Types.ObjectId.isValid(coachId)
            ? coachId
            : undefined,
        coachEmail: targetCoachEmail,
        coachName: targetCoachName || 'Coach',
        paymentStatus: 'UNPAID',
        paymentAmount: 6.99,
        status: 'PENDING',
      },
    });

    // Create Stripe Checkout Session for $6.99
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: 699, // $6.99 in cents
            product_data: {
              name: 'Professional Coach Game Report Evaluation',
              description: `Match analysis for ${playerProfile.fullName || 'Player'} (${resolvedHomeTeam} vs ${resolvedAwayTeam})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reportId: matchRecord._id.toString(),
        playerId: playerProfile._id.toString(),
        coachEmail: targetCoachEmail,
      },
      customer_email: (await User.findById(playerProfile.userId))?.email || undefined,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&reportId=${matchRecord._id}`,
      cancel_url: cancelUrl,
    });

    // Save transaction / session id
    matchRecord.coachReview!.transactionId = session.id;
    await matchRecord.save();

    return {
      reportId: matchRecord._id,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: 6.99,
      status: 'AWAITING_PAYMENT',
    };
  }

  /**
   * Handle Stripe Webhook Events (Mark as PAID and notify coach via Email)
   */
  async handleStripeWebhook(event: any) {
    logger.info(`Processing Stripe Webhook Event: ${event.type}`);

    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      const session = event.data.object;
      const reportId = session.metadata?.reportId;

      if (!reportId) {
        logger.warn('Stripe Webhook received without reportId in metadata.');
        return { received: true };
      }

      const matchRecord = await MatchRecord.findById(reportId).populate('playerId');
      if (!matchRecord) {
        logger.warn(`MatchRecord not found for reportId: ${reportId}`);
        return { received: true };
      }

      // Update payment status
      if (matchRecord.coachReview) {
        matchRecord.coachReview.paymentStatus = 'PAID';
        matchRecord.coachReview.status = 'PENDING';
      }
      await matchRecord.save();

      // Trigger Email Notification to Coach
      const coachEmail = matchRecord.coachReview?.coachEmail;
      const coachName = matchRecord.coachReview?.coachName || 'Coach';
      const player = (matchRecord.playerId as any) || {};
      const playerName = player.fullName || 'Player';

      if (coachEmail) {
        const evaluationUrl = `https://k10football.com/coach/evaluate/${matchRecord._id}`;
        const emailHtml = getCoachReportRequestEmailTemplate(
          coachName,
          playerName,
          {
            leagueType: matchRecord.gameType || matchRecord.leagueType || 'Championship',
            homeTeam: matchRecord.homeTeam || 'Home Team',
            awayTeam: matchRecord.awayTeam || 'Opponent',
            matchDate: new Date(
              matchRecord.gameDate || matchRecord.matchDate || Date.now(),
            ).toLocaleDateString(),
          },
          evaluationUrl,
        );

        await emailQueue.add('send-coach-report-request', {
          to: coachEmail,
          subject: `Coach Evaluation Request: Review ${playerName}'s Match Performance`,
          body: emailHtml,
        });

        logger.info(`Evaluation notification email queued to coach: ${coachEmail}`);
      }
    }

    return { received: true };
  }

  /**
   * Flow 2 - Step B: Coach Completes Match Report (Screen 3, 4, 5 with 24 counters and markers)
   */
  async completeCoachGameReport(reportId: string, coachUser: any, payload: any) {
    const matchRecord = await MatchRecord.findById(reportId).populate('playerId');
    if (!matchRecord) {
      throw new AppError(404, 'Match record not found.');
    }

    const playerProfile = (matchRecord.playerId as any) || {};
    const position = playerProfile.position || 'CM';

    const { stats = {}, accurateShots = [], accurateAssists = [], coachFeedback = '' } = payload;

    const timerResult = parseTimerInput(payload);
    const finalMinutes = timerResult.minutesPlayed;

    // Auto-map UI stats counters to MATCH_EVENTS for client's excel formula
    const eventsMap: Record<string, number> = {};
    if (stats.goalScored) eventsMap['goal'] = (eventsMap['goal'] || 0) + Number(stats.goalScored);
    if (stats.assists) eventsMap['assist'] = (eventsMap['assist'] || 0) + Number(stats.assists);
    if (stats.shotsOnGoal)
      eventsMap['shot_on_target'] = (eventsMap['shot_on_target'] || 0) + Number(stats.shotsOnGoal);
    if (stats.passAccurate)
      eventsMap['key_pass'] = (eventsMap['key_pass'] || 0) + Number(stats.passAccurate);
    if (stats.standTackle)
      eventsMap['tackle_won'] = (eventsMap['tackle_won'] || 0) + Number(stats.standTackle);
    if (stats.slidingTackle)
      eventsMap['tackle_won'] = (eventsMap['tackle_won'] || 0) + Number(stats.slidingTackle);
    if (stats.interception)
      eventsMap['interception'] = (eventsMap['interception'] || 0) + Number(stats.interception);
    if (stats.fault)
      eventsMap['foul_committed'] = (eventsMap['foul_committed'] || 0) + Number(stats.fault);
    if (stats.yellowCard)
      eventsMap['yellow_card'] = (eventsMap['yellow_card'] || 0) + Number(stats.yellowCard);
    if (stats.redCard) eventsMap['red_card'] = (eventsMap['red_card'] || 0) + Number(stats.redCard);
    if (stats.savesAccurate)
      eventsMap['save'] = (eventsMap['save'] || 0) + Number(stats.savesAccurate);
    if (stats.goalUnsave)
      eventsMap['goal_conceded'] = (eventsMap['goal_conceded'] || 0) + Number(stats.goalUnsave);

    const events = Object.entries(eventsMap).map(([eventId, count]) => ({
      eventId,
      count,
    }));

    // Apply Client's 100% Excel formula
    const perfResult = calculateMatchPerformance(position, finalMinutes, events);
    const finalRating = Math.round((perfResult.overallRating / 10) * 10) / 10;

    matchRecord.minutesPlayed = finalMinutes;
    matchRecord.matchDuration = timerResult.matchDuration;
    matchRecord.stats = stats;
    matchRecord.accurateShots = accurateShots;
    matchRecord.accurateAssists = accurateAssists;
    matchRecord.events = events;
    matchRecord.playerRating = finalRating;
    matchRecord.positivePoints = perfResult.positivePoints;
    matchRecord.negativePoints = perfResult.negativePoints;
    matchRecord.netContribution = perfResult.netContribution;
    matchRecord.interpretation = perfResult.interpretation;
    matchRecord.categoryScores = perfResult.categoryAdjustedScores as any;
    matchRecord.categoryRatings = perfResult.categoryRatings as any;

    if (stats.goalScored !== undefined) matchRecord.goals = stats.goalScored;
    if (stats.assists !== undefined) matchRecord.assists = stats.assists;
    if (stats.passAccurate !== undefined) {
      const acc = Number(stats.passAccurate) || 0;
      const wrong = Number(stats.wrongPass) || 0;
      matchRecord.passes = acc + wrong;
      matchRecord.passAccuracy =
        matchRecord.passes > 0 ? Math.round((acc / matchRecord.passes) * 100) : 0;
    }
    if (stats.yellowCard !== undefined) matchRecord.yellowCards = stats.yellowCard;
    if (stats.redCard !== undefined) matchRecord.redCards = stats.redCard;
    if (stats.standTackle !== undefined || stats.slidingTackle !== undefined) {
      matchRecord.tackles = (Number(stats.standTackle) || 0) + (Number(stats.slidingTackle) || 0);
    }

    if (matchRecord.coachReview) {
      matchRecord.coachReview.status = 'COMPLETED';
      matchRecord.coachReview.evaluatedAt = new Date();
      matchRecord.coachReview.coachRating = finalRating;
      matchRecord.coachReview.coachFeedback = coachFeedback;
      matchRecord.coachReview.coachId = coachUser._id;
    }

    await matchRecord.save();
    await playerStatsService.recalculatePlayerStats(playerProfile._id);

    // Send Completion Notification Email to Player
    const playerUser = await User.findById(playerProfile.userId);
    if (playerUser && playerUser.email) {
      const cvUrl = `https://k10football.com/player/cv`;
      const emailHtml = getPlayerReportCompletedEmailTemplate(
        playerProfile.fullName || playerUser.name,
        coachUser.name || 'Your Coach',
        finalRating,
        perfResult.interpretation,
        cvUrl,
      );

      await emailQueue.add('send-player-report-completed', {
        to: playerUser.email,
        subject: `Your Match Report Has Been Evaluated by Coach ${coachUser.name || ''}`,
        body: emailHtml,
      });

      logger.info(`Evaluation completed email queued to player: ${playerUser.email}`);
    }

    return matchRecord;
  }

  /**
   * Get Reports Assigned to Coach for Evaluation
   */
  async getCoachPendingReports(coachEmail: string) {
    return MatchRecord.find({
      'coachReview.coachEmail': coachEmail.toLowerCase().trim(),
      'coachReview.paymentStatus': 'PAID',
      'coachReview.status': 'PENDING',
    })
      .populate('playerId')
      .sort({ createdAt: -1 });
  }
}

export const gameReportService = new GameReportService();
