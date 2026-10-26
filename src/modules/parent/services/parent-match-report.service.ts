import mongoose, { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import { env } from '@/config/env';
import { UserModel } from '@/modules/user/user.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { AcademyFinanceTransaction, AcademyProfile } from '@/modules/academy/academy.model';
import { getStripeClient } from '@/config/stripe';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';
import { notificationService } from '@/modules/notification/notification.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { ParentProfile, ParentChild, ParentMatchReport } from '../parent.model';

export class ParentMatchReportService {
  async createMatchReport(parentId: string, payload: any, user?: any) {
    let effectiveParentId = parentId;
    const targetParentIds: any[] = [parentId];
    if (Types.ObjectId.isValid(parentId)) {
      const parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      });
      if (parentProfile) {
        effectiveParentId = parentProfile._id.toString();
        targetParentIds.push(parentProfile._id);
        targetParentIds.push(parentProfile.userId);
      }
    }

    const childPlayerId = payload.childPlayerId;
    if (!childPlayerId || !Types.ObjectId.isValid(childPlayerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid child player ID is required');
    }

    const player = await PlayerProfile.findOne({
      $or: [{ _id: childPlayerId }, { userId: childPlayerId }],
    });
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Athlete/Player profile not found');
    }

    // Security check: verify that ParentChild link exists between this parent and this child
    const targetChildIds: any[] = [player._id];
    if (player.userId) {
      targetChildIds.push(player.userId);
    }
    if (Types.ObjectId.isValid(childPlayerId)) {
      targetChildIds.push(new Types.ObjectId(childPlayerId));
    }

    const linkExists = await ParentChild.findOne({
      parentId: { $in: targetParentIds },
      childPlayerId: { $in: targetChildIds },
    });

    if (!linkExists && user?.role !== 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Access denied. This child player is not linked to your parent account.',
      );
    }

    let plottedEventsJson = payload.plottedEventsJson || '';
    let plottedCount = 0;
    if (Array.isArray(payload.plottedEvents)) {
      plottedCount = payload.plottedEvents.length;
      plottedEventsJson = JSON.stringify(payload.plottedEvents);
    } else if (payload.plottedEventsJson) {
      try {
        const parsed = JSON.parse(payload.plottedEventsJson);
        plottedCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        plottedCount = 0;
      }
    }

    const coachReviewPrice = Number(payload.coachReviewPrice || 25);
    const requestReview = Boolean(payload.requestCoachReview);

    let coachObjectId = undefined;
    if (payload.coachId && Types.ObjectId.isValid(payload.coachId)) {
      coachObjectId = new Types.ObjectId(payload.coachId);
    }

    const report = await ParentMatchReport.create({
      parentId: effectiveParentId,
      childPlayerId: player._id,
      coachId: coachObjectId,
      opponentTeam: payload.opponentTeam || 'Opponent',
      matchDate: new Date(payload.matchDate || Date.now()),
      plottedEventsJson,
      plottedCount,
      coachReviewStatus: requestReview ? 'AWAITING_PAYMENT' : 'UNREQUESTED',
      coachReviewPrice,
      paymentStatus: 'UNPAID',
    });

    const reportObj: any = report.toObject();
    reportObj.childPlayerId = player;
    const clean = this.formatCleanMatchReport(reportObj);

    if (requestReview) {
      const checkoutData = await this.requestMatchReportReview(
        parentId,
        report._id.toString(),
        {
          coachReviewPrice,
          coachId: payload.coachId,
        },
        user,
      );
      return {
        ...clean,
        checkoutUrl: checkoutData.checkoutUrl,
        sessionId: checkoutData.sessionId,
      };
    }

    return clean;
  }

  async getMatchReports(parentId: string) {
    const targetParentIds: any[] = [parentId];
    if (Types.ObjectId.isValid(parentId)) {
      const parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      });
      if (parentProfile) {
        targetParentIds.push(parentProfile._id);
        targetParentIds.push(parentProfile.userId);
      }
    }

    const reports = await ParentMatchReport.find({
      parentId: { $in: targetParentIds },
    })
      .populate('childPlayerId', 'fullName position profileImage overallRating age country')
      .populate('coachId', 'name email avatar')
      .sort({ matchDate: -1, createdAt: -1 })
      .lean();

    return reports.map((r: any) => {
      const p = r.childPlayerId || {};
      const opponentClean = (r.opponentTeam || 'Opponent').trim();
      const opponentDisplay = opponentClean.toLowerCase().startsWith('vs')
        ? opponentClean
        : `vs ${opponentClean}`;

      let parsedEvents: any[] = [];
      if (Array.isArray(r.plottedEvents)) {
        parsedEvents = r.plottedEvents;
      } else if (r.plottedEventsJson) {
        try {
          const parsed = JSON.parse(r.plottedEventsJson);
          if (Array.isArray(parsed)) parsedEvents = parsed;
        } catch {
          parsedEvents = [];
        }
      }

      const goals = parsedEvents.filter(
        (e: any) => String(e.type || e.eventType || '').toUpperCase() === 'GOAL',
      ).length;

      const assists = parsedEvents.filter(
        (e: any) => String(e.type || e.eventType || '').toUpperCase() === 'ASSIST',
      ).length;

      const plottedCount = parsedEvents.length || r.plottedCount || 0;

      const isEvaluated = r.coachReviewStatus === 'EVALUATED';
      const isPaid = r.paymentStatus === 'PAID';
      const isPendingReview = isPaid && !isEvaluated;

      let actionText = `REQUEST REVIEW ($${(r.coachReviewPrice || 25).toFixed(2)})`;
      if (isEvaluated) {
        actionText = 'COACH EVALUATED';
      } else if (isPendingReview) {
        actionText = 'COACH EVALUATION PENDING';
      }

      return {
        _id: r._id,
        id: r._id,
        opponentTeam: opponentDisplay,
        rawOpponentTeam: r.opponentTeam,
        matchDate: r.matchDate,
        rating: r.coachRating !== undefined && r.coachRating !== null ? r.coachRating : 'N/A',
        goals,
        assists,
        plottedCount,
        plottedEvents: parsedEvents,
        status: isEvaluated ? 'Verified' : 'Pending',
        coachReviewStatus: r.coachReviewStatus || 'UNREQUESTED',
        coachReviewPrice: r.coachReviewPrice || 25,
        paymentStatus: r.paymentStatus || 'UNPAID',
        checkoutUrl: isPaid ? null : r.checkoutUrl || null,
        action: actionText,
        childPlayer: {
          _id: p._id,
          fullName: p.fullName || 'Athlete',
          position: p.position || 'Forward',
          profileImage: p.profileImage || '',
        },
        coach: r.coachId
          ? {
              _id: r.coachId._id,
              name: r.coachId.name || 'Coach',
              email: r.coachId.email || '',
            }
          : null,
        createdAt: r.createdAt,
      };
    });
  }

  async requestMatchReportReview(
    parentId: string,
    reportId: string,
    payload: any = {},
    user?: any,
  ) {
    const report = await ParentMatchReport.findById(reportId);
    if (!report) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Match report not found');
    }

    // Security check: Verify parent ownership of report
    const targetParentIds: string[] = [parentId?.toString()];
    if (Types.ObjectId.isValid(parentId)) {
      const parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      });
      if (parentProfile) {
        targetParentIds.push(parentProfile._id.toString());
        targetParentIds.push(parentProfile.userId.toString());
      }
    }
    const reportParentId = report.parentId?.toString();
    const isOwner = targetParentIds.includes(reportParentId);
    if (!isOwner && user?.role !== 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Access denied. You are not authorized to request review for this report.',
      );
    }

    // Idempotency: If already paid, do not recreate checkout session
    if (report.paymentStatus === 'PAID') {
      return {
        success: true,
        message: 'Review has already been requested and paid',
        reportId: report._id,
        status: report.coachReviewStatus,
        paymentStatus: report.paymentStatus,
      };
    }

    const coachReviewPrice = Number(payload.coachReviewPrice || report.coachReviewPrice || 25);
    if (payload.coachId && Types.ObjectId.isValid(payload.coachId)) {
      report.coachId = new Types.ObjectId(payload.coachId);
    }

    const player = await PlayerProfile.findById(report.childPlayerId);
    const parentUser = await UserModel.findById(parentId);

    const stripe = getStripeClient();
    const successUrl = env.STRIPE_SUCCESS_URL;
    const cancelUrl = env.STRIPE_CANCEL_URL;

    // Create Stripe Checkout Session paid DIRECTLY to K10 platform
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(coachReviewPrice * 100), // in cents
            product_data: {
              name: 'Professional Coach Game Report Evaluation',
              description: `Match analysis evaluation for ${player?.fullName || 'Athlete'} (${report.opponentTeam})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reportType: 'PARENT_MATCH_REPORT',
        reportId: report._id.toString(),
        childPlayerId: report.childPlayerId.toString(),
        coachId: (report.coachId || '').toString(),
      },
      payment_intent_data: {
        metadata: {
          reportType: 'PARENT_MATCH_REPORT',
          reportId: report._id.toString(),
          childPlayerId: report.childPlayerId.toString(),
        },
      },
      customer_email: parentUser?.email || undefined,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&reportId=${report._id}&type=PARENT_MATCH_REPORT`,
      cancel_url: cancelUrl,
    });

    report.coachReviewStatus = 'AWAITING_PAYMENT';
    report.coachReviewPrice = coachReviewPrice;
    report.transactionId = session.id;
    report.checkoutUrl = session.url;
    await report.save();

    logger.info(
      `Created review checkout session for ParentMatchReport ${report._id}: $${coachReviewPrice}`,
    );

    return {
      reportId: report._id,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: coachReviewPrice,
      status: 'AWAITING_PAYMENT',
    };
  }

  private formatCleanMatchReport(report: any) {
    if (!report) return null;
    const r = typeof report.toObject === 'function' ? report.toObject() : report;
    const p = r.childPlayerId || {};
    const hasPlayerObj = typeof p === 'object' && p._id;

    let parsedEvents: any[] = [];
    if (Array.isArray(r.plottedEvents)) {
      parsedEvents = r.plottedEvents;
    } else if (r.plottedEventsJson) {
      try {
        const parsed = JSON.parse(r.plottedEventsJson);
        if (Array.isArray(parsed)) {
          parsedEvents = parsed;
        }
      } catch {
        parsedEvents = [];
      }
    }

    const goals = parsedEvents.filter(
      (e: any) => String(e.type || e.eventType || '').toUpperCase() === 'GOAL',
    ).length;

    const assists = parsedEvents.filter(
      (e: any) => String(e.type || e.eventType || '').toUpperCase() === 'ASSIST',
    ).length;

    return {
      _id: r._id,
      parentId: r.parentId,
      childPlayerId: hasPlayerObj ? p._id : p,
      childPlayer: hasPlayerObj
        ? {
            _id: p._id,
            fullName: p.fullName || 'Athlete',
            position: p.position || 'Forward',
            profileImage: p.profileImage || '',
            overallRating: p.overallRating || 0,
            age: p.age || null,
            country: p.country || '',
          }
        : undefined,
      opponentTeam: r.opponentTeam,
      matchDate: r.matchDate,
      goals,
      assists,
      plottedCount: parsedEvents.length || r.plottedCount || 0,
      plottedEvents: parsedEvents,
      coachReviewStatus: r.coachReviewStatus,
      coachReviewPrice: r.coachReviewPrice,
      paymentStatus: r.paymentStatus,
      transactionId: r.transactionId,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async verifyMatchReportPayment(sessionId?: string, reportId?: string) {
    const stripe = getStripeClient();
    let targetReportId = reportId;

    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          targetReportId = session.metadata?.reportId || targetReportId;
          if (!targetReportId && session.id) {
            const found = await ParentMatchReport.findOne({ transactionId: session.id });
            if (found) targetReportId = found._id.toString();
          }
          if (targetReportId) {
            return this.finalizePaidParentMatchReport(targetReportId, session.id);
          }
        }
      } catch (err: any) {
        logger.warn(`Stripe session retrieval error for session ${sessionId}: ${err.message}`);
      }
    }

    if (targetReportId) {
      const report = await ParentMatchReport.findById(targetReportId).populate(
        'childPlayerId',
        'fullName position profileImage overallRating age country academyId currentClub',
      );
      if (report?.transactionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(report.transactionId);
          if (session.payment_status === 'paid') {
            return this.finalizePaidParentMatchReport(targetReportId, session.id);
          }
        } catch (err: any) {
          logger.warn(`Stripe session retrieval error for transactionId: ${err.message}`);
        }
      }
      if (report?.paymentStatus === 'PAID') {
        return {
          success: true,
          message: 'Payment verified successfully (idempotent)',
          report: this.formatCleanMatchReport(report),
        };
      }
    }

    return {
      success: false,
      message: 'Payment has not been completed or verified yet.',
    };
  }

  async finalizePaidParentMatchReport(reportId: string, transactionId?: string) {
    // 1. Distributed Redis Lock for Idempotency
    const lockKey = `LOCK:PARENT_REPORT_PAYMENT:${reportId}`;
    let lockAcquired = false;
    try {
      const lockRes = await redisClient.set(lockKey, 'LOCKED', 'EX', 15, 'NX');
      if (lockRes === 'OK') lockAcquired = true;
    } catch (redisErr: any) {
      logger.warn(
        `Redis lock attempt failed: ${redisErr.message}, proceeding with DB atomic lock.`,
      );
    }

    try {
      // 2. Early Idempotency Check
      const existing = await ParentMatchReport.findById(reportId).populate(
        'childPlayerId',
        'fullName position profileImage overallRating age country academyId currentClub',
      );
      if (!existing) {
        return { success: false, message: 'Parent match report not found' };
      }
      if (existing.paymentStatus === 'PAID') {
        logger.info(`ParentMatchReport ${reportId} already marked PAID. Idempotent return.`);
        return {
          success: true,
          message: 'Payment already processed (idempotent)',
          report: this.formatCleanMatchReport(existing),
        };
      }

      // 3. ACID Transaction: Atomically update report + record Academy commission
      const mongoSession = await mongoose.startSession();
      let updatedReport: any = null;
      let transactionSupported = true;

      try {
        mongoSession.startTransaction();

        // Atomic compare-and-swap state transition
        updatedReport = await ParentMatchReport.findOneAndUpdate(
          { _id: reportId, paymentStatus: { $ne: 'PAID' } },
          {
            $set: {
              paymentStatus: 'PAID',
              coachReviewStatus: 'PENDING',
              checkoutUrl: null,
              paidAt: new Date(),
              ...(transactionId ? { transactionId } : {}),
            },
          },
          { new: true, session: mongoSession },
        ).populate(
          'childPlayerId',
          'fullName position profileImage overallRating age country academyId currentClub',
        );

        if (updatedReport) {
          // K10 COMMISSION & ACADEMY SHARE:
          // K10 receives the $25 payment directly.
          // Academy is credited their 40% commission in AcademyFinanceTransaction.
          const player = (updatedReport.childPlayerId as any) || {};
          let academy = null;
          if (player.academyId) {
            academy = await AcademyProfile.findById(player.academyId).session(mongoSession);
          }
          if (!academy && (player.academy || player.currentClub)) {
            const acadName = player.academy || player.currentClub;
            academy = await AcademyProfile.findOne({
              name: { $regex: new RegExp(`^${acadName}$`, 'i') },
            }).session(mongoSession);
          }

          if (academy) {
            const cost = updatedReport.coachReviewPrice || 25.0;
            const commissionAcademy = parseFloat((cost * 0.4).toFixed(2)); // 40% to Academy
            const k10Commission = parseFloat((cost - commissionAcademy).toFixed(2)); // 60% to K10

            await AcademyFinanceTransaction.findOneAndUpdate(
              { reportId: updatedReport._id },
              {
                academyId: academy._id,
                playerId: player._id,
                coachId: updatedReport.coachId,
                reportId: updatedReport._id,
                transactionType: 'Parent Match Report',
                cost,
                commissionAcademy,
                transactionDate: new Date(),
                status: 'COMPLETED',
                notes: `Paid to K10 via Stripe (${transactionId || 'session'}). K10 Commission: $${k10Commission}, Academy Share: $${commissionAcademy}`,
              },
              { upsert: true, new: true, session: mongoSession },
            );

            logger.info(
              `ACID Transaction: Created AcademyFinanceTransaction for Academy "${academy.name}". Cost: $${cost}, Academy Commission: $${commissionAcademy}`,
            );
          }
        }

        await mongoSession.commitTransaction();
      } catch (txnError: any) {
        if (mongoSession.inTransaction()) {
          await mongoSession.abortTransaction();
        }
        if (
          txnError?.message?.includes('replica set') ||
          txnError?.message?.includes('standalone') ||
          txnError?.message?.includes('Transactions are not supported')
        ) {
          transactionSupported = false;
        } else {
          logger.error({ txnError }, 'Database transaction error in finalizePaidParentMatchReport');
          throw txnError;
        }
      } finally {
        await mongoSession.endSession();
      }

      // 4. Standalone Fallback for MongoDB instances without replica set
      if (!transactionSupported) {
        updatedReport = await ParentMatchReport.findOneAndUpdate(
          { _id: reportId, paymentStatus: { $ne: 'PAID' } },
          {
            $set: {
              paymentStatus: 'PAID',
              coachReviewStatus: 'PENDING',
              checkoutUrl: null,
              paidAt: new Date(),
              ...(transactionId ? { transactionId } : {}),
            },
          },
          { new: true },
        ).populate(
          'childPlayerId',
          'fullName position profileImage overallRating age country academyId currentClub',
        );

        if (updatedReport) {
          const player = (updatedReport.childPlayerId as any) || {};
          let academy = null;
          if (player.academyId) {
            academy = await AcademyProfile.findById(player.academyId);
          }
          if (!academy && (player.academy || player.currentClub)) {
            const acadName = player.academy || player.currentClub;
            academy = await AcademyProfile.findOne({
              name: { $regex: new RegExp(`^${acadName}$`, 'i') },
            });
          }

          if (academy) {
            const cost = updatedReport.coachReviewPrice || 25.0;
            const commissionAcademy = parseFloat((cost * 0.4).toFixed(2));
            const k10Commission = parseFloat((cost - commissionAcademy).toFixed(2));

            await AcademyFinanceTransaction.findOneAndUpdate(
              { reportId: updatedReport._id },
              {
                academyId: academy._id,
                playerId: player._id,
                coachId: updatedReport.coachId,
                reportId: updatedReport._id,
                transactionType: 'Parent Match Report',
                cost,
                commissionAcademy,
                transactionDate: new Date(),
                status: 'COMPLETED',
                notes: `Paid to K10 via Stripe (${transactionId || 'session'}). K10 Commission: $${k10Commission}, Academy Share: $${commissionAcademy}`,
              },
              { upsert: true, new: true },
            );
          }
        }
      }

      if (!updatedReport) {
        const recheck = await ParentMatchReport.findById(reportId).populate(
          'childPlayerId',
          'fullName position profileImage overallRating age country academyId currentClub',
        );
        return {
          success: true,
          message: 'Payment already processed concurrently',
          report: this.formatCleanMatchReport(recheck),
        };
      }

      const player = (updatedReport.childPlayerId as any) || {};
      const athleteName = player.fullName || 'Athlete';

      // 5. Invalidate player cache
      if (player._id) {
        await playerCacheService.invalidatePlayerCache(player._id, player.userId);
      }

      // 6. Notifications: Parent, Coach, Academy
      try {
        const parentProf = await ParentProfile.findById(updatedReport.parentId);
        if (parentProf?.userId) {
          await notificationService.createNotification({
            recipientId: parentProf.userId,
            recipientRole: 'PARENT',
            title: 'Match Evaluation Payment Successful ($25.00)',
            message: `Your payment of $${updatedReport.coachReviewPrice || 25.0} for match review (${updatedReport.opponentTeam}) was received by K10. Awaiting coach evaluation.`,
            type: 'PAYMENT_SUCCESS',
            data: { reportId: updatedReport._id },
          });
        }

        if (updatedReport.coachId) {
          await notificationService.createNotification({
            recipientId: updatedReport.coachId,
            recipientRole: 'COACH',
            title: 'New Match Evaluation Request',
            message: `A parent requested a match evaluation for ${athleteName} (${updatedReport.opponentTeam}).`,
            type: 'NEW_EVALUATION_REQUEST',
            data: { reportId: updatedReport._id },
          });
        }
      } catch (notifErr: any) {
        logger.warn(`Failed to dispatch in-app notifications: ${notifErr.message}`);
      }

      return {
        success: true,
        message: 'Payment verified successfully and coach evaluation requested',
        report: this.formatCleanMatchReport(updatedReport),
      };
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
}

export const parentMatchReportService = new ParentMatchReportService();
