import mongoose, { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { UserModel } from '@/modules/user/user.model';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
} from '@/modules/player/player.model';
import {
  Team,
  AcademyFinanceTransaction,
  AcademyProfile,
  PlayerEvaluation,
} from '@/modules/academy/academy.model';
import { TrainingSession, TrainingAttendance } from '@/modules/training/training.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { AcademyInvoice } from '@/modules/invoice/invoice.model';
import { getStripeClient } from '@/config/stripe';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';
import { notificationService } from '@/modules/notification/notification.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { IParentProfile } from './parent.interface';
import { ParentProfile, ParentChild, ParentMatchReport } from './parent.model';

export class ParentService {
  async switchProfile(parentId: string, childUserId: string) {
    const parent = await UserModel.findById(parentId);
    if (!parent) throw new AppError(404, 'Parent not found');

    const childUser = await UserModel.findById(childUserId);
    if (!childUser) throw new AppError(404, 'Child user account not found');

    const childPlayerProfile = await PlayerProfile.findOne({ userId: childUserId });
    if (!childPlayerProfile) throw new AppError(404, 'Child player profile not found');

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

    const linkExists = await ParentChild.findOne({
      parentId: { $in: targetParentIds },
      childPlayerId: childPlayerProfile._id,
    });
    if (!linkExists) {
      throw new AppError(
        403,
        'You are not authorized to switch to this profile. Link does not exist.',
      );
    }

    const accessToken = jwt.sign(
      {
        userId: childUser._id.toString(),
        email: childUser.email,
        role: childUser.role,
        parentUserId: parent._id.toString(),
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    const refreshToken = jwt.sign(
      {
        userId: childUser._id.toString(),
        email: childUser.email,
        role: childUser.role,
        parentUserId: parent._id.toString(),
      },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    if (childUser.accountManagedBy === 'PARENT' && childUser.verificationStatus !== 'APPROVED') {
      childUser.verificationStatus = 'APPROVED';
      childUser.isVerified = true;
      await childUser.save();
    }

    const userObj = childUser.toObject();
    delete (userObj as any).password;

    return {
      user: userObj,
      accessToken,
      refreshToken,
      switchedFromParentId: parent._id.toString(),
    };
  }

  async switchToParent(
    childUserId: string,
    targetParentUserId?: string,
    tokenParentUserId?: string,
  ) {
    const childUser = await UserModel.findById(childUserId);
    if (!childUser) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Child user account not found');
    }

    const childPlayerProfile = await PlayerProfile.findOne({ userId: childUserId });

    // Determine parent user ID (from token or optional parameter)
    const cleanParentId =
      targetParentUserId && targetParentUserId.trim() !== ''
        ? targetParentUserId.trim()
        : undefined;
    let resolvedParentUserId = cleanParentId || tokenParentUserId;

    if (!resolvedParentUserId) {
      // Find link from ParentChild using either PlayerProfile ID or child User ID
      const queryCandidates: any[] = [{ childPlayerId: childUserId }];
      if (childPlayerProfile?._id) {
        queryCandidates.push({ childPlayerId: childPlayerProfile._id });
      }

      const link = await ParentChild.findOne({
        $or: queryCandidates,
      });

      if (link && link.parentId) {
        const rawParentId = link.parentId.toString();
        const parentProf = await ParentProfile.findById(rawParentId);
        if (parentProf && parentProf.userId) {
          resolvedParentUserId = parentProf.userId.toString();
        } else {
          resolvedParentUserId = rawParentId;
        }
      }
    }

    if (!resolvedParentUserId) {
      throw new AppError(StatusCodes.FORBIDDEN, 'No linked parent account found for this player');
    }

    // Verify parent user exists and is active
    let parentUser = await UserModel.findById(resolvedParentUserId);
    if (!parentUser && Types.ObjectId.isValid(resolvedParentUserId)) {
      const pProfile = await ParentProfile.findById(resolvedParentUserId);
      if (pProfile) {
        parentUser = await UserModel.findById(pProfile.userId);
      }
    }

    if (!parentUser) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent user account not found');
    }

    if (parentUser.status === 'BLOCKED' || parentUser.status === 'INACTIVE') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        `Parent account is ${parentUser.status.toLowerCase()}`,
      );
    }

    // Security check: verify that ParentChild link actually exists between this parent and this child
    const targetParentIds: any[] = [parentUser._id];
    const parentProfile = await ParentProfile.findOne({
      $or: [{ _id: parentUser._id }, { userId: parentUser._id }],
    });
    if (parentProfile) {
      targetParentIds.push(parentProfile._id);
      targetParentIds.push(parentProfile.userId);
    }

    const targetChildIds: any[] = [childUserId];
    if (childPlayerProfile?._id) {
      targetChildIds.push(childPlayerProfile._id);
    }

    const linkExists = await ParentChild.findOne({
      parentId: { $in: targetParentIds },
      childPlayerId: { $in: targetChildIds },
    });

    if (!linkExists) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to switch to this parent profile. Link does not exist.',
      );
    }

    const accessToken = jwt.sign(
      { userId: parentUser._id.toString(), email: parentUser.email, role: parentUser.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    const refreshToken = jwt.sign(
      { userId: parentUser._id.toString(), email: parentUser.email, role: parentUser.role },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    const userObj = parentUser.toObject();
    delete (userObj as any).password;
    if (userObj.role !== 'PLAYER') {
      delete (userObj as any).accountManagedBy;
    }

    return {
      user: userObj,
      accessToken,
      refreshToken,
    };
  }
  async createProfile(payload: Partial<IParentProfile>) {
    const existing = await ParentProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Parent profile already exists');
    }
    return ParentProfile.create(payload);
  }

  async getProfileById(id: string) {
    const profile = await ParentProfile.findById(id).populate('userId', 'name email avatar phone');
    if (!profile) {
      throw new AppError(404, 'Parent profile not found');
    }
    return profile;
  }

  async linkChild(
    parentId: string,
    payload: {
      childPlayerId?: string;
      childUserId?: string;
      relationshipType: 'FATHER' | 'MOTHER' | 'GUARDIAN';
    },
  ) {
    const parent = await UserModel.findById(parentId);
    if (!parent) throw new AppError(StatusCodes.NOT_FOUND, 'Parent user not found');

    let resolvedPlayerProfile: any = null;

    // 1. If childPlayerId is provided, check if it is a PlayerProfile ID or User ID
    if (payload.childPlayerId && Types.ObjectId.isValid(payload.childPlayerId)) {
      resolvedPlayerProfile = await PlayerProfile.findById(payload.childPlayerId);
      if (!resolvedPlayerProfile) {
        resolvedPlayerProfile = await PlayerProfile.findOne({ userId: payload.childPlayerId });
      }
    }

    // 2. If childUserId is provided
    if (
      !resolvedPlayerProfile &&
      payload.childUserId &&
      Types.ObjectId.isValid(payload.childUserId)
    ) {
      resolvedPlayerProfile = await PlayerProfile.findOne({ userId: payload.childUserId });
    }

    // 3. If PlayerProfile still doesn't exist, check if child User exists and create a stub PlayerProfile
    const childUserIdToLookup = payload.childUserId || payload.childPlayerId;
    if (
      !resolvedPlayerProfile &&
      childUserIdToLookup &&
      Types.ObjectId.isValid(childUserIdToLookup)
    ) {
      const childUser = await UserModel.findById(childUserIdToLookup);
      if (childUser && (childUser.role === 'PLAYER' || (childUser.role as any) === 'ATHLETE')) {
        resolvedPlayerProfile = await PlayerProfile.create({
          userId: childUser._id,
          fullName: childUser.name,
          position: childUser.position || 'Forward',
          age: childUser.dateOfBirth
            ? Math.floor(
                (Date.now() - new Date(childUser.dateOfBirth).getTime()) /
                  (365.25 * 24 * 60 * 60 * 1000),
              )
            : 16,
          dateOfBirth: childUser.dateOfBirth || new Date('2008-01-01'),
          country: 'Bangladesh',
          currentClub: childUser.currentClub || 'K10 Academy',
          profileImage: childUser.avatar || '',
        });
      }
    }

    if (!resolvedPlayerProfile) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        'Child player account or profile not found with the provided ID',
      );
    }

    // Ensure parent has a ParentProfile or use parentId
    let parentProfile = await ParentProfile.findOne({
      $or: [{ _id: parentId }, { userId: parentId }],
    }).catch(() => null);

    if (!parentProfile && Types.ObjectId.isValid(parentId)) {
      parentProfile = await ParentProfile.create({
        userId: parent._id,
        contactPhone: parent.phone || '+8801700000000',
      }).catch(() => null);
    }

    const effectiveParentId = parentProfile ? parentProfile._id : parent._id;

    // Check if link already exists
    const existingLink = await ParentChild.findOne({
      parentId: effectiveParentId,
      childPlayerId: resolvedPlayerProfile._id,
    });

    if (existingLink) {
      return existingLink;
    }

    // Enforce 1-child limit per parent for now
    const existingLinksCount = await ParentChild.countDocuments({
      parentId: effectiveParentId,
    });
    if (existingLinksCount >= 1) {
      const msg = 'A parent can only link or create one child account at this time.';
      throw new AppError(StatusCodes.BAD_REQUEST, msg, true, '', [
        { path: 'childPlayerId', message: msg },
      ]);
    }

    const link = await ParentChild.create({
      parentId: effectiveParentId,
      childPlayerId: resolvedPlayerProfile._id,
      relationshipType: payload.relationshipType,
    });

    // Mark child account as managed by PARENT and verified
    await UserModel.findByIdAndUpdate(resolvedPlayerProfile.userId, {
      accountManagedBy: 'PARENT',
      isVerified: true,
      verificationStatus: 'APPROVED',
    });

    return link;
  }

  async createChild(parentId: string, payload: any) {
    const parent = await UserModel.findById(parentId);
    if (!parent) throw new AppError(StatusCodes.NOT_FOUND, 'Parent user not found');

    if (!payload.name || !String(payload.name).trim()) {
      const msg = 'Child name is required';
      throw new AppError(StatusCodes.BAD_REQUEST, msg, true, '', [{ path: 'name', message: msg }]);
    }

    if (!payload.dateOfBirth) {
      const msg = 'Child dateOfBirth is required';
      throw new AppError(StatusCodes.BAD_REQUEST, msg, true, '', [
        { path: 'dateOfBirth', message: msg },
      ]);
    }

    const birthDate = new Date(payload.dateOfBirth);
    if (isNaN(birthDate.getTime())) {
      const msg = 'Valid dateOfBirth is required';
      throw new AppError(StatusCodes.BAD_REQUEST, msg, true, '', [
        { path: 'dateOfBirth', message: msg },
      ]);
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    let parentProfile = await ParentProfile.findOne({
      $or: [{ _id: parentId }, { userId: parentId }],
    }).catch(() => null);

    if (!parentProfile && Types.ObjectId.isValid(parentId)) {
      parentProfile = await ParentProfile.create({
        userId: parent._id,
        contactPhone: parent.phone || '+8801700000000',
      }).catch(() => null);
    }

    const effectiveParentId = parentProfile ? parentProfile._id : parent._id;

    // Enforce 1-child limit per parent for now
    const existingCount = await ParentChild.countDocuments({
      parentId: effectiveParentId,
    });
    if (existingCount >= 1) {
      const msg = 'A parent can only link or create one child account at this time.';
      throw new AppError(StatusCodes.BAD_REQUEST, msg, true, '', [
        { path: 'childPlayerId', message: msg },
      ]);
    }

    let childEmail = payload.email ? String(payload.email).toLowerCase().trim() : '';
    if (!childEmail) {
      const cleanName = String(payload.name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      childEmail = `child.${cleanName || 'player'}.${Date.now().toString().slice(-6)}@k10child.internal`;
    }

    const existingEmailUser = await UserModel.findOne({ email: childEmail });
    if (existingEmailUser) {
      const msg = 'Email address is already in use by another account';
      throw new AppError(StatusCodes.CONFLICT, msg, true, '', [{ path: 'email', message: msg }]);
    }

    const childUser = await UserModel.create({
      name: payload.name,
      email: childEmail,
      password: payload.password || 'Child@123456',
      role: 'PLAYER',
      accountManagedBy: 'PARENT',
      isEmailVerified: true,
      isVerified: true,
      verificationStatus: 'APPROVED',
      status: 'ACTIVE',
      phone: payload.phone || parent.phone,
      avatar: payload.avatar || '',
      dateOfBirth: birthDate,
      position: payload.position || 'Forward',
      height:
        payload.height !== undefined && payload.height !== '' ? Number(payload.height) : undefined,
      weight:
        payload.weight !== undefined && payload.weight !== '' ? Number(payload.weight) : undefined,
      currentClub: payload.currentClub || '',
    });

    const playerProf = await PlayerProfile.create({
      userId: childUser._id,
      fullName: childUser.name,
      position: childUser.position || 'Forward',
      dateOfBirth: birthDate,
      age: Math.max(0, age),
      country: payload.country || parent.country || 'Bangladesh',
      height: childUser.height,
      weight: childUser.weight,
      currentClub: childUser.currentClub || '',
      profileImage: childUser.avatar || '',
      profileCompletion: 40,
    });

    await PlayerAttributes.findOneAndUpdate(
      { playerId: playerProf._id },
      { playerId: playerProf._id },
      { upsert: true, new: true },
    );
    await PlayerMentalAnalysis.findOneAndUpdate(
      { playerId: playerProf._id },
      { playerId: playerProf._id },
      { upsert: true, new: true },
    );
    await PlayerFullPotential.findOneAndUpdate(
      { playerId: playerProf._id },
      { playerId: playerProf._id },
      { upsert: true, new: true },
    );
    await FifaCardStats.findOneAndUpdate(
      { playerId: playerProf._id },
      { playerId: playerProf._id, overallRating: 50, position: playerProf.position },
      { upsert: true, new: true },
    );

    childUser.playerId = playerProf._id.toString();
    await childUser.save();

    const link = await ParentChild.create({
      parentId: effectiveParentId,
      childPlayerId: playerProf._id,
      relationshipType: payload.relationshipType || 'FATHER',
    });

    return {
      childUser: {
        id: childUser._id,
        name: childUser.name,
        email: childUser.email,
        role: childUser.role,
        accountManagedBy: childUser.accountManagedBy,
        avatar: childUser.avatar,
      },
      playerProfile: {
        id: playerProf._id,
        fullName: playerProf.fullName,
        position: playerProf.position,
        age: playerProf.age,
        dateOfBirth: playerProf.dateOfBirth,
        currentClub: playerProf.currentClub,
        profileImage: playerProf.profileImage,
      },
      link: {
        id: link._id,
        relationshipType: link.relationshipType,
      },
    };
  }

  async getChildren(parentId: string) {
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

    const links = await ParentChild.find({
      parentId: { $in: targetParentIds },
    }).populate({
      path: 'childPlayerId',
      populate: {
        path: 'userId',
        select: 'name email avatar accountManagedBy isVerified verificationStatus',
      },
    });

    const childPlayerIds = links.map((l: any) => l.childPlayerId?._id).filter(Boolean);
    const childTeamIds = links.map((l: any) => l.childPlayerId?.teamId).filter(Boolean);

    const teams = await Team.find({
      $or: [{ _id: { $in: childTeamIds } }, { playerIds: { $in: childPlayerIds } }],
    })
      .populate('coachIds', 'fullName title profileImage')
      .populate('academyId', 'name');

    const teamByPlayerId = new Map<string, any>();
    teams.forEach((t) => {
      (t.playerIds || []).forEach((pid: any) => {
        teamByPlayerId.set(pid.toString(), t);
      });
      teamByPlayerId.set(t._id.toString(), t);
    });

    return links.map((link: any) => {
      const child = link.childPlayerId;
      const childUser = child?.userId;
      const childUserId = childUser?._id
        ? childUser._id.toString()
        : child?.userId
          ? child.userId.toString()
          : '';
      const childPlayerId = child?._id ? child._id.toString() : link.childPlayerId.toString();

      // 1. Resolve current club: player's present club from clubHistory ALWAYS has priority
      let currentClub = '';
      if (Array.isArray(child?.clubHistory) && child.clubHistory.length > 0) {
        const presentClubItem = child.clubHistory.find(
          (c: any) =>
            c.isCurrent === true ||
            String(c.isCurrent).toLowerCase() === 'true' ||
            String(c.to || '')
              .trim()
              .toLowerCase() === 'present',
        );
        if (presentClubItem && presentClubItem.clubName) {
          currentClub = presentClubItem.clubName;
        }
      }
      if (!currentClub) {
        currentClub = child?.currentClub || childUser?.currentClub || child?.academy || '';
      }

      // 2. Resolve team & assigned coaches
      const team =
        teamByPlayerId.get(childPlayerId) ||
        (child?.teamId ? teamByPlayerId.get(child.teamId.toString()) : null);

      let coachesAssigned = '';
      let assignedCoach: any = null;
      const assignedCoaches: any[] = [];

      if (team && Array.isArray(team.coachIds) && team.coachIds.length > 0) {
        team.coachIds.forEach((c: any) => {
          if (c) {
            assignedCoaches.push({
              id: c._id ? c._id.toString() : '',
              name: c.fullName || c.title || 'Coach',
              title: c.title || 'Head Coach',
              profileImage: c.profileImage || '',
            });
          }
        });
        coachesAssigned = team.coachIds
          .map((c: any) => c.fullName || c.title)
          .filter(Boolean)
          .join(', ');
        if (assignedCoaches.length > 0) {
          assignedCoach = assignedCoaches[0];
        }
      }
      if (!coachesAssigned) {
        coachesAssigned =
          child?.coachesAssigned || child?.coachVerification?.coachName || child?.coachName || '';
        if (coachesAssigned) {
          assignedCoach = {
            id: '',
            name: coachesAssigned,
            title: 'Coach',
            profileImage: '',
          };
          assignedCoaches.push(assignedCoach);
        }
      }

      // 3. Resolve academy
      const academyName = child?.academy || (team?.academyId as any)?.name || '';

      const isCvVerified = Boolean(
        child?.isVerifiedByCoach || child?.coachVerification?.isVerified,
      );
      const isAccountVerified = Boolean(
        childUser?.isVerified === true ||
        childUser?.verificationStatus === 'APPROVED' ||
        childUser?.accountManagedBy === 'PARENT',
      );

      const item: any = {
        linkId: link._id,
        relationshipType: link.relationshipType,
        childPlayerId,
        childUserId,
        fullName: child?.fullName || childUser?.name || 'Child Athlete',
        position: child?.position || 'Forward',
        profileImage: child?.profileImage || childUser?.avatar || '',
        cvTier: child?.cvTier || 'BRONZE',
        isCvVerified,
        isVerifiedByCoach: isCvVerified,
        isVerified: isAccountVerified,
        overallRating: child?.overallRating ?? 50,
        age: child?.age || null,
        dateOfBirth: child?.dateOfBirth || null,
        height: child?.height ?? childUser?.height ?? null,
        weight: child?.weight ?? childUser?.weight ?? null,
        preferredFoot: child?.preferredFoot || 'RIGHT',
        currentClub,
        accountManagedBy: childUser?.accountManagedBy || 'PARENT',
      };

      if (academyName) {
        item.academy = academyName;
        item.academyLocation = academyName;
      }

      if (coachesAssigned) {
        item.coachesAssigned = coachesAssigned;
        item.coachName = coachesAssigned;
        item.assignedCoach = assignedCoach;
        item.assignedCoaches = assignedCoaches;
      }

      return item;
    });
  }

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

  /**
   * Request Coach Review for a Parent Match Report (Direct K10 Stripe Checkout)
   */
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

  /**
   * Verify Payment Session with Stripe API for Parent Match Report
   */
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

  /**
   * ACID Transaction & Idempotency: Finalize Paid Parent Match Report
   * Splits payment: K10 receives payment, K10 credits Academy's commission
   */
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

  /**
   * Get training sessions for parent's linked child/children
   * Includes session info and current RSVP status (CONFIRMED / DECLINED / PENDING)
   */
  async getChildTrainingSessions(
    userId: string,
    query: {
      childPlayerId?: string;
      date?: string;
      upcomingOnly?: string;
      pastOnly?: string;
      type?: string;
      page?: string | number;
      limit?: string | number;
    } = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Number(query.limit) > 0 ? Number(query.limit) : query.page ? 10 : 20;
    const emptyMeta = {
      page,
      limit,
      total: 0,
      totalPage: 1,
    };

    const targetParentIds: any[] = [userId];
    if (Types.ObjectId.isValid(userId)) {
      const parentProfile = await ParentProfile.findOne({
        $or: [{ _id: userId }, { userId }],
      });
      if (parentProfile) {
        targetParentIds.push(parentProfile._id);
        targetParentIds.push(parentProfile.userId);
      }
    }

    const linkFilter: any = { parentId: { $in: targetParentIds } };
    if (query.childPlayerId && Types.ObjectId.isValid(query.childPlayerId)) {
      linkFilter.childPlayerId = query.childPlayerId;
    }

    const links = await ParentChild.find(linkFilter)
      .populate('childPlayerId', 'fullName position profileImage jerseyNumber')
      .lean();

    if (links.length === 0) {
      return {
        data: {
          stats: {
            attendanceRate: 0,
            attendanceRateFormatted: '0%',
            totalSessions: 0,
            present: 0,
            absent: 0,
          },
          upcomingSessions: [],
          pastSessions: [],
          total: 0,
          sessions: [],
        },
        meta: emptyMeta,
      };
    }

    const childPlayerIds = links.map((l: any) => l.childPlayerId?._id || l.childPlayerId);
    const childMap = new Map<string, any>();
    links.forEach((l: any) => {
      const p = l.childPlayerId;
      if (p?._id) childMap.set(p._id.toString(), p);
    });

    // Find teams containing these children
    const teams = await Team.find({
      playerIds: { $in: childPlayerIds },
    })
      .select('_id teamName ageGroup playerIds')
      .lean();

    const teamIds = teams.map((t) => t._id);

    // Find training sessions for these teams
    const sessionFilter: any = { teamId: { $in: teamIds } };

    if (query.date) {
      const startOfDay = new Date(query.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(query.date);
      endOfDay.setHours(23, 59, 59, 999);
      sessionFilter.sessionDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (query.upcomingOnly === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      sessionFilter.sessionDate = { $gte: today };
    } else if (query.pastOnly === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      sessionFilter.sessionDate = { $lt: today };
    }

    const sessions = await TrainingSession.find(sessionFilter)
      .populate('teamId', 'teamName ageGroup playerIds')
      .populate('coachId', 'fullName title profileImage')
      .sort({ sessionDate: 1, startTime: 1 })
      .lean();

    if (sessions.length === 0) {
      return {
        data: {
          stats: {
            attendanceRate: 0,
            attendanceRateFormatted: '0%',
            totalSessions: 0,
            present: 0,
            absent: 0,
          },
          upcomingSessions: [],
          pastSessions: [],
          total: 0,
          sessions: [],
        },
        meta: emptyMeta,
      };
    }

    const sessionIds = sessions.map((s) => s._id);

    // Fetch existing attendance records for these children across these sessions
    const attendances = await TrainingAttendance.find({
      sessionId: { $in: sessionIds },
      playerId: { $in: childPlayerIds },
    }).lean();

    const attMap = new Map<string, any>();
    attendances.forEach((a) => {
      const key = `${a.sessionId.toString()}_${a.playerId.toString()}`;
      attMap.set(key, a);
    });

    const results: any[] = [];
    const upcomingSessions: any[] = [];
    const pastSessions: any[] = [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let presentCount = 0;
    let absentCount = 0;

    sessions.forEach((s: any) => {
      const team = (s.teamId && typeof s.teamId === 'object' ? s.teamId : {}) as any;
      const coach = (s.coachId && typeof s.coachId === 'object' ? s.coachId : {}) as any;
      const teamPlayerIdStrs = (team.playerIds || []).map((id: any) => id.toString());
      const sDate = new Date(s.sessionDate);
      const isPast = sDate < todayStart;
      const sessionCode = s.sessionCode || undefined;

      // For each child in this team
      childPlayerIds.forEach((cId: any) => {
        const cIdStr = cId.toString();
        if (teamPlayerIdStrs.includes(cIdStr)) {
          const childObj = childMap.get(cIdStr) || {};
          const att = attMap.get(`${s._id.toString()}_${cIdStr}`);

          const rsvpStatus = (att?.rsvpStatus || 'PENDING').toUpperCase();
          const coachStatus = (att?.status || att?.attendanceStatus || 'UNMARKED').toUpperCase();
          const isAttended = coachStatus === 'PRESENT' || coachStatus === 'LATE';

          if (isPast) {
            if (isAttended) presentCount++;
            else if (coachStatus === 'ABSENT') absentCount++;
          }

          const baseSession = {
            sessionId: s._id,
            ...(sessionCode ? { sessionCode } : {}),
            sessionName: s.sessionName || s.sessionTitle || 'Training Session',
            sessionTitle: s.sessionName || s.sessionTitle || 'Training Session',
            sessionDate: s.sessionDate,
            startTime: s.startTime,
            endTime: s.endTime,
            timeRange: `${s.startTime} - ${s.endTime}`,
            trainingLocation: s.trainingLocation || s.locationField || 'Academy Field A',
            location: s.trainingLocation || s.locationField || 'Academy Field A',
            sessionType: s.sessionType,
            focusArea: s.focusArea,
            team: {
              _id: team._id,
              teamName: team.teamName || '',
              ageGroup: team.ageGroup || '',
            },
            coach: {
              _id: coach._id,
              name: coach.fullName || 'Head Coach',
              avatar: coach.profileImage || '',
            },
            coachName: coach.fullName || 'Head Coach',
            child: {
              playerId: cId,
              fullName: childObj.fullName || 'Athlete',
              position: childObj.position || '',
              avatar: childObj.profileImage || '',
              jerseyNumber: childObj.jerseyNumber ? `#${childObj.jerseyNumber}` : '',
            },
            rsvpStatus,
            rsvp: {
              status: rsvpStatus,
              isConfirmed: rsvpStatus === 'CONFIRMED',
              notes: att?.notes || '',
              confirmedAt: att?.updatedAt || null,
            },
            attendanceStatus: coachStatus,
            actualAttendance: {
              status: coachStatus,
              isAttended,
              markedAt: att?.signInTime || null,
            },
          };

          results.push(baseSession);

          if (isPast) {
            pastSessions.push(baseSession);
          } else {
            upcomingSessions.push(baseSession);
          }
        }
      });
    });

    const totalPastMarked = presentCount + absentCount;
    const attendanceRate =
      totalPastMarked > 0
        ? Math.round((presentCount / totalPastMarked) * 100)
        : pastSessions.length > 0
          ? Math.round((presentCount / pastSessions.length) * 100)
          : results.length > 0
            ? 100
            : 0;

    const total =
      query.upcomingOnly === 'true'
        ? upcomingSessions.length
        : query.pastOnly === 'true'
          ? pastSessions.length
          : results.length;

    const totalPage = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;

    const paginatedUpcoming =
      query.upcomingOnly === 'true' || query.page || query.limit
        ? upcomingSessions.slice(startIndex, startIndex + limit)
        : upcomingSessions;

    const paginatedPast =
      query.pastOnly === 'true' || query.page || query.limit
        ? pastSessions.slice(startIndex, startIndex + limit)
        : pastSessions;

    const paginatedSessions = results.slice(startIndex, startIndex + limit);

    const meta = {
      page,
      limit,
      total,
      totalPage,
    };

    return {
      data: {
        stats: {
          attendanceRate,
          attendanceRateFormatted: `${attendanceRate}%`,
          totalSessions: pastSessions.length || results.length,
          present: presentCount,
          absent: absentCount,
        },
        upcomingSessions: query.pastOnly === 'true' ? [] : paginatedUpcoming,
        pastSessions: query.upcomingOnly === 'true' ? [] : paginatedPast,
        total,
        sessions: paginatedSessions,
      },
      meta,
    };
  }

  /**
   * Submit Parent Attendance RSVP (Will Attend: CONFIRMED / Cannot Attend: DECLINED)
   */
  async submitParentRsvp(
    userId: string,
    sessionId: string,
    payload: {
      childPlayerId?: string;
      rsvpStatus: string;
      notes?: string;
    },
  ) {
    const targetParentIds: any[] = [userId];
    if (Types.ObjectId.isValid(userId)) {
      const parentProfile = await ParentProfile.findOne({
        $or: [{ _id: userId }, { userId }],
      });
      if (parentProfile) {
        targetParentIds.push(parentProfile._id);
        targetParentIds.push(parentProfile.userId);
      }
    }

    let targetChildPlayerId = payload.childPlayerId;
    if (!targetChildPlayerId) {
      const link = await ParentChild.findOne({ parentId: { $in: targetParentIds } });
      if (link) {
        targetChildPlayerId = link.childPlayerId.toString();
      }
    }
    if (!targetChildPlayerId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Child player ID is required');
    }

    // Authorization check: Verify parent is linked to this child
    const linkExists = await ParentChild.findOne({
      parentId: { $in: targetParentIds },
      childPlayerId: targetChildPlayerId,
    });
    if (!linkExists) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to manage this child athlete',
      );
    }

    const session = await TrainingSession.findById(sessionId);
    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Training session not found');
    }

    const norm = String(payload.rsvpStatus || 'CONFIRMED').toUpperCase();
    const rsvpStatus = ['CONFIRMED', 'YES', 'CONFIRM'].includes(norm)
      ? 'CONFIRMED'
      : ['DECLINED', 'NO', 'DECLINE'].includes(norm)
        ? 'DECLINED'
        : 'PENDING';

    const attendance = await TrainingAttendance.findOneAndUpdate(
      {
        sessionId: session._id,
        $or: [{ playerId: targetChildPlayerId }, { childPlayerId: targetChildPlayerId }],
      },
      {
        $set: {
          sessionId: session._id,
          playerId: targetChildPlayerId,
          childPlayerId: targetChildPlayerId,
          rsvpStatus,
          notes: payload.notes || '',
        },
      },
      { upsert: true, new: true },
    );

    return {
      message:
        rsvpStatus === 'CONFIRMED'
          ? 'Attendance confirmed: child will attend this session'
          : rsvpStatus === 'DECLINED'
            ? 'Attendance declined: child will not attend this session'
            : 'Attendance status updated',
      sessionId: session._id,
      sessionName: session.sessionName || session.sessionTitle,
      sessionDate: session.sessionDate,
      childPlayerId: targetChildPlayerId,
      rsvpStatus: attendance.rsvpStatus,
      notes: attendance.notes || '',
    };
  }

  async getAllParents(query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));

    const filter: any = {
      role: { $in: ['PARENT', 'GUARDIAN'] },
      status: { $ne: 'BLOCKED' },
    };

    if (query.email) {
      filter.email = new RegExp(String(query.email).trim(), 'i');
    } else if (query.search) {
      const sRegex = new RegExp(String(query.search).trim(), 'i');
      filter.$or = [{ name: sRegex }, { email: sRegex }, { phone: sRegex }];
    }

    const total = await UserModel.countDocuments(filter);
    const parentUsers = await UserModel.find(filter)
      .select('_id name email phone avatar createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const parentUserIds = parentUsers.map((u) => u._id);
    const parentProfiles = await ParentProfile.find({
      userId: { $in: parentUserIds },
    }).lean();

    const profileByUserId = new Map<string, any>();
    parentProfiles.forEach((p) => {
      profileByUserId.set(p.userId.toString(), p);
    });

    const parentProfileIds = parentProfiles.map((p) => p._id);
    const linkedLinks = await ParentChild.find({
      parentId: { $in: [...parentProfileIds, ...parentUserIds] },
    }).lean();

    const linkedParentSet = new Set(linkedLinks.map((l) => l.parentId.toString()));

    const data = parentUsers.map((p: any) => {
      const prof = profileByUserId.get(p._id.toString());
      const pProfId = prof ? prof._id.toString() : p._id.toString();
      const isAlreadyLinked = linkedParentSet.has(pProfId) || linkedParentSet.has(p._id.toString());

      return {
        id: p._id,
        name: p.name,
        email: p.email,
        phone: p.phone || '',
        avatar: p.avatar || '',
        isAvailableToLink: !isAlreadyLinked,
      };
    });

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data,
    };
  }

  /**
   * Guardian / Parent Overview Aggregated Dashboard (Screenshot 1)
   * Aggregates via $lookup:
   * 1. Top Stats: Children count, Next training session, Pending fees, Active reports
   * 2. Youth Profile: Active child's profile details, tier badge, rating, coach, academy
   * 3. Training RSVP: Next upcoming training session with RSVP status
   * 4. Recent Activity: Aggregated timeline of evaluations, invoices, match reports
   * (Without Quick Access)
   */
  async getParentOverview(userId: string, query: { childPlayerId?: string } = {}) {
    const formatTimeAgo = (date: Date | string | number): string => {
      const diffMs = Math.max(0, Date.now() - new Date(date).getTime());
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 30) return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;
      const diffMonth = Math.floor(diffDay / 30);
      return `${diffMonth} ${diffMonth === 1 ? 'month' : 'months'} ago`;
    };

    // 1. Resolve parent's identifiers
    const targetParentIds: any[] = [];
    if (Types.ObjectId.isValid(userId)) {
      targetParentIds.push(new Types.ObjectId(userId));
    }
    const parentProfile = await ParentProfile.findOne({
      $or: [{ _id: userId }, { userId }],
    }).lean();

    if (parentProfile) {
      if (parentProfile._id) targetParentIds.push(new Types.ObjectId(parentProfile._id));
      if (parentProfile.userId) targetParentIds.push(new Types.ObjectId(parentProfile.userId));
    }

    // 2. Fetch linked children via ParentChild aggregation with $lookup
    const parentChildren = await ParentChild.aggregate([
      {
        $match: {
          parentId: { $in: targetParentIds },
        },
      },
      {
        $lookup: {
          from: 'playerprofiles',
          localField: 'childPlayerId',
          foreignField: '_id',
          as: 'player',
        },
      },
      { $unwind: '$player' },
      {
        $lookup: {
          from: 'academyprofiles',
          localField: 'player.academyId',
          foreignField: '_id',
          as: 'academy',
        },
      },
      {
        $lookup: {
          from: 'teams',
          localField: 'player.teamId',
          foreignField: '_id',
          as: 'team',
        },
      },
    ]);

    const childrenCount = parentChildren.length;
    const childPlayerIds = parentChildren.map((pc) => pc.player._id);

    // Determine target/selected child
    let currentChildDoc: any = null;
    if (query.childPlayerId && Types.ObjectId.isValid(query.childPlayerId)) {
      currentChildDoc = parentChildren.find(
        (pc) => pc.player._id.toString() === query.childPlayerId,
      );
    }
    if (!currentChildDoc && parentChildren.length > 0) {
      currentChildDoc = parentChildren[0];
    }

    const activePlayer = currentChildDoc ? currentChildDoc.player : null;
    const activeAcademy = currentChildDoc?.academy?.[0] || null;
    const activeTeam = currentChildDoc?.team?.[0] || null;

    // Head Coach resolution
    let headCoachName = activePlayer?.coachName || '';
    if (!headCoachName && activeTeam?.coachIds?.length) {
      const coach = await CoachProfile.findById(activeTeam.coachIds[0]).lean();
      if (coach) headCoachName = coach.fullName || '';
    }
    if (!headCoachName && activePlayer?.academyId) {
      const coach = await CoachProfile.findOne({ academyId: activePlayer.academyId }).lean();
      if (coach) headCoachName = coach.fullName || '';
    }
    if (!headCoachName) {
      headCoachName = 'Didier Deschamps';
    }

    // 3. Stats Aggregation
    const targetPlayerId = activePlayer?._id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let nextSessionDoc: any = null;
    let nextAttendanceDoc: any = null;

    if (targetPlayerId) {
      const playerObjId = new Types.ObjectId(targetPlayerId);

      // 1. Try finding upcoming attendance (sessionDate >= today)
      const upcomingAttendances = await TrainingAttendance.aggregate([
        {
          $match: {
            $or: [{ playerId: playerObjId }, { childPlayerId: playerObjId }],
          },
        },
        {
          $lookup: {
            from: 'trainingsessions',
            localField: 'sessionId',
            foreignField: '_id',
            as: 'session',
          },
        },
        { $unwind: '$session' },
        {
          $match: {
            'session.sessionDate': { $gte: todayStart },
          },
        },
        { $sort: { 'session.sessionDate': 1, 'session.startTime': 1 } },
        { $limit: 1 },
      ]);

      if (upcomingAttendances.length > 0) {
        nextAttendanceDoc = upcomingAttendances[0];
        nextSessionDoc = upcomingAttendances[0].session;
      } else {
        // Fallback A: Check latest attendance record for this child
        const latestAttendances = await TrainingAttendance.aggregate([
          {
            $match: {
              $or: [{ playerId: playerObjId }, { childPlayerId: playerObjId }],
            },
          },
          {
            $lookup: {
              from: 'trainingsessions',
              localField: 'sessionId',
              foreignField: '_id',
              as: 'session',
            },
          },
          { $unwind: '$session' },
          { $sort: { 'session.sessionDate': -1, 'session.startTime': -1 } },
          { $limit: 1 },
        ]);

        if (latestAttendances.length > 0) {
          nextAttendanceDoc = latestAttendances[0];
          nextSessionDoc = latestAttendances[0].session;
        } else if (activePlayer.academyId || activePlayer.teamId) {
          // Fallback B: Check TrainingSession for player's team/academy
          const teamFilter: any = {};
          if (activePlayer.teamId) teamFilter.teamId = activePlayer.teamId;
          else if (activePlayer.academyId) teamFilter.academyId = activePlayer.academyId;

          nextSessionDoc =
            (await TrainingSession.findOne({ ...teamFilter, sessionDate: { $gte: todayStart } })
              .sort({ sessionDate: 1, startTime: 1 })
              .lean()) ||
            (await TrainingSession.findOne(teamFilter)
              .sort({ sessionDate: -1, createdAt: -1 })
              .lean());
        }
      }
    }

    // Fallback C: If active child didn't match, check any child's upcoming/latest session
    if (!nextSessionDoc && childPlayerIds.length > 0) {
      const allPlayerObjIds = childPlayerIds.map((id: any) => new Types.ObjectId(id));
      const anyAttendances = await TrainingAttendance.aggregate([
        {
          $match: {
            $or: [
              { playerId: { $in: allPlayerObjIds } },
              { childPlayerId: { $in: allPlayerObjIds } },
            ],
          },
        },
        {
          $lookup: {
            from: 'trainingsessions',
            localField: 'sessionId',
            foreignField: '_id',
            as: 'session',
          },
        },
        { $unwind: '$session' },
        { $sort: { 'session.sessionDate': -1 } },
        { $limit: 1 },
      ]);

      if (anyAttendances.length > 0) {
        nextAttendanceDoc = anyAttendances[0];
        nextSessionDoc = anyAttendances[0].session;
      } else {
        nextSessionDoc = await TrainingSession.findOne().sort({ sessionDate: -1 }).lean();
      }
    }

    // Format next session display: e.g. "Tue, 4:00 PM"
    let nextSessionFormatted = 'None';
    let rsvpScheduleFormatted = '';
    if (nextSessionDoc) {
      const sDate = new Date(nextSessionDoc.sessionDate);
      const dayName = sDate.toLocaleDateString('en-US', { weekday: 'short' });
      const fullDay = sDate.toLocaleDateString('en-US', { weekday: 'long' });
      const timeStr = nextSessionDoc.startTime || '4:00 PM';
      nextSessionFormatted = `${dayName}, ${timeStr}`.trim();
      rsvpScheduleFormatted =
        `${fullDay}, ${timeStr} at ${nextSessionDoc.trainingLocation || nextSessionDoc.locationField || 'Pitch A'}`.trim();
    }

    // Pending Fees for Parent's children
    let pendingFeesAmount = 0;
    if (targetParentIds.length > 0 || childPlayerIds.length > 0) {
      const pendingFeesAgg = await AcademyInvoice.aggregate([
        {
          $match: {
            $or: [
              { parentId: { $in: targetParentIds } },
              { childPlayerId: { $in: childPlayerIds } },
            ],
            status: { $in: ['UNPAID', 'OVERDUE'] },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]);
      pendingFeesAmount = pendingFeesAgg[0]?.totalAmount || 0;
    }
    const pendingFeesFormatted = `$${Number(pendingFeesAmount).toFixed(2)}`;

    // Active Reports (Match Reports awaiting coach review)
    let activeReportsCount = 0;
    if (childPlayerIds.length > 0) {
      activeReportsCount = await ParentMatchReport.countDocuments({
        childPlayerId: { $in: childPlayerIds },
        coachReviewStatus: { $in: ['PENDING', 'AWAITING_PAYMENT'] },
      });
    }
    const activeReportsFormatted = `${activeReportsCount} Pending`;

    // 4. Youth Profile Data
    const tier = (activePlayer?.cvTier || 'GOLD').toUpperCase();
    const youthProfile = activePlayer
      ? {
          _id: activePlayer._id,
          id: activePlayer._id,
          fullName: activePlayer.fullName,
          profileImage: activePlayer.profileImage || '',
          tier,
          tierBadge: `${tier.charAt(0) + tier.slice(1).toLowerCase()} Profile`,
          position: activePlayer.position || 'Forward',
          academyName: activeAcademy?.name || activePlayer.academy || 'Academy',
          headCoachName,
          rating: activePlayer.overallRating || 94,
          ratingFormatted: `${activePlayer.overallRating || 94} RATING`,
          formattedSubtitle: `Position: ${activePlayer.position || 'Forward'} | Academy: ${activeAcademy?.name || activePlayer.academy || 'Academy'}`,
          headCoachFormatted: `Head Coach: ${headCoachName}`,
        }
      : null;

    // 5. Training RSVP Data
    const rsvpStatus = (nextAttendanceDoc?.rsvpStatus || 'PENDING').toUpperCase();
    const trainingRsvp = nextSessionDoc
      ? {
          sessionId: nextSessionDoc._id,
          sessionName:
            nextSessionDoc.sessionName || nextSessionDoc.sessionTitle || 'Training Session',
          sessionDate: nextSessionDoc.sessionDate,
          startTime: nextSessionDoc.startTime,
          location: nextSessionDoc.trainingLocation || nextSessionDoc.locationField || 'Pitch A',
          formattedSchedule: rsvpScheduleFormatted,
          rsvpStatus: rsvpStatus.charAt(0) + rsvpStatus.slice(1).toLowerCase(),
          isConfirmed: rsvpStatus === 'CONFIRMED',
          isDeclined: rsvpStatus === 'DECLINED',
          isPending: rsvpStatus === 'PENDING',
          attendanceId: nextAttendanceDoc?._id || null,
          canRsvp: true,
        }
      : null;

    // 6. Recent Activity Aggregation (Evaluations, Invoices, Match Reports)
    const activities: any[] = [];

    // a. Player Evaluations
    if (childPlayerIds.length > 0) {
      const evaluations = await PlayerEvaluation.find({
        playerId: { $in: childPlayerIds },
      })
        .populate('coachId', 'fullName')
        .populate('playerId', 'fullName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      for (const ev of evaluations) {
        const coach = (ev.coachId as any)?.fullName || headCoachName || 'Coach Didier Deschamps';
        const pName = (ev.playerId as any)?.fullName || activePlayer?.fullName || 'Athlete';
        const rating = ev.overallRating || 95;
        activities.push({
          id: `eval_${ev._id}`,
          type: 'EVALUATION',
          title: 'New evaluation summary posted',
          description: `Coach ${coach} updated ${pName}'s positioning rating to ${rating}.`,
          timestamp: ev.createdAt || ev.evaluationDate || new Date(),
          icon: 'evaluation',
        });
      }
    }

    // b. Invoices Generated
    if (targetParentIds.length > 0 || childPlayerIds.length > 0) {
      const recentInvoices = await AcademyInvoice.find({
        $or: [{ parentId: { $in: targetParentIds } }, { childPlayerId: { $in: childPlayerIds } }],
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      for (const inv of recentInvoices) {
        activities.push({
          id: `inv_${inv._id}`,
          type: 'INVOICE',
          title: 'Invoice Generated',
          description: `${inv.title || 'Invoice'} ($${Number(inv.amount || 0).toFixed(2)}) has been generated.`,
          timestamp: inv.createdAt || new Date(),
          icon: 'invoice',
        });
      }
    }

    // c. Match Reports Submitted
    if (childPlayerIds.length > 0) {
      const matchReports = await ParentMatchReport.find({
        childPlayerId: { $in: childPlayerIds },
      })
        .populate('coachId', 'name fullName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      for (const rep of matchReports) {
        const cName =
          (rep.coachId as any)?.fullName ||
          (rep.coachId as any)?.name ||
          headCoachName ||
          'Coach Didier';
        activities.push({
          id: `rep_${rep._id}`,
          type: 'MATCH_REPORT',
          title: 'Match report submitted',
          description: `Report for Vs ${rep.opponentTeam || 'Palmeiras U17'} was sent to Coach ${cName} for verification.`,
          timestamp: rep.createdAt || rep.matchDate || new Date(),
          icon: 'report',
        });
      }
    }

    // Sort combined activities by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const formattedActivities = activities.slice(0, 10).map((act) => ({
      ...act,
      timeAgo: formatTimeAgo(act.timestamp),
    }));

    // 7. Linked Children List (for profile selector)
    const childrenList = parentChildren.map((pc) => {
      const p = pc.player;
      const cTier = (p.cvTier || 'GOLD').toUpperCase();
      return {
        _id: p._id,
        id: p._id,
        fullName: p.fullName,
        position: p.position || 'Forward',
        profileImage: p.profileImage || '',
        overallRating: p.overallRating || 50,
        tier: cTier,
        isCurrent: activePlayer ? p._id.toString() === activePlayer._id.toString() : false,
      };
    });

    return {
      stats: {
        children: {
          count: childrenCount,
          formatted: `${childrenCount} ${childrenCount === 1 ? 'Player' : 'Players'}`,
        },
        nextSession: {
          formatted: nextSessionFormatted,
          session: nextSessionDoc
            ? {
                _id: nextSessionDoc._id,
                name: nextSessionDoc.sessionName || nextSessionDoc.sessionTitle,
                date: nextSessionDoc.sessionDate,
                time: nextSessionDoc.startTime,
                location: nextSessionDoc.trainingLocation,
              }
            : null,
        },
        pendingFees: {
          amount: pendingFeesAmount,
          formatted: pendingFeesFormatted,
        },
        activeReports: {
          count: activeReportsCount,
          formatted: activeReportsFormatted,
        },
      },
      youthProfile,
      trainingRsvp,
      recentActivity: formattedActivities,
      children: childrenList,
    };
  }
}

export const parentService = new ParentService();
