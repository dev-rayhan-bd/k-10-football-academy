import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { catchAsync } from '@/utils/catchAsync';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { UserModel } from '@/modules/user/user.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { ParentChild } from '@/modules/parent/parent.model';

/**
 * Gatekeeper Middleware for Professional Football Clubs and Football Agents
 * Enforces strict client requirements:
 * 1. Admin Verification & Approval must be completed (verificationStatus === 'APPROVED')
 * 2. Active Subscription Payment must be completed (UserSubscription status === 'ACTIVE')
 * If subscription expires, access is suspended until reactivated.
 */
export const requireClubOrAgentAccess = () => {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Authentication token missing or invalid');
    }

    // Super Admin and Admin bypass gatekeeping with full platform visibility
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      return next();
    }

    // Gatekeeping for Professional Football Clubs
    if (user.role === 'CLUB') {
      const [club, userDoc] = await Promise.all([
        ClubProfile.findOne({ userId: user.userId }),
        UserModel.findById(user.userId).select('verificationStatus isVerified').lean(),
      ]);

      if (!club) {
        throw new AppError(
          StatusCodes.NOT_FOUND,
          'Club profile not found. Please complete initial registration.',
        );
      }

      // Step 1: Admin verification and approval check
      const isClubApproved =
        club.verificationStatus === 'APPROVED' ||
        userDoc?.verificationStatus === 'APPROVED' ||
        Boolean(userDoc?.isVerified);

      if (!isClubApproved) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Access Restricted: Your club account is currently pending administrator verification and approval. K10 Administrator must review and approve your club credentials and authorization documents before dashboard and scouting access can be activated.',
        );
      }

      // Auto-sync ClubProfile if UserModel is approved
      if (club.verificationStatus !== 'APPROVED') {
        await ClubProfile.updateOne(
          { _id: club._id },
          { $set: { verificationStatus: 'APPROVED', verifiedAt: new Date() } },
        );
      }

      // Step 2: Active subscription payment check
      const subscription = await UserSubscription.findOne({
        userId: user.userId,
        status: 'ACTIVE',
      });

      if (!subscription) {
        throw new AppError(
          StatusCodes.PAYMENT_REQUIRED,
          'Payment Required: Your club credentials have been approved by the administrator, but an active subscription is required to activate access to the club dashboard and scouting tools. Please complete your subscription payment.',
        );
      }

      if (subscription.nextBillingDate && new Date(subscription.nextBillingDate) < new Date()) {
        throw new AppError(
          StatusCodes.PAYMENT_REQUIRED,
          'Subscription Expired: Your club subscription has expired. Please renew your subscription to reactivate access to the dashboard and scouting tools.',
        );
      }

      return next();
    }

    // Gatekeeping for Football Agents
    if (user.role === 'AGENT') {
      const [agent, userDoc] = await Promise.all([
        AgentProfile.findOne({ userId: user.userId }),
        UserModel.findById(user.userId).select('verificationStatus isVerified').lean(),
      ]);

      if (!agent) {
        throw new AppError(
          StatusCodes.NOT_FOUND,
          'Agent profile not found. Please complete initial registration.',
        );
      }

      // Step 1: Admin verification and approval check
      const isAgentApproved =
        agent.verificationStatus === 'APPROVED' ||
        userDoc?.verificationStatus === 'APPROVED' ||
        Boolean(userDoc?.isVerified);

      if (!isAgentApproved) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Access Restricted: Your agent account is currently pending administrator verification and approval. K10 Administrator must verify your FIFA Football Agent license and credentials before dashboard access is activated.',
        );
      }

      // Auto-sync AgentProfile if UserModel is approved
      if (agent.verificationStatus !== 'APPROVED') {
        await AgentProfile.updateOne(
          { _id: agent._id },
          { $set: { verificationStatus: 'APPROVED', verifiedAt: new Date() } },
        );
      }

      // Step 2: Active subscription payment check
      const subscription = await UserSubscription.findOne({
        userId: user.userId,
        status: 'ACTIVE',
      });

      if (!subscription) {
        throw new AppError(
          StatusCodes.PAYMENT_REQUIRED,
          'Payment Required: Your FIFA agent credentials have been approved by the administrator, but an active subscription is required to activate access to the agent dashboard and recruitment tools. Please complete your subscription payment.',
        );
      }

      if (subscription.nextBillingDate && new Date(subscription.nextBillingDate) < new Date()) {
        throw new AppError(
          StatusCodes.PAYMENT_REQUIRED,
          'Subscription Expired: Your agent subscription has expired. Please renew your subscription to reactivate access to the dashboard and recruitment tools.',
        );
      }

      return next();
    }

    return next();
  });
};

/**
 * Gatekeeper Middleware for Players / Athletes
 * Requires an active Athlete Membership Subscription to:
 * 1. Submit Self Game Reports
 * 2. Request Coach Game Reports
 * 3. Upload Media (videos, photos)
 * 4. Submit Match Records
 * If user is SUPER_ADMIN or ADMIN, access is automatically granted.
 * If user is PARENT, checks if the parent or the target player has an active subscription.
 */
export const requirePlayerSubscription = () => {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Authentication token missing or invalid');
    }

    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      return next();
    }

    const checkSubscriptionForUser = async (targetUserId: string | Types.ObjectId) => {
      const sub = await UserSubscription.findOne({
        userId: targetUserId,
        status: 'ACTIVE',
      });
      if (!sub) return { ok: false, reason: 'NOT_FOUND' };
      if (sub.nextBillingDate && new Date(sub.nextBillingDate) < new Date()) {
        return { ok: false, reason: 'EXPIRED' };
      }
      return { ok: true, sub };
    };

    if (user.role === 'PLAYER') {
      const check = await checkSubscriptionForUser(user.userId);
      if (!check.ok) {
        // Also check if account is managed by parent and parent has active subscription
        const userDoc = await UserModel.findById(user.userId).select('accountManagedBy');
        let parentHasSub = false;
        if (userDoc?.accountManagedBy === 'PARENT') {
          const parentLink = await ParentChild.findOne({ childUserId: user.userId });
          if (parentLink) {
            const parentCheck = await checkSubscriptionForUser(parentLink.parentId);
            if (parentCheck.ok) parentHasSub = true;
          }
        }

        if (!parentHasSub) {
          if (check.reason === 'EXPIRED') {
            throw new AppError(
              StatusCodes.PAYMENT_REQUIRED,
              'Subscription Expired: Your athlete membership subscription has expired. Please renew your subscription to access game reports and analysis tools.',
            );
          }
          throw new AppError(
            StatusCodes.PAYMENT_REQUIRED,
            'Payment Required: An active athlete membership subscription is required to submit game reports and access athlete performance tools. Please subscribe to an athlete membership plan.',
          );
        }
      }
      return next();
    }

    if (user.role === 'PARENT') {
      // Check if parent has active subscription
      const parentCheck = await checkSubscriptionForUser(user.userId);
      if (parentCheck.ok) {
        return next();
      }

      // Check if target child has active subscription
      const targetChildId =
        req.body?.playerId || req.body?.userId || req.params?.playerId || req.params?.userId;
      if (targetChildId && Types.ObjectId.isValid(targetChildId)) {
        let childUserId = targetChildId;
        const playerProf = await PlayerProfile.findById(targetChildId);
        if (playerProf?.userId) childUserId = playerProf.userId;

        const childCheck = await checkSubscriptionForUser(childUserId);
        if (childCheck.ok) {
          return next();
        }
      }

      throw new AppError(
        StatusCodes.PAYMENT_REQUIRED,
        'Payment Required: An active membership subscription is required to submit game reports. Please complete your subscription payment.',
      );
    }

    return next();
  });
};

/**
 * Gatekeeper Middleware for Coaches
 * Requires an active Coach Membership Subscription to:
 * 1. Validate Player CVs
 * 2. Evaluate and complete Game Reports
 * 3. Access Coach Game Reports Dashboard
 * 4. Submit Player Evaluations & Squad Management
 * If user is SUPER_ADMIN or ADMIN, access is automatically granted.
 */
export const requireCoachSubscription = () => {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Authentication token missing or invalid');
    }

    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      return next();
    }

    if (user.role === 'COACH') {
      const subscription = await UserSubscription.findOne({
        userId: user.userId,
        status: 'ACTIVE',
      });

      if (!subscription) {
        throw new AppError(
          StatusCodes.PAYMENT_REQUIRED,
          'Payment Required: An active coach membership subscription is required to evaluate match reports, validate player CVs, and access coach tools. Please complete your coach subscription payment.',
        );
      }

      if (subscription.nextBillingDate && new Date(subscription.nextBillingDate) < new Date()) {
        throw new AppError(
          StatusCodes.PAYMENT_REQUIRED,
          'Subscription Expired: Your coach membership subscription has expired. Please renew your subscription to reactivate access to coach evaluation tools.',
        );
      }

      return next();
    }

    return next();
  });
};

/**
 * Optional Gatekeeper for public browsing routes (e.g. /players, /players/:id/cv, /coaches/:id)
 * If the user is unauthenticated or has other roles (PLAYER, COACH, ADMIN), request proceeds normally.
 * If the user is logged in as an AGENT or CLUB, enforces that they must be APPROVED and have an ACTIVE subscription.
 */
export const gateClubOrAgentIfAuthenticated = () => {
  const gateMiddleware = requireClubOrAgentAccess();
  return catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user || (user.role !== 'CLUB' && user.role !== 'AGENT')) {
      return next();
    }
    return gateMiddleware(req, res, next);
  });
};
