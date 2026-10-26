import { Types } from 'mongoose';
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
import { Team } from '@/modules/academy/academy.model';
import { TrainingSession, TrainingAttendance } from '@/modules/training/training.model';
import { IParentProfile, IParentMatchReport } from './parent.interface';
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

  async createMatchReport(
    parentId: string,
    payload: Partial<IParentMatchReport> & { requestCoachReview?: boolean },
  ) {
    const status = payload.requestCoachReview ? 'PENDING' : 'UNPAID';
    return ParentMatchReport.create({
      ...payload,
      parentId,
      coachReviewStatus: status,
    });
  }

  async getMatchReports(parentId: string) {
    return ParentMatchReport.find({ parentId }).populate('childPlayerId', 'fullName position');
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
}

export const parentService = new ParentService();
