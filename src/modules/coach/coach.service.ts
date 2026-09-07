import { AppError } from '@/utils/AppError';
import { ICoachProfile, ITacticalFormation, ICoachTestimonial } from './coach.interface';
import { CoachProfile, TacticalFormation, CoachTestimonial } from './coach.model';

export class CoachService {
  async createProfile(payload: Partial<ICoachProfile>) {
    const existing = await CoachProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Coach profile already exists for this user');
    }
    return CoachProfile.create(payload);
  }

  async getProfileById(id: string) {
    const profile = await CoachProfile.findById(id).populate('userId', 'name email avatar phone');
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }
    return profile;
  }

  async getAllProfiles(filter: Record<string, unknown> = {}) {
    return CoachProfile.find(filter).populate('userId', 'name email avatar');
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
