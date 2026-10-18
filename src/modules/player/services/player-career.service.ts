import { AppError } from '@/utils/AppError';
import { ALLOWED_PLAYER_STYLES } from '../player.interface';
import { PlayerProfile } from '../player.model';
import { playerCacheService } from './player-cache.service';

export class PlayerCareerService {
  async updatePlayerStyles(playerId: string, styles: string[]) {
    if (!Array.isArray(styles)) {
      throw new AppError(400, 'Styles must be an array of strings');
    }
    if (styles.length > 4) {
      throw new AppError(400, 'Maximum 4 player styles can be selected simultaneously');
    }
    for (const style of styles) {
      if (!ALLOWED_PLAYER_STYLES.includes(style as any)) {
        throw new AppError(400, `Invalid player style: ${style}`);
      }
    }
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    profile.playerStyles = styles;
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      playerId: profile._id,
      playerStyles: profile.playerStyles,
    };
  }

  async updateClubHistory(playerId: string, clubHistory: any[]) {
    if (!Array.isArray(clubHistory)) {
      throw new AppError(400, 'Club history must be an array');
    }
    if (clubHistory.length > 6) {
      throw new AppError(400, 'Maximum 6 clubs allowed in career timeline');
    }
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    profile.clubHistory = clubHistory;
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      playerId: profile._id,
      clubHistory: profile.clubHistory,
    };
  }

  async addClubHistoryItem(playerId: string, clubItem: any) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }
    profile.clubHistory = profile.clubHistory || [];
    if (profile.clubHistory.length >= 6) {
      throw new AppError(400, 'Maximum 6 clubs allowed in career timeline');
    }
    profile.clubHistory.push(clubItem);
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      playerId: profile._id,
      clubHistory: profile.clubHistory,
    };
  }

  async updatePitchMap(playerId: string, payload: { positionMap?: any[]; futsalMap?: any[] }) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }
    if (payload.positionMap !== undefined) {
      profile.positionMap = payload.positionMap;
    }
    if (payload.futsalMap !== undefined) {
      profile.futsalMap = payload.futsalMap;
    }
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      playerId: profile._id,
      positionMap: profile.positionMap,
      futsalMap: profile.futsalMap,
    };
  }
}

export const playerCareerService = new PlayerCareerService();
