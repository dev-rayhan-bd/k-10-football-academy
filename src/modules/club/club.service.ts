import { AppError } from '@/utils/AppError';
import { IClubProfile, IClubAchievement, IClubFavourite } from './club.interface';
import { ClubProfile, ClubAchievement, ClubFavourite } from './club.model';
import QueryBuilder from '@/builder/QueryBuilder';

export class ClubService {
  async createProfile(payload: Partial<IClubProfile>) {
    const existing = await ClubProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Club profile already exists');
    }
    return ClubProfile.create(payload);
  }

  async getProfileById(id: string) {
    const profile = await ClubProfile.findById(id).populate('userId', 'name email avatar phone');
    if (!profile) {
      throw new AppError(404, 'Club profile not found');
    }
    return profile;
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    const clubQuery = new QueryBuilder(
      ClubProfile.find().populate('userId', 'name email avatar phone'),
      query,
    )
      .search(['name', 'league', 'country', 'city', 'stadium'])
      .filter()
      .sort()
      .paginate();

    const result = await clubQuery.modelQuery;
    const meta = await clubQuery.countTotal();

    return {
      meta,
      result,
    };
  }

  async addAchievement(clubId: string, payload: Partial<IClubAchievement>) {
    return ClubAchievement.create({ ...payload, clubId });
  }

  async getAchievements(clubId: string) {
    return ClubAchievement.find({ clubId }).sort({ year: -1 });
  }

  async addFavourite(clubId: string, payload: Partial<IClubFavourite>) {
    return ClubFavourite.create({ ...payload, clubId });
  }

  async getFavourites(clubId: string) {
    return ClubFavourite.find({ clubId }).populate('targetPlayerId').populate('targetCoachId');
  }
}

export const clubService = new ClubService();
