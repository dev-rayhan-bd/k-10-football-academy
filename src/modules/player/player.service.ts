import { AppError } from '@/utils/AppError';
import { IPlayerProfile, IPlayerAttributes, IMatchRecord } from './player.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
  MatchRecord,
} from './player.model';

export class PlayerService {
  async createProfile(payload: Partial<IPlayerProfile>) {
    const existing = await PlayerProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Player profile already exists for this user');
    }
    const profile = await PlayerProfile.create(payload);

    // Initialize default sub-records
    await PlayerAttributes.create({ playerId: profile._id });
    await PlayerMentalAnalysis.create({ playerId: profile._id });
    await PlayerFullPotential.create({ playerId: profile._id });
    await FifaCardStats.create({
      playerId: profile._id,
      overallRating: profile.overallRating || 50,
      position: profile.position,
    });

    return profile;
  }

  async getProfileById(id: string) {
    const profile = await PlayerProfile.findById(id).populate('userId', 'name email avatar phone');
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }
    return profile;
  }

  async getProfileByUserId(userId: string) {
    const profile = await PlayerProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      throw new AppError(404, 'Player profile not found for user');
    }
    return profile;
  }

  async getAllProfiles(filter: Record<string, unknown> = {}) {
    return PlayerProfile.find(filter).populate('userId', 'name email avatar');
  }

  async updateProfile(id: string, payload: Partial<IPlayerProfile>) {
    const profile = await PlayerProfile.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }
    return profile;
  }

  async updateAttributes(playerId: string, payload: Partial<IPlayerAttributes>) {
    const attributes = await PlayerAttributes.findOneAndUpdate({ playerId }, payload, {
      new: true,
      upsert: true,
      runValidators: true,
    });
    return attributes;
  }

  async getAttributes(playerId: string) {
    const attributes = await PlayerAttributes.findOne({ playerId });
    if (!attributes) {
      throw new AppError(404, 'Player attributes not found');
    }
    return attributes;
  }

  async addMatchRecord(payload: Partial<IMatchRecord>) {
    return MatchRecord.create(payload);
  }

  async getMatchRecordsByPlayerId(playerId: string) {
    return MatchRecord.find({ playerId }).sort({ matchDate: -1 });
  }
}

export const playerService = new PlayerService();
