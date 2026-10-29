/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { IUserDocument, UserRole, UserStatus } from '@/modules/user/user.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
} from '@/modules/player/player.model';
import { CoachProfile, TacticalFormation } from '@/modules/coach/coach.model';
import { AcademyProfile, Team, AcademyCoach } from '@/modules/academy/academy.model';
import { AgentProfile, VerificationDocument } from '@/modules/agent/agent.model';
import { ClubProfile, ClubFavourite } from '@/modules/club/club.model';
import { ParentProfile } from '@/modules/parent/parent.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { Notification } from '@/modules/notification/notification.model';
import { userProfileService } from '@/modules/user/services/user-profile.service';

export class AdminUserActionsService {
  /**
   * Resolves any ID (either User._id or a role-specific Profile._id)
   * into { user, profileId, detectedRole }
   */
  async resolveTargetById(id: string): Promise<{
    user: IUserDocument | null;
    profileId?: string;
    detectedRole?: UserRole;
  }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid ID format');
    }

    const directUser = await UserModel.findById(id);
    if (directUser) {
      return { user: directUser, detectedRole: directUser.role };
    }

    const [playerProf, coachProf, academyProf, agentProf, clubProf, parentProf] = await Promise.all(
      [
        PlayerProfile.findById(id).select('_id userId').lean(),
        CoachProfile.findById(id).select('_id userId').lean(),
        AcademyProfile.findById(id).select('_id userId').lean(),
        AgentProfile.findById(id).select('_id userId').lean(),
        ClubProfile.findById(id).select('_id userId').lean(),
        ParentProfile.findById(id).select('_id userId').lean(),
      ],
    );

    const matchedProfile: { _id: any; userId: any; role: UserRole } | null = playerProf
      ? { _id: playerProf._id, userId: playerProf.userId, role: 'PLAYER' }
      : coachProf
        ? { _id: coachProf._id, userId: coachProf.userId, role: 'COACH' }
        : academyProf
          ? { _id: academyProf._id, userId: academyProf.userId, role: 'ACADEMY' }
          : agentProf
            ? { _id: agentProf._id, userId: agentProf.userId, role: 'AGENT' }
            : clubProf
              ? { _id: clubProf._id, userId: clubProf.userId, role: 'CLUB' }
              : parentProf
                ? { _id: parentProf._id, userId: parentProf.userId, role: 'PARENT' }
                : null;

    if (!matchedProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Target user or profile not found');
    }

    const user = matchedProfile.userId ? await UserModel.findById(matchedProfile.userId) : null;
    return {
      user,
      profileId: matchedProfile._id.toString(),
      detectedRole: user?.role || matchedProfile.role,
    };
  }

  /**
   * ACTION 1: VIEW SINGLE USER / ENTITY FULL DETAILS (Eye icon in Actions column)
   */
  async getUserDetailsById(id: string) {
    const { user, profileId, detectedRole } = await this.resolveTargetById(id);

    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User account not found');
    }

    const enrichedUser = await userProfileService.getUserById(user._id.toString());
    const role = user.role || detectedRole;
    let roleProfile: any = null;

    if (role === 'PLAYER') {
      roleProfile = await PlayerProfile.findOne({ userId: user._id }).lean();
    } else if (role === 'COACH') {
      roleProfile = await CoachProfile.findOne({ userId: user._id }).lean();
    } else if (role === 'ACADEMY') {
      roleProfile = await AcademyProfile.findOne({ userId: user._id }).lean();
      if (roleProfile) {
        const [teamsCount, coachesCount, playersCount] = await Promise.all([
          Team.countDocuments({ academyId: roleProfile._id }),
          CoachProfile.countDocuments({ academyId: roleProfile._id }),
          PlayerProfile.countDocuments({ academyId: roleProfile._id }),
        ]);
        roleProfile = { ...roleProfile, teamsCount, coachesCount, playersCount };
      }
    } else if (role === 'AGENT') {
      const [prof, docs] = await Promise.all([
        AgentProfile.findOne({ userId: user._id }).lean(),
        VerificationDocument.find({ agentId: user._id }).lean(),
      ]);
      roleProfile = prof
        ? { ...prof, verificationDocuments: docs }
        : { verificationDocuments: docs };
    } else if (role === 'CLUB') {
      roleProfile = await ClubProfile.findOne({ userId: user._id }).lean();
    } else if (role === 'PARENT' || role === 'GUARDIAN') {
      roleProfile = await ParentProfile.findOne({ userId: user._id }).lean();
    }

    return {
      ...enrichedUser,
      profileId: roleProfile?._id || profileId || null,
      displayStatus: user.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      isBlocked: user.status === 'BLOCKED' || user.status === 'INACTIVE',
      profileDetails: roleProfile,
    };
  }

  /**
   * ACTION 2: BLOCK / UNBLOCK / TOGGLE USER STATUS (Lock icon in Actions column)
   */
  async updateUserStatus(
    id: string,
    payload: {
      status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
      action?: 'BLOCK' | 'UNBLOCK' | 'ACTIVATE' | 'DEACTIVATE';
      isBlocked?: boolean;
      reason?: string;
    } = {},
    requester?: { userId: string; role: UserRole },
  ) {
    const { user, profileId } = await this.resolveTargetById(id);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User account not found');
    }

    if (user.role === 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Access Denied: Super Admin account cannot be blocked or deactivated',
      );
    }

    if (requester && requester.userId === user._id.toString()) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'You cannot block or deactivate your own account',
      );
    }

    if (user.role === 'ADMIN' && requester && requester.role !== 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Access Denied: Only a Super Admin can modify another Admin account',
      );
    }

    const previousStatus = user.status;
    let nextStatus: UserStatus;

    if (payload.status && ['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(payload.status)) {
      nextStatus = payload.status;
    } else if (payload.action) {
      const act = payload.action.toUpperCase();
      if (act === 'BLOCK') nextStatus = 'BLOCKED';
      else if (act === 'DEACTIVATE') nextStatus = 'INACTIVE';
      else nextStatus = 'ACTIVE';
    } else if (typeof payload.isBlocked === 'boolean') {
      nextStatus = payload.isBlocked ? 'BLOCKED' : 'ACTIVE';
    } else {
      nextStatus = previousStatus === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    }

    user.status = nextStatus;
    await user.save();

    if (user.role === 'COACH') {
      await CoachProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: { status: nextStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE' } },
      );
    }

    const isBlocked = nextStatus === 'BLOCKED' || nextStatus === 'INACTIVE';

    await Notification.create({
      recipientId: user._id,
      recipientRole: user.role,
      title: isBlocked ? 'Account Restricted by Administrator' : 'Account Reactivated',
      message: isBlocked
        ? `Your account has been ${nextStatus.toLowerCase()} by the platform administrator.${payload.reason ? ` Reason: ${payload.reason}` : ''}`
        : 'Your account has been unblocked and reactivated by the platform administrator.',
      type: 'SYSTEM',
      data: {
        previousStatus,
        status: nextStatus,
        reason: payload.reason || '',
      },
    }).catch(() => null);

    return {
      userId: user._id,
      profileId: profileId || null,
      name: user.name,
      email: user.email,
      role: user.role,
      previousStatus,
      status: nextStatus,
      displayStatus: nextStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      isBlocked,
      updatedAt: user.updatedAt,
      message: isBlocked
        ? `User (${user.name}) has been ${nextStatus.toLowerCase()} successfully`
        : `User (${user.name}) has been unblocked and activated successfully`,
    };
  }

  /**
   * ACTION 3: DELETE USER & PROFILE (Trash icon in Actions column)
   */
  async deleteUserAndProfile(id: string, requester?: { userId: string; role: UserRole }) {
    const { user, profileId, detectedRole } = await this.resolveTargetById(id);

    if (user) {
      if (user.role === 'SUPER_ADMIN') {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Access Denied: Super Admin account cannot be deleted',
        );
      }

      if (requester && requester.userId === user._id.toString()) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot delete your own account');
      }

      if (user.role === 'ADMIN' && requester && requester.role !== 'SUPER_ADMIN') {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Access Denied: Only a Super Admin can delete an Admin account',
        );
      }
    }

    const targetUserId = user?._id;
    const role = user?.role || detectedRole;

    if (role === 'PLAYER' || profileId) {
      const playerProf = targetUserId
        ? await PlayerProfile.findOneAndDelete({ userId: targetUserId })
        : profileId
          ? await PlayerProfile.findByIdAndDelete(profileId)
          : null;
      if (playerProf) {
        await Promise.all([
          PlayerAttributes.deleteMany({ playerId: playerProf._id }),
          PlayerMentalAnalysis.deleteMany({ playerId: playerProf._id }),
          PlayerFullPotential.deleteMany({ playerId: playerProf._id }),
          FifaCardStats.deleteMany({ playerId: playerProf._id }),
        ]);
      }
    }

    if (role === 'COACH' || profileId) {
      const coachProf = targetUserId
        ? await CoachProfile.findOneAndDelete({ userId: targetUserId })
        : profileId
          ? await CoachProfile.findByIdAndDelete(profileId)
          : null;
      if (coachProf) {
        await Promise.all([
          TacticalFormation.deleteMany({ coachId: coachProf._id }),
          AcademyCoach.deleteMany({ coachId: coachProf._id }),
        ]);
      }
    }

    if (role === 'ACADEMY' || profileId) {
      const academyProf = targetUserId
        ? await AcademyProfile.findOneAndDelete({ userId: targetUserId })
        : profileId
          ? await AcademyProfile.findByIdAndDelete(profileId)
          : null;
      if (academyProf) {
        await Promise.all([
          Team.deleteMany({ academyId: academyProf._id }),
          AcademyCoach.deleteMany({ academyId: academyProf._id }),
        ]);
      }
    }

    if (role === 'AGENT' || profileId) {
      if (targetUserId) {
        await Promise.all([
          AgentProfile.findOneAndDelete({ userId: targetUserId }),
          VerificationDocument.deleteMany({ agentId: targetUserId }),
        ]);
      } else if (profileId) {
        await AgentProfile.findByIdAndDelete(profileId);
      }
    }

    if (role === 'CLUB' || profileId) {
      const clubProf = targetUserId
        ? await ClubProfile.findOneAndDelete({ userId: targetUserId })
        : profileId
          ? await ClubProfile.findByIdAndDelete(profileId)
          : null;
      if (clubProf) {
        await ClubFavourite.deleteMany({ clubId: clubProf._id });
      }
    }

    if (role === 'PARENT' || role === 'GUARDIAN' || profileId) {
      if (targetUserId) {
        await ParentProfile.findOneAndDelete({ userId: targetUserId });
      } else if (profileId) {
        await ParentProfile.findByIdAndDelete(profileId);
      }
    }

    if (targetUserId) {
      await UserSubscription.deleteMany({ userId: targetUserId });
      await UserModel.findByIdAndDelete(targetUserId);
    }

    return {
      deletedId: id,
      userId: targetUserId || null,
      profileId: profileId || null,
      role: role || null,
    };
  }
}

export const adminUserActionsService = new AdminUserActionsService();
