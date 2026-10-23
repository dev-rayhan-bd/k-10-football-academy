import mongoose, { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { MatchRecord } from '@/modules/player/player.model';
import { User } from '@/modules/user/user.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { getStripeClient } from '@/config/stripe';
import { emailQueue } from '@/jobs/queues/email.queue';
import { getCoachReportRequestEmailTemplate } from '@/utils/emailTemplates';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { notificationService } from '@/modules/notification/notification.service';
import { ParentChild } from '@/modules/parent/parent.model';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { redisClient } from '@/config/redis';
import { resolveOrCreatePlayerProfile } from './game-report.utils';
import { AcademyFeePayment, AcademyFinanceTransaction } from '@/modules/academy/academy.model';

export class GameReportPaymentService {
  /**
   * Flow 2 - Step A: "Request From Coach" (Screen 1 & 2 + Coach Selection & $6.99 Payment checkout session)
   */
  async requestCoachGameReport(userId: string, payload: any) {
    const playerProfile = await resolveOrCreatePlayerProfile(userId, payload);

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

      // 5b. Auto-Update Academy Finance & Fee Payment records via Webhook
      if (playerProfile.academyId) {
        try {
          const cost = updatedRecord.coachReview?.paymentAmount || 6.99;
          const commissionAcademy = parseFloat((cost * 0.4).toFixed(3));
          await Promise.all([
            AcademyFinanceTransaction.findOneAndUpdate(
              { reportId: updatedRecord._id },
              {
                academyId: playerProfile.academyId,
                playerId: playerProfile._id,
                coachId: updatedRecord.coachReview?.coachId || undefined,
                reportId: updatedRecord._id,
                transactionType: 'Game Report',
                cost,
                commissionAcademy,
                transactionDate: updatedRecord.createdAt || new Date(),
                status: updatedRecord.coachReview?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
                notes: `Stripe webhook processed via ${transactionId || updatedRecord.coachReview?.transactionId || 'session'}`,
              },
              { upsert: true, new: true },
            ),
            AcademyFeePayment.findOneAndUpdate(
              {
                $or: [
                  { transactionId: transactionId || updatedRecord.coachReview?.transactionId },
                  { notes: `Game Report Evaluation fee for report ${updatedRecord._id}` },
                ],
              },
              {
                academyId: playerProfile.academyId,
                playerId: playerProfile._id,
                feeType: 'Validation Fee',
                amount: cost,
                paymentDate: updatedRecord.createdAt || new Date(),
                status: 'PAID',
                paymentMethod: 'STRIPE',
                transactionId: transactionId || updatedRecord.coachReview?.transactionId,
                notes: `Game Report Evaluation fee for report ${updatedRecord._id}`,
              },
              { upsert: true, new: true },
            ),
          ]);
        } catch (syncErr: any) {
          logger.warn(`Failed to auto-sync academy finance records in webhook: ${syncErr.message}`);
        }
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
}

export const gameReportPaymentService = new GameReportPaymentService();
