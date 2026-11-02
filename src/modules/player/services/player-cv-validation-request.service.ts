import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { PlayerProfile } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { AcademyProfile, AcademyFinanceTransaction } from '@/modules/academy/academy.model';
import { UserModel } from '@/modules/user/user.model';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { NotificationService } from '@/modules/notification/notification.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { logger } from '@/utils/logger';

const notificationService = new NotificationService();

export class PlayerCvValidationRequestService {
  /**
   * Player / Parent Requests Official CV Validation ($24.00 Fee)
   */
  async requestCvValidation(userId: string, payload: any, currentUser?: any) {
    let playerProfile = null;

    const resolvedUserId = userId || currentUser?.userId || currentUser?._id;

    // 1. By default, automatically resolve PlayerProfile directly from the JWT token
    if (currentUser?.role !== 'PARENT') {
      if (resolvedUserId && Types.ObjectId.isValid(resolvedUserId)) {
        playerProfile = await PlayerProfile.findOne({
          $or: [
            { userId: new Types.ObjectId(resolvedUserId) },
            { _id: new Types.ObjectId(resolvedUserId) },
          ],
        });
      }
    }

    // 2. If Parent role or PlayerProfile not found via userId, fall back to optional payload.playerId
    if (!playerProfile && payload?.playerId && Types.ObjectId.isValid(payload.playerId)) {
      playerProfile = await PlayerProfile.findById(payload.playerId);
    }

    if (!playerProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player profile not found');
    }

    const resolvedPrice = Number(payload.price || payload.amount || 24.0);

    // Resolve assigned coach if provided
    let coachProf = null;
    if (payload.coachId && Types.ObjectId.isValid(payload.coachId)) {
      coachProf = await CoachProfile.findOne({
        $or: [
          { _id: new Types.ObjectId(payload.coachId) },
          { userId: new Types.ObjectId(payload.coachId) },
        ],
      });
    }

    const stripe = getStripeClient();
    const successUrl = env.STRIPE_SUCCESS_URL;
    const cancelUrl = env.STRIPE_CANCEL_URL;
    const userDoc = await UserModel.findById(userId);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(resolvedPrice * 100),
            product_data: {
              name: 'Official Player CV Validation & Verification',
              description: `Official K10 verification with digital seal and Silver/Gold tier unlock for ${playerProfile.fullName || 'Player'}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentType: 'CV_VALIDATION',
        playerId: playerProfile._id.toString(),
        userId: String(userId),
        coachId: coachProf?._id?.toString() || payload.coachId || '',
      },
      payment_intent_data: {
        metadata: {
          paymentType: 'CV_VALIDATION',
          playerId: playerProfile._id.toString(),
          userId: String(userId),
          coachId: coachProf?._id?.toString() || payload.coachId || '',
        },
      },
      customer_email: userDoc?.email || undefined,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&type=CV_VALIDATION&playerId=${playerProfile._id}`,
      cancel_url: cancelUrl,
    });

    playerProfile.coachVerification = {
      ...(playerProfile.coachVerification || {}),
      isVerified: playerProfile.coachVerification?.isVerified || false,
      validationPaymentStatus: 'UNPAID',
      validationFee: resolvedPrice,
      transactionId: session.id,
      coachName: coachProf?.fullName || playerProfile.coachVerification?.coachName,
    };

    if (coachProf?.userId) {
      playerProfile.verifyingCoachId = coachProf.userId;
    }

    await playerProfile.save({ validateModifiedOnly: true });

    return {
      playerId: playerProfile._id,
      amount: resolvedPrice,
      currency: 'USD',
      status: 'AWAITING_PAYMENT',
      checkoutUrl: session.url,
      sessionId: session.id,
      message:
        'Official CV validation payment initiated ($24.00). Complete payment to notify coach.',
    };
  }

  /**
   * Finalize Paid CV Validation: 50% split ($12.00 Academy, $12.00 Platform) & Notify
   */
  async finalizePaidCvValidation(playerId: string, transactionId?: string) {
    const playerProfile = await PlayerProfile.findById(playerId);
    if (!playerProfile) {
      return { success: false, message: 'Player profile not found' };
    }

    if (playerProfile.coachVerification?.validationPaymentStatus === 'PAID') {
      return {
        success: true,
        message: 'CV Validation already verified and paid.',
        player: playerProfile,
      };
    }

    playerProfile.coachVerification = {
      ...(playerProfile.coachVerification || {}),
      isVerified: playerProfile.coachVerification?.isVerified || false,
      validationPaymentStatus: 'PAID',
      validationFee: 24.0,
      transactionId: transactionId || playerProfile.coachVerification?.transactionId,
    };

    await playerProfile.save({ validateModifiedOnly: true });

    // 50% Academy Commission Split ($12.00 to Academy, $12.00 to Platform)
    let academy = null;
    if (playerProfile.academyId) {
      academy = await AcademyProfile.findById(playerProfile.academyId);
    }
    if (!academy && (playerProfile.academy || playerProfile.currentClub)) {
      const acadName = playerProfile.academy || playerProfile.currentClub;
      academy = await AcademyProfile.findOne({
        name: { $regex: new RegExp(`^${acadName}$`, 'i') },
      });
    }

    if (academy) {
      await AcademyFinanceTransaction.findOneAndUpdate(
        { playerId: playerProfile._id, transactionType: 'CV Validation' },
        {
          academyId: academy._id,
          playerId: playerProfile._id,
          coachId: playerProfile.verifyingCoachId,
          transactionType: 'CV Validation',
          cost: 24.0,
          commissionAcademy: 12.0, // 50%
          transactionDate: new Date(),
          status: 'COMPLETED',
          notes: `Official CV Validation Fee ($24.00). K10 Share: $12.00, Academy Share (50%): $12.00.`,
        },
        { upsert: true, new: true },
      );
    }

    // Invalidate Cache
    await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);

    // Notify Coach if assigned
    if (playerProfile.verifyingCoachId) {
      await notificationService.createNotification({
        recipientId: playerProfile.verifyingCoachId,
        recipientRole: 'COACH',
        title: 'New CV Validation Request Paid ($24.00)',
        message: `${playerProfile.fullName || 'Player'} has requested official CV validation ($24.00 paid). Please review and validate their skills.`,
        type: 'CV_VALIDATION_REQUEST',
        data: { playerId: playerProfile._id },
      });
    }

    // Notify Player
    if (playerProfile.userId) {
      await notificationService.createNotification({
        recipientId: playerProfile.userId,
        recipientRole: 'PLAYER',
        title: 'CV Validation Payment Successful ($24.00)',
        message:
          'Your CV validation fee of $24.00 has been received. Your assigned coach will now evaluate and certify your CV.',
        type: 'PAYMENT_SUCCESS',
        data: { playerId: playerProfile._id, amount: 24.0 },
      });
    }

    return {
      success: true,
      message:
        'CV Validation payment verified successfully ($24.00). 50% commission credited to academy.',
      player: playerProfile,
    };
  }

  /**
   * Verify CV validation payment via Stripe sessionId
   */
  async verifyCvValidationPayment(sessionId?: string, playerId?: string) {
    const stripe = getStripeClient();
    let targetPlayerId = playerId;

    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          targetPlayerId = session.metadata?.playerId || targetPlayerId;
          const transactionId = session.id || sessionId;
          if (targetPlayerId) {
            return this.finalizePaidCvValidation(targetPlayerId, transactionId);
          }
        }
      } catch (err: any) {
        logger.warn(`Failed to retrieve Stripe session for CV validation: ${err.message}`);
      }
    }

    if (targetPlayerId) {
      const player = await PlayerProfile.findById(targetPlayerId);
      if (player?.coachVerification?.transactionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(
            player.coachVerification.transactionId,
          );
          if (session.payment_status === 'paid') {
            return this.finalizePaidCvValidation(targetPlayerId, session.id);
          }
        } catch (err: any) {
          logger.warn(`Failed to retrieve Stripe session by transactionId: ${err.message}`);
        }
      }
    }

    return {
      success: false,
      message: 'CV Validation payment has not been completed or verified yet.',
    };
  }
}

export const playerCvValidationRequestService = new PlayerCvValidationRequestService();
