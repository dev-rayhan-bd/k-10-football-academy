import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import { UserModel } from '@/modules/user/user.model';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
} from '@/modules/player/player.model';
import { Team } from '@/modules/academy/academy.model';
import { ParentProfile, ParentChild } from '../parent.model';

export class ParentChildrenService {
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
}

export const parentChildrenService = new ParentChildrenService();
