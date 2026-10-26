import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { AcademyProfile } from '../academy.model';
import { CoachProfile } from '@/modules/coach/coach.model';

export class AcademyResolverService {
  async resolveAcademyProfile(identifier: string) {
    if (!identifier) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Academy identifier is required');
    }
    let academy = null;
    if (Types.ObjectId.isValid(identifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: identifier }, { userId: identifier }],
      });
    }
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found');
    }
    return academy;
  }

  async resolveUserAcademy(user: any, academyIdentifier?: string) {
    if (academyIdentifier) {
      return this.resolveAcademyProfile(academyIdentifier);
    }
    const userId = user?.userId || user?.id || user?._id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'User authentication required');
    }
    let academy = await AcademyProfile.findOne({ userId });
    if (!academy) {
      const coach = await CoachProfile.findOne({ userId });
      if (coach?.academyId) {
        academy = await AcademyProfile.findById(coach.academyId);
      }
    }
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found for this user account');
    }
    return academy;
  }
}

export const academyResolverService = new AcademyResolverService();
