import { AppError } from '@/utils/AppError';
import { IParentProfile, IParentChild, IParentMatchReport } from './parent.interface';
import { ParentProfile, ParentChild, ParentMatchReport } from './parent.model';

export class ParentService {
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
