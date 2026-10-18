import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { IPlayerProfile, IMatchRecord, ALLOWED_PLAYER_STYLES } from './player.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
} from './player.model';
import { UserModel } from '../user/user.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { playerCacheService } from './services/player-cache.service';
import { playerStatsService, computeProfileCompletion } from './services/player-stats.service';
import { playerCvService } from './services/player-cv.service';
import { playerAttributeService } from './services/player-attribute.service';
import { playerMatchService } from './services/player-match.service';
import { playerCareerService } from './services/player-career.service';
import { playerMediaService } from './services/player-media.service';

export { computeProfileCompletion };

export class PlayerService {
  // 1. Cache Management
  async invalidatePlayerCache(
    profileId?: string | Types.ObjectId,
    userId?: string | Types.ObjectId,
  ) {
    return playerCacheService.invalidatePlayerCache(profileId, userId);
  }

  // 2. Rating & Stats Recalculation
  async recalculatePlayerStats(profileId: Types.ObjectId | string) {
    return playerStatsService.recalculatePlayerStats(profileId);
  }

  // 3. Core Profile CRUD
  async createProfile(payload: Partial<IPlayerProfile>) {
    const existing = await PlayerProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Player profile already exists for this user');
    }
    payload.profileCompletion = computeProfileCompletion(payload, false);
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

    const updatedProfile = await this.recalculatePlayerStats(profile._id);
    await this.invalidatePlayerCache(profile._id, profile.userId);

    return updatedProfile || profile;
  }

  async getProfileById(id: string, viewer?: { userId?: string; role?: string }) {
    return playerCvService.getProfileById(id, viewer);
  }

  async getCVProfile(id: string, viewer?: { userId?: string; role?: string }) {
    return playerCvService.getCVProfile(id, viewer);
  }

  async getProfileByUserId(userId: string) {
    return playerCvService.getProfileByUserId(userId);
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    const queryObj = { ...query };

    // Support number conversions for Mongoose matching
    if (queryObj.age !== undefined && queryObj.age !== '') {
      queryObj.age = Number(queryObj.age);
    }
    if (queryObj.minAge || queryObj.maxAge) {
      queryObj.age = {
        ...(queryObj.minAge ? { $gte: Number(queryObj.minAge) } : {}),
        ...(queryObj.maxAge ? { $lte: Number(queryObj.maxAge) } : {}),
      };
      delete queryObj.minAge;
      delete queryObj.maxAge;
    }
    if (queryObj.minRating || queryObj.maxRating) {
      queryObj.overallRating = {
        ...(queryObj.minRating ? { $gte: Number(queryObj.minRating) } : {}),
        ...(queryObj.maxRating ? { $lte: Number(queryObj.maxRating) } : {}),
      };
      delete queryObj.minRating;
      delete queryObj.maxRating;
    }

    const playerQuery = new QueryBuilder(
      PlayerProfile.find().populate('userId', 'name email avatar phone'),
      queryObj,
    )
      .search(['fullName', 'position', 'country', 'currentClub', 'dualNationality', 'cvTier'])
      .filter()
      .sort()
      .paginate()
      .fields();

    const result = await playerQuery.modelQuery;
    const meta = await playerQuery.countTotal();

    return {
      meta,
      result,
    };
  }

  async updateProfile(id: string, payload: any) {
    const existing = await PlayerProfile.findOne({ $or: [{ _id: id }, { userId: id }] });
    if (!existing) {
      throw new AppError(404, 'Player profile not found');
    }

    if (payload.phone) {
      await UserModel.findByIdAndUpdate(existing.userId, { phone: payload.phone });
    }
    if (payload.fullName || payload.name) {
      const nameVal = payload.fullName || payload.name;
      payload.fullName = nameVal;
      await UserModel.findByIdAndUpdate(existing.userId, { name: nameVal });
    }
    if (payload.profileImage) {
      await UserModel.findByIdAndUpdate(existing.userId, { avatar: payload.profileImage });
    }
    if (payload.height !== undefined && payload.height !== '') {
      payload.height = Number(payload.height);
    }
    if (payload.weight !== undefined && payload.weight !== '') {
      payload.weight = Number(payload.weight);
    }
    if (payload.age !== undefined && payload.age !== '') {
      payload.age = Number(payload.age);
    }
    if (payload.marketValue !== undefined && payload.marketValue !== '') {
      payload.marketValue = Number(payload.marketValue);
    }
    if (payload.rightFootDominance !== undefined && payload.rightFootDominance !== '') {
      payload.rightFootDominance = Number(payload.rightFootDominance);
    }
    if (payload.leftFootDominance !== undefined && payload.leftFootDominance !== '') {
      payload.leftFootDominance = Number(payload.leftFootDominance);
    }

    // Safely parse JSON strings for complex CV fields when sent via multipart/form-data
    if (typeof payload.secondaryPositions === 'string') {
      try {
        payload.secondaryPositions = JSON.parse(payload.secondaryPositions);
      } catch {
        payload.secondaryPositions = payload.secondaryPositions
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }
    if (typeof payload.playerStyles === 'string') {
      try {
        payload.playerStyles = JSON.parse(payload.playerStyles);
      } catch {
        payload.playerStyles = payload.playerStyles
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }
    if (Array.isArray(payload.playerStyles)) {
      if (payload.playerStyles.length > 4) {
        throw new AppError(400, 'Maximum 4 player styles can be selected simultaneously');
      }
      for (const style of payload.playerStyles) {
        if (!ALLOWED_PLAYER_STYLES.includes(style as any)) {
          throw new AppError(400, `Invalid player style: ${style}`);
        }
      }
    }
    if (typeof payload.clubHistory === 'string') {
      try {
        payload.clubHistory = JSON.parse(payload.clubHistory);
      } catch {
        // ignore
      }
    }
    if (Array.isArray(payload.clubHistory) && payload.clubHistory.length > 6) {
      throw new AppError(400, 'Maximum 6 clubs allowed in career timeline');
    }
    if (typeof payload.languages === 'string') {
      try {
        payload.languages = JSON.parse(payload.languages);
      } catch {
        // ignore
      }
    }
    if (typeof payload.accomplishments === 'string') {
      try {
        payload.accomplishments = JSON.parse(payload.accomplishments);
      } catch {
        // ignore
      }
    }
    if (typeof payload.positionMap === 'string') {
      try {
        payload.positionMap = JSON.parse(payload.positionMap);
      } catch {
        // ignore
      }
    }
    if (typeof payload.futsalMap === 'string') {
      try {
        payload.futsalMap = JSON.parse(payload.futsalMap);
      } catch {
        // ignore
      }
    }
    if (typeof payload.transferStatus === 'string') {
      try {
        payload.transferStatus = JSON.parse(payload.transferStatus);
      } catch {
        // ignore
      }
    }
    if (typeof payload.coachVerification === 'string') {
      try {
        payload.coachVerification = JSON.parse(payload.coachVerification);
      } catch {
        // ignore
      }
    }
    if (typeof payload.perceptionMetrics === 'string') {
      try {
        payload.perceptionMetrics = JSON.parse(payload.perceptionMetrics);
      } catch {
        // ignore
      }
    }
    if (typeof payload.visionMetrics === 'string') {
      try {
        payload.visionMetrics = JSON.parse(payload.visionMetrics);
      } catch {
        // ignore
      }
    }

    const profile = await PlayerProfile.findOneAndUpdate({ _id: existing._id }, payload, {
      new: true,
      runValidators: true,
    });

    if (profile) {
      const updatedProfile = await this.recalculatePlayerStats(profile._id);
      return updatedProfile || profile;
    }

    return profile;
  }

  // 4. Player Career & Timeline
  async updatePlayerStyles(playerId: string, styles: string[]) {
    return playerCareerService.updatePlayerStyles(playerId, styles);
  }

  async updateClubHistory(playerId: string, clubHistory: any[]) {
    return playerCareerService.updateClubHistory(playerId, clubHistory);
  }

  async addClubHistoryItem(playerId: string, clubItem: any) {
    return playerCareerService.addClubHistoryItem(playerId, clubItem);
  }

  async updatePitchMap(playerId: string, payload: { positionMap?: any[]; futsalMap?: any[] }) {
    return playerCareerService.updatePitchMap(playerId, payload);
  }

  // 5. Attributes Management
  formatCategorizedAttributes(doc: any) {
    return playerAttributeService.formatCategorizedAttributes(doc);
  }

  async updateAttributes(playerId: string, payload: Record<string, any>) {
    return playerAttributeService.updateAttributes(playerId, payload);
  }

  async getAttributes(playerId: string) {
    return playerAttributeService.getAttributes(playerId);
  }

  // 6. Match Records
  async addMatchRecord(payload: Partial<IMatchRecord>) {
    return playerMatchService.addMatchRecord(payload);
  }

  async getMatchRecordsByPlayerId(playerId: string) {
    return playerMatchService.getMatchRecordsByPlayerId(playerId);
  }

  async addClubInterest(playerId: string, data: { clubName: string; logoUrl?: string }) {
    return playerCvService.addClubInterest(playerId, data);
  }

  // 7. Media Gallery & Highlight Videos
  async uploadHighlightVideo(
    playerId: string,
    mediaUrl?: string,
    _thumbnailUrl?: string,
    _title?: string,
  ) {
    return playerMediaService.uploadHighlightVideo(playerId, mediaUrl, _thumbnailUrl, _title);
  }

  async uploadMediaGallery(
    playerId: string,
    mediaUrl: string,
    thumbnailUrl?: string,
    title?: string,
  ) {
    return playerMediaService.uploadMediaGallery(playerId, mediaUrl, thumbnailUrl, title);
  }

  async getMediaGallery(playerId: string, page = 1, limit = 10, mediaType?: string) {
    return playerMediaService.getMediaGallery(playerId, page, limit, mediaType);
  }
}

export const playerService = new PlayerService();
