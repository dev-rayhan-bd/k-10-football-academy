import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { PlayerProfile } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { AcademyFinanceTransaction } from '@/modules/academy/academy.model';
import { UserModel } from '@/modules/user/user.model';
import { ParentProfile, ParentChild } from '@/modules/parent/parent.model';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { NotificationService } from '@/modules/notification/notification.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';

const notificationService = new NotificationService();

/** Official CV validation fee in USD. Server-side only — never taken from the client. */
export const CV_VALIDATION_FEE = 24;

export class PlayerCvValidationRequestService {
  /**
   * Player / Parent requests official CV validation from a chosen coach (fixed fee).
   */
  async requestCvValidation(userId: string, payload: any, currentUser?: any) {
    let playerProfile = null;

    const resolvedUserId = userId || currentUser?.userId || currentUser?._id;

    if (currentUser?.role === 'PARENT') {
      // Parent must pass the child's playerId and be linked to that child
      if (!payload?.playerId || !Types.ObjectId.isValid(payload.playerId)) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'A valid playerId is required for parents');
      }
      const parent = await ParentProfile.findOne({ userId: resolvedUserId }).select('_id');
      const link = parent
        ? await ParentChild.findOne({ parentId: parent._id, childPlayerId: payload.playerId })
        : null;
      if (!link) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'This player is not linked to your parent account',
        );
      }
      playerProfile = await PlayerProfile.findById(payload.playerId);
    } else if (resolvedUserId && Types.ObjectId.isValid(resolvedUserId)) {
      playerProfile = await PlayerProfile.findOne({ userId: new Types.ObjectId(resolvedUserId) });
    }

    if (!playerProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player profile not found');
    }

    // Coach is required: the request goes to one specific coach
    if (!payload?.coachId || !Types.ObjectId.isValid(payload.coachId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'A valid coachId is required');
    }
    const coachProf = await CoachProfile.findOne({
      $or: [
        { _id: new Types.ObjectId(payload.coachId) },
        { userId: new Types.ObjectId(payload.coachId) },
      ],
    });
    if (!coachProf) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Coach not found');
    }
    if (!coachProf.isVerifiedByAcademy || !coachProf.academyId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'This coach is not approved by an academy and cannot validate CVs. Please choose another coach.',
      );
    }

    // Do not overwrite a request that is already paid and waiting for the coach
    if (playerProfile.coachVerification?.validationPaymentStatus === 'PAID') {
      throw new AppError(
        StatusCodes.CONFLICT,
        'You already have a paid CV validation request waiting for the coach. Please wait until it is validated.',
      );
    }

    const price = CV_VALIDATION_FEE;
    const stripe = getStripeClient();
    const successUrl = env.STRIPE_SUCCESS_URL;
    const cancelUrl = env.STRIPE_CANCEL_URL;
    const userDoc = await UserModel.findById(resolvedUserId);

    const metadata = {
      paymentType: 'CV_VALIDATION',
      playerId: playerProfile._id.toString(),
      userId: String(resolvedUserId),
      coachId: coachProf._id.toString(),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(price * 100),
            product_data: {
              name: 'Official Player CV Validation & Verification',
              description: `Official K10 verification with digital seal and Silver/Gold tier unlock for ${playerProfile.fullName || 'Player'}`,
            },
          },
          quantity: 1,
        },
      ],
      // Only checkout session metadata — payment_intent events must NOT trigger fulfilment
      metadata,
      customer_email: userDoc?.email || undefined,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&type=CV_VALIDATION&playerId=${playerProfile._id}`,
      cancel_url: cancelUrl,
    });

    // Keep the existing verification (badge, verifiedAt, coachName of the coach who verified);
    // only record the new request against the requested coach.
    playerProfile.coachVerification = {
      ...((playerProfile.coachVerification as any)?.toObject?.() ||
        playerProfile.coachVerification ||
        {}),
      coachId: coachProf.userId,
      validationPaymentStatus: 'UNPAID',
      validationFee: price,
      transactionId: session.id,
      requestedAt: new Date(),
      paidAt: undefined,
    };

    await playerProfile.save({ validateModifiedOnly: true });

    return {
      playerId: playerProfile._id,
      coachId: coachProf._id,
      coachName: coachProf.fullName || '',
      amount: price,
      currency: 'USD',
      status: 'AWAITING_PAYMENT',
      checkoutUrl: session.url,
      sessionId: session.id,
      message: `CV validation payment initiated ($${price.toFixed(2)}). Complete payment to notify the coach.`,
    };
  }

  /**
   * Finalize a paid CV validation request. Idempotent: only the current request's
   * Stripe session can be finalized, and only once.
   */
  async finalizePaidCvValidation(playerId: string, sessionId: string, amountTotal?: number | null) {
    const lockKey = `LOCK:CV_PAYMENT:${playerId}`;
    let lockAcquired = false;
    try {
      const lockRes = await redisClient.set(lockKey, 'LOCKED', 'EX', 15, 'NX');
      if (lockRes === 'OK') lockAcquired = true;
    } catch {
      // Safe fallback if redis is reconnecting
    }

    try {
      if (!Types.ObjectId.isValid(playerId)) {
        return { success: false, message: 'Invalid player id' };
      }
      const playerProfile = await PlayerProfile.findById(playerId);
      if (!playerProfile) {
        return { success: false, message: 'Player profile not found' };
      }

      const cv = playerProfile.coachVerification || {};
      // Only the latest request's session can be fulfilled (old/replayed sessions are ignored)
      if (!cv.transactionId || cv.transactionId !== sessionId) {
        logger.warn(
          `CV validation finalize ignored: session ${sessionId} is not the current request for player ${playerId}`,
        );
        return { success: false, message: 'This payment does not match the current request.' };
      }
      if (cv.validationPaymentStatus === 'PAID' || cv.validationPaymentStatus === 'USED') {
        return { success: true, message: 'CV validation payment already processed.' };
      }
      if (amountTotal != null && amountTotal < Math.round(CV_VALIDATION_FEE * 100)) {
        logger.warn(`CV validation finalize rejected: amount ${amountTotal} below fee`);
        return { success: false, message: 'Paid amount does not match the CV validation fee.' };
      }

      playerProfile.coachVerification = {
        ...((cv as any)?.toObject?.() || cv),
        validationPaymentStatus: 'PAID',
        validationFee: CV_VALIDATION_FEE,
        transactionId: sessionId,
        paidAt: new Date(),
      };
      await playerProfile.save({ validateModifiedOnly: true });

      // Commission split 50% coach / 25% academy / 25% platform, recorded per payment
      const coach = cv.coachId ? await CoachProfile.findOne({ userId: cv.coachId }) : null;
      const academyId = coach?.academyId || playerProfile.academyId;
      if (academyId) {
        await AcademyFinanceTransaction.findOneAndUpdate(
          { paymentReference: sessionId },
          {
            academyId,
            playerId: playerProfile._id,
            coachId: coach?._id,
            paymentReference: sessionId,
            transactionType: 'CV Validation',
            cost: CV_VALIDATION_FEE,
            commissionAcademy: CV_VALIDATION_FEE * 0.25,
            commissionCoach: CV_VALIDATION_FEE * 0.5,
            commissionPlatform: CV_VALIDATION_FEE * 0.25,
            payoutStatusCoach: 'PENDING',
            transactionDate: new Date(),
            status: 'COMPLETED',
            notes: `Official CV Validation Fee ($${CV_VALIDATION_FEE.toFixed(2)}). Coach 50%, Academy 25%, K10 Platform 25%.`,
          },
          { upsert: true, new: true },
        );
      }

      await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);

      if (cv.coachId) {
        await notificationService.createNotification({
          recipientId: cv.coachId,
          recipientRole: 'COACH',
          title: `New CV Validation Request Paid ($${CV_VALIDATION_FEE.toFixed(2)})`,
          message: `${playerProfile.fullName || 'Player'} has requested official CV validation. Please review and validate their skills.`,
          type: 'CV_VALIDATION_REQUEST',
          data: { playerId: playerProfile._id },
        });
      }

      if (playerProfile.userId) {
        await notificationService.createNotification({
          recipientId: playerProfile.userId,
          recipientRole: 'PLAYER',
          title: `CV Validation Payment Successful ($${CV_VALIDATION_FEE.toFixed(2)})`,
          message:
            'Your CV validation fee has been received. Your selected coach will now evaluate and certify your CV.',
          type: 'PAYMENT_SUCCESS',
          data: { playerId: playerProfile._id, amount: CV_VALIDATION_FEE },
        });
      }

      return { success: true, message: 'CV validation payment verified successfully.' };
    } finally {
      if (lockAcquired) {
        try {
          await redisClient.del(lockKey);
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Verify CV validation payment via Stripe sessionId (success page fallback for the webhook)
   */
  async verifyCvValidationPayment(sessionId?: string, playerId?: string) {
    const stripe = getStripeClient();

    let targetSessionId = sessionId;
    if (!targetSessionId && playerId && Types.ObjectId.isValid(playerId)) {
      const player = await PlayerProfile.findById(playerId).select('coachVerification');
      targetSessionId = player?.coachVerification?.transactionId;
    }
    if (!targetSessionId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'session_id or playerId is required');
    }

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(targetSessionId);
    } catch (err: any) {
      logger.warn(`Failed to retrieve Stripe session for CV validation: ${err.message}`);
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid or unknown payment session');
    }

    if (session.metadata?.paymentType !== 'CV_VALIDATION' || !session.metadata?.playerId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'This session is not a CV validation payment');
    }
    if (session.payment_status !== 'paid') {
      return {
        success: false,
        message: 'CV Validation payment has not been completed yet.',
      };
    }

    return this.finalizePaidCvValidation(
      session.metadata.playerId,
      session.id,
      session.amount_total,
    );
  }
}

export const playerCvValidationRequestService = new PlayerCvValidationRequestService();
