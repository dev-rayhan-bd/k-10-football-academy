import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { UserModel } from '@/modules/user/user.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { IParentProfile, IParentMatchReport } from './parent.interface';
import { ParentProfile, ParentChild, ParentMatchReport } from './parent.model';
import QueryBuilder from '@/builder/QueryBuilder';

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
      }).populate('parentId');

      if (link && link.parentId) {
        const parentProf: any = link.parentId;
        resolvedParentUserId = parentProf.userId
          ? parentProf.userId.toString()
          : parentProf._id.toString();
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

    const link = await ParentChild.create({
      parentId: effectiveParentId,
      childPlayerId: resolvedPlayerProfile._id,
      relationshipType: payload.relationshipType,
    });

    // Mark child account as managed by PARENT
    await UserModel.findByIdAndUpdate(resolvedPlayerProfile.userId, {
      accountManagedBy: 'PARENT',
    });

    return link;
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
      populate: { path: 'userId', select: 'name email avatar accountManagedBy' },
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

      return {
        linkId: link._id,
        relationshipType: link.relationshipType,
        childPlayerId,
        childUserId,
        fullName: child?.fullName || childUser?.name || 'Child Athlete',
        position: child?.position || 'Forward',
        profileImage: child?.profileImage || childUser?.avatar || '',
        cvTier: child?.cvTier || 'BRONZE',
        overallRating: child?.overallRating ?? 50,
        age: child?.age || null,
        dateOfBirth: child?.dateOfBirth || null,
        currentClub: child?.currentClub || '',
        accountManagedBy: childUser?.accountManagedBy || 'PARENT',
      };
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

  async getMatchReports(parentId: string, query: Record<string, unknown> = {}) {
    const reportQuery = new QueryBuilder(
      ParentMatchReport.find({ parentId }).populate('childPlayerId', 'fullName position'),
      query,
    )
      .search(['gameType', 'scoutName'])
      .filter()
      .sort()
      .paginate();

    const result = await reportQuery.modelQuery;
    const meta = await reportQuery.countTotal();

    return {
      meta,
      result,
    };
  }
}

export const parentService = new ParentService();
