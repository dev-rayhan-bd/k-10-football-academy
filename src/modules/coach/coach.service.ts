import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { ICoachProfile, ITacticalFormation, ICoachTestimonial } from './coach.interface';
import { CoachProfile, TacticalFormation, CoachTestimonial } from './coach.model';
import QueryBuilder from '@/builder/QueryBuilder';

export class CoachService {
  async createProfile(payload: Partial<ICoachProfile>) {
    const existing = await CoachProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Coach profile already exists for this user');
    }
    return CoachProfile.create(payload);
  }

  async getProfileById(id: string) {
    let profile = null;
    if (Types.ObjectId.isValid(id)) {
      profile = await CoachProfile.findById(id).populate('userId', 'name email avatar phone');
      if (!profile) {
        profile = await CoachProfile.findOne({ userId: id }).populate(
          'userId',
          'name email avatar phone',
        );
      }
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }
    return profile;
  }

  async getMyProfile(userId: string) {
    let profile = await CoachProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      // Check if user is a coach and create profile
      const user = await UserModel.findById(userId);
      if (user && user.role === 'COACH') {
        profile = await CoachProfile.create({
          userId: user._id,
          fullName: user.name,
          title: 'Football Coach',
          coachType: 'INDIVIDUAL_COACH',
          yearsExperience: 0,
          licenseStatus: 'No Official License',
          speciality: 'Tactical Coaching',
          cvTier: 'BRONZE',
          status: 'AVAILABLE',
        });
        await profile.populate('userId', 'name email avatar phone');
      }
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }
    return profile;
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    const coachQuery = new QueryBuilder(
      CoachProfile.find().populate('userId', 'name email avatar'),
      query,
    )
      .search(['fullName', 'club', 'coachingStyle', 'primaryRole', 'nationality'])
      .filter()
      .sort()
      .paginate();

    const result = await coachQuery.modelQuery;
    const meta = await coachQuery.countTotal();

    return {
      meta,
      result,
    };
  }

  async updateProfile(id: string, payload: Partial<ICoachProfile>) {
    const profile = await CoachProfile.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }
    return profile;
  }

  async saveTacticalFormation(coachId: string, payload: Partial<ITacticalFormation>) {
    const formation = await TacticalFormation.findOneAndUpdate(
      { coachId, formationSlot: payload.formationSlot },
      { ...payload, coachId },
      { new: true, upsert: true, runValidators: true },
    );
    return formation;
  }

  async getTacticalFormations(coachId: string) {
    return TacticalFormation.find({ coachId }).sort({ formationSlot: 1 });
  }

  async addTestimonial(coachId: string, payload: Partial<ICoachTestimonial>) {
    return CoachTestimonial.create({ ...payload, coachId });
  }

  async getTestimonials(coachId: string) {
    return CoachTestimonial.find({ coachId }).sort({ createdAt: -1 });
  }
}

export const coachService = new CoachService();
