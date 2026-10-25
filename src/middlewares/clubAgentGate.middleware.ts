import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { catchAsync } from '@/utils/catchAsync';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { UserModel } from '@/modules/user/user.model';

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
