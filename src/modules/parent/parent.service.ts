import { AppError } from '@/utils/AppError';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { UserModel } from '@/modules/user/user.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { IParentProfile, IParentChild, IParentMatchReport } from './parent.interface';
import { ParentProfile, ParentChild, ParentMatchReport } from './parent.model';

export class ParentService {
  async switchProfile(parentId: string, childUserId: string) {
    const parent = await UserModel.findById(parentId);
    if (!parent) throw new AppError(404, 'Parent not found');

    const childUser = await UserModel.findById(childUserId);
    if (!childUser) throw new AppError(404, 'Child user account not found');

    const childPlayerProfile = await PlayerProfile.findOne({ userId: childUserId });
    if (!childPlayerProfile) throw new AppError(404, 'Child player profile not found');

    const linkExists = await ParentChild.findOne({
      parentId,
      childPlayerId: childPlayerProfile._id,
    });
    if (!linkExists) {
      throw new AppError(
        403,
        'You are not authorized to switch to this profile. Link does not exist.',
      );
    }

    const accessToken = jwt.sign(
      { userId: childUser._id.toString(), email: childUser.email, role: childUser.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    const refreshToken = jwt.sign(
      { userId: childUser._id.toString(), email: childUser.email, role: childUser.role },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    const userObj = childUser.toObject();

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

  async linkChild(parentId: string, payload: Partial<IParentChild>) {
    return ParentChild.create({ ...payload, parentId });
  }

  async getChildren(parentId: string) {
    return ParentChild.find({ parentId }).populate('childPlayerId');
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
}

export const parentService = new ParentService();
