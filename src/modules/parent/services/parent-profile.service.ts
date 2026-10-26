import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { UserModel } from '@/modules/user/user.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { IParentProfile } from '../parent.interface';
import { ParentProfile, ParentChild } from '../parent.model';

export class ParentProfileService {
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

export const parentProfileService = new ParentProfileService();
