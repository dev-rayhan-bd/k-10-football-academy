import mongoose, { Types } from 'mongoose';
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
import { notificationService } from '@/modules/notification/notification.service';
import { ParentChild } from '@/modules/parent/parent.model';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { redisClient } from '@/config/redis';

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
    const resolvedHomeTeam =
      payload.ownTeam ||
      payload.homeTeam ||
      mergedPlayerInfo.clubName ||
      playerProfile.currentClub ||
      'Home Team';
    const resolvedOpponent =
      payload.opponentTeam || payload.opponent || payload.awayTeam || 'Opponent';
    const resolvedAwayTeam = resolvedOpponent;
    const resolvedHomeScore = payload.ownTeamScore ?? payload.homeScore ?? 0;
    const resolvedAwayScore = payload.opponentTeamScore ?? payload.awayScore ?? 0;

    let resolvedResult = payload.result;
    if (!resolvedResult) {
      if (resolvedHomeScore > resolvedAwayScore) resolvedResult = 'W';
      else if (resolvedHomeScore === resolvedAwayScore) resolvedResult = 'D';
      else resolvedResult = 'L';
    }

    // Reuse/update existing UNPAID draft for this player if one exists to avoid duplicates
    let matchRecord = await MatchRecord.findOne({
      playerId: playerProfile._id,
      reportCompletionType: 'COACH',
      'coachReview.paymentStatus': 'UNPAID',
    });

    const draftData = {
      playerId: playerProfile._id,
      playerInfo: mergedPlayerInfo,
      gameType: resolvedGameType,
      gameDate: resolvedMatchDate,
      gameLocation: resolvedLocation,
      matchResult:
        matchResult ||
        payload.matchResult ||
        `${resolvedHomeTeam} ${resolvedHomeScore}-${resolvedAwayScore} ${resolvedAwayTeam}`,
      matchDate: resolvedMatchDate,
      leagueType: resolvedGameType,
      homeTeam: resolvedHomeTeam,
      awayTeam: resolvedAwayTeam,
      homeScore: resolvedHomeScore,
      awayScore: resolvedAwayScore,
      result: resolvedResult,
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
    };

    if (matchRecord) {
      Object.assign(matchRecord, draftData);
      await matchRecord.save();
    } else {
      matchRecord = await MatchRecord.create(draftData);
    }

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
      payment_intent_data: {
        metadata: {
          reportId: matchRecord._id.toString(),
          playerId: playerProfile._id.toString(),
          coachEmail: targetCoachEmail,
        },
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
   * Finalize Paid Game Report (Called by Stripe Webhook and Payment Verification endpoint)
   * ACID Transaction with MongoDB + Strict Idempotency Lock
   */
  async finalizePaidGameReport(reportId: string, transactionId?: string) {
    // 1. Distributed Idempotency Lock via Redis (prevents parallel race conditions)
    const lockKey = `LOCK:PAYMENT:${reportId}`;
    let lockAcquired = false;
    try {
      const lockRes = await redisClient.set(lockKey, 'LOCKED', 'EX', 15, 'NX');
      if (lockRes === 'OK') {
        lockAcquired = true;
      }
    } catch (redisErr: any) {
      logger.warn(
        `Redis lock attempt failed: ${redisErr.message}, proceeding with DB atomic lock.`,
      );
    }

    try {
      // 2. Early Idempotency Check: if already PAID, return immediately without duplicate side-effects
      const existingRecord = await MatchRecord.findById(reportId).populate('playerId');
      if (!existingRecord) {
        logger.warn(`MatchRecord not found for reportId: ${reportId}`);
        return { success: false, message: 'Match record not found' };
      }

      if (existingRecord.coachReview?.paymentStatus === 'PAID') {
        logger.info(
          `Report ${reportId} is already PAID. Idempotent return without duplicate notifications.`,
        );
        return {
          success: true,
          message: 'Payment already processed (idempotent)',
          matchRecord: existingRecord,
        };
      }

      // 3. ACID Transaction: State transition in MongoDB
      const session = await mongoose.startSession();
      let updatedRecord: any = null;
      let transactionSupported = true;

      try {
        session.startTransaction();
        updatedRecord = await MatchRecord.findOneAndUpdate(
          {
            _id: reportId,
            'coachReview.paymentStatus': { $ne: 'PAID' },
          },
          {
            $set: {
              'coachReview.paymentStatus': 'PAID',
              'coachReview.status': 'PENDING',
              ...(transactionId ? { 'coachReview.transactionId': transactionId } : {}),
            },
          },
          { new: true, session },
        ).populate('playerId');

        await session.commitTransaction();
      } catch (txnError: any) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        // Fallback for standalone MongoDB deployments where multi-document transactions are unsupported
        if (
          txnError?.message?.includes('replica set') ||
          txnError?.message?.includes('standalone') ||
          txnError?.message?.includes('Transactions are not supported')
        ) {
          transactionSupported = false;
        } else {
          logger.error({ txnError }, 'Database transaction error in finalizePaidGameReport');
          throw txnError;
        }
      } finally {
        await session.endSession();
      }

      if (!transactionSupported) {
        // Atomic single-document update (ACID compliant on document level in MongoDB)
        updatedRecord = await MatchRecord.findOneAndUpdate(
          {
            _id: reportId,
            'coachReview.paymentStatus': { $ne: 'PAID' },
          },
          {
            $set: {
              'coachReview.paymentStatus': 'PAID',
              'coachReview.status': 'PENDING',
              ...(transactionId ? { 'coachReview.transactionId': transactionId } : {}),
            },
          },
          { new: true },
        ).populate('playerId');
      }

      // 4. Concurrency Guard: If another process updated it first, exit idempotently
      if (!updatedRecord) {
        const recheck = await MatchRecord.findById(reportId).populate('playerId');
        if (recheck?.coachReview?.paymentStatus === 'PAID') {
          return {
            success: true,
            message: 'Payment already processed concurrently',
            matchRecord: recheck,
          };
        }
        return { success: false, message: 'Failed to update payment status' };
      }

      const playerProfile = (updatedRecord.playerId as any) || {};
      const playerName = playerProfile.fullName || 'Player';
      const matchTitle = updatedRecord.awayTeam
        ? `vs ${updatedRecord.awayTeam}`
        : updatedRecord.gameType || 'Match';

      // 5. Invalidate Player Cache so CV immediately shows PAID and pending status!
      if (playerProfile._id) {
        await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);
      }

      // 6. In-App Notification to Player (Guaranteed Exactly Once)
      if (playerProfile.userId) {
        await notificationService.createNotification({
          recipientId: playerProfile.userId,
          recipientRole: 'ATHLETE',
          title: 'Payment Successful ($6.99)',
          message: `Your payment of $6.99 for coach evaluation (${matchTitle}) was successful. Awaiting coach review.`,
          type: 'PAYMENT_SUCCESS',
          data: { reportId: updatedRecord._id },
        });
      }

      // 7. In-App Notification to Parent(s) if linked (Guaranteed Exactly Once)
      if (playerProfile._id) {
        try {
          const parentLinks = await ParentChild.find({
            childPlayerId: playerProfile._id,
          }).populate('parentId');
          for (const link of parentLinks) {
            const parent = link.parentId as any;
            if (parent && parent.userId) {
              await notificationService.createNotification({
                recipientId: parent.userId,
                recipientRole: 'PARENT',
                title: 'Child Coach Evaluation Requested',
                message: `${playerName} requested a coach evaluation for match ${matchTitle} ($6.99 paid).`,
                type: 'CHILD_GAME_REPORT_REQUEST',
                data: { reportId: updatedRecord._id, childPlayerId: playerProfile._id },
              });
            }
          }
        } catch (err: any) {
          logger.error({ err }, 'Error sending parent notification');
        }
      }

      // 8. In-App Notification to Coach (Guaranteed Exactly Once)
      const coachId = updatedRecord.coachReview?.coachId;
      if (coachId) {
        await notificationService.createNotification({
          recipientId: coachId,
          recipientRole: 'COACH',
          title: 'New Match Evaluation Request',
          message: `You have received a new match evaluation request for ${playerName} (${matchTitle}).`,
          type: 'NEW_EVALUATION_REQUEST',
          data: { reportId: updatedRecord._id },
        });
      }

      // 9. Email Notification to Coach (Guaranteed Exactly Once via BullMQ job deduplication)
      const coachEmail = updatedRecord.coachReview?.coachEmail;
      const coachName = updatedRecord.coachReview?.coachName || 'Coach';
      if (coachEmail) {
        const evaluationUrl = `${env.CLIENT_URL || 'https://k-10-football-academy.onrender.com'}/coach/evaluate/${updatedRecord._id}`;
        const emailHtml = getCoachReportRequestEmailTemplate(
          coachName,
          playerName,
          {
            leagueType: updatedRecord.gameType || updatedRecord.leagueType || 'Championship',
            homeTeam: updatedRecord.homeTeam || 'Home Team',
            awayTeam: updatedRecord.awayTeam || 'Opponent',
            matchDate: new Date(
              updatedRecord.gameDate || updatedRecord.matchDate || Date.now(),
            ).toLocaleDateString(),
          },
          evaluationUrl,
        );

        try {
          await emailQueue.add(
            'send-coach-report-request',
            {
              to: coachEmail,
              subject: `Coach Evaluation Request: Review ${playerName}'s Match Performance`,
              body: emailHtml,
            },
            {
              jobId: `coach-eval-req-${updatedRecord._id}`, // BullMQ idempotency deduplication by unique jobId
            },
          );
          logger.info(`Evaluation notification email queued to coach: ${coachEmail}`);
        } catch (emailErr: any) {
          logger.error({ emailErr }, 'Failed to queue coach evaluation email');
        }
      }

      return { success: true, matchRecord: updatedRecord };
    } finally {
      if (lockAcquired) {
        try {
          await redisClient.del(lockKey);
        } catch (delErr: any) {
          logger.warn(`Failed to release redis lock: ${delErr.message}`);
        }
      }
    }
  }

  /**
   * Handle Stripe Webhook Events
   */
  async handleStripeWebhook(event: any) {
    logger.info(`Processing Stripe Webhook Event: ${event?.type}`);

    if (
      event &&
      (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded')
    ) {
      const obj = event.data?.object || {};
      let reportId = obj.metadata?.reportId;

      if (!reportId && obj.id) {
        const found = await MatchRecord.findOne({
          $or: [
            { 'coachReview.transactionId': obj.id },
            { 'coachReview.transactionId': obj.payment_intent },
          ],
        });
        if (found) {
          reportId = found._id.toString();
        }
      }

      if (!reportId) {
        logger.warn('Stripe Webhook received without matching reportId.');
        return { received: true };
      }

      await this.finalizePaidGameReport(reportId, obj.id);
    }

    return { received: true };
  }

  /**
   * Verify Payment Session (Real-time check directly from Stripe API)
   */
  async verifyPayment(sessionId?: string, reportId?: string) {
    const stripe = getStripeClient();

    let targetReportId = reportId;

    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          targetReportId = session.metadata?.reportId || targetReportId;
          if (!targetReportId && session.id) {
            const match = await MatchRecord.findOne({ 'coachReview.transactionId': session.id });
            if (match) targetReportId = match._id.toString();
          }
          const transactionId = session.id || sessionId;
          if (targetReportId) {
            return this.finalizePaidGameReport(targetReportId, transactionId);
          }
        }
      } catch (err: any) {
        logger.warn(`Failed to retrieve Stripe session ${sessionId}: ${err.message}`);
      }
    }

    if (targetReportId) {
      const match = await MatchRecord.findById(targetReportId);
      if (match?.coachReview?.transactionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(match.coachReview.transactionId);
          if (session.payment_status === 'paid') {
            return this.finalizePaidGameReport(targetReportId, session.id);
          }
        } catch (err: any) {
          logger.warn(`Failed to retrieve Stripe session by transactionId: ${err.message}`);
        }
      }
    }

    return { success: false, message: 'Payment has not been completed or verified yet.' };
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

    // Invalidate player cache so CV immediately reflects updated rating & feedback
    if (playerProfile._id) {
      await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);
    }

    // In-app Notification to Player
    if (playerProfile.userId) {
      await notificationService.createNotification({
        recipientId: playerProfile.userId,
        recipientRole: 'ATHLETE',
        title: 'Coach Evaluation Completed',
        message: `Coach ${coachUser.name || 'Your Coach'} evaluated your match performance. Rating: ${finalRating}/100.`,
        type: 'EVALUATION_COMPLETED',
        data: { reportId: matchRecord._id, rating: finalRating },
      });
    }

    // In-app Notification to Parent(s) if linked
    if (playerProfile._id) {
      try {
        const parentLinks = await ParentChild.find({
          childPlayerId: playerProfile._id,
        }).populate('parentId');
        for (const link of parentLinks) {
          const parent = link.parentId as any;
          if (parent && parent.userId) {
            await notificationService.createNotification({
              recipientId: parent.userId,
              recipientRole: 'PARENT',
              title: 'Child Match Evaluation Completed',
              message: `Coach ${coachUser.name || 'Coach'} completed the match evaluation for ${playerProfile.fullName || 'your child'}. Rating: ${finalRating}/100.`,
              type: 'CHILD_EVALUATION_COMPLETED',
              data: {
                reportId: matchRecord._id,
                childPlayerId: playerProfile._id,
                rating: finalRating,
              },
            });
          }
        }
      } catch (err: any) {
        logger.error({ err }, 'Error sending parent completion notification');
      }
    }

    // Send Completion Notification Email to Player
    const playerUser = await User.findById(playerProfile.userId);
    if (playerUser && playerUser.email) {
      const cvUrl = `${env.CLIENT_URL || 'https://k-10-football-academy.onrender.com'}/player/cv`;
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
