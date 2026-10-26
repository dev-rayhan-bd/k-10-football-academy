import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { env } from '@/config/env';
import { PlayerProfile } from '@/modules/player/player.model';
import { ClubFavourite } from '../club.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { clubResolverService } from './club-resolver.service';

export class ClubCvLibraryService {
  async getClubCvsLibrary(userId: string, query: any = {}) {
    const club = await clubResolverService.resolveClub(userId);
    const baseUrl = (env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const playerShareBase = (
      env.SCOUTING_BOARD_SHARE_PLAYER ||
      process.env.SCOUTING_BOARD_SHARE_PLAYER ||
      `${baseUrl}/players/share`
    ).replace(/\/$/, '');

    const tab = (query.tab || 'ALL').toUpperCase();
    const position = query.position ? String(query.position).toUpperCase() : null;
    const country = query.country ? String(query.country).trim() : null;
    const minAge = query.minAge ? Number(query.minAge) : null;
    const maxAge = query.maxAge ? Number(query.maxAge) : null;
    const statusFilter = query.status ? String(query.status).toUpperCase() : null;
    const searchTerm = query.searchTerm ? String(query.searchTerm).trim() : null;

    // Favourites / Liked
    const playerFavourites = await ClubFavourite.find({
      clubId: club._id,
      targetType: 'PLAYER',
    }).select('targetPlayerId');
    const favPlayerIdSet = new Set([
      ...playerFavourites.map((f) => f.targetPlayerId?.toString()).filter(Boolean),
      ...(club.likedPlayerIds || []).map((id) => id.toString()),
    ]);

    // Shared
    const sharedProfiles = (club.sharedPlayerProfiles || []).filter(
      (s: any) => s.playerId && Types.ObjectId.isValid(s.playerId),
    );
    const sharedMap = new Map<string, number>();
    sharedProfiles.forEach((s: any) => {
      sharedMap.set(s.playerId.toString(), s.shareCount || 1);
    });

    const isLikedFilter = query.liked === 'true' || tab === 'LIKED';
    const isSharedFilter = query.shared === 'true' || tab === 'SHARED';

    const playerQuery: any = {};
    if (isLikedFilter) {
      const likedIds = Array.from(favPlayerIdSet).map((id) => new Types.ObjectId(id));
      if (likedIds.length === 0) {
        return {
          metrics: {
            allCvs: { label: 'ALL CVS', count: await PlayerProfile.countDocuments({}) },
            likedCvs: { label: 'LIKED CVS', count: 0 },
            profilesShared: {
              label: 'PROFILES SHARED',
              count: sharedProfiles.reduce((sum: number, s: any) => sum + (s.shareCount || 1), 0),
            },
          },
          currentTab: 'LIKED',
          meta: {
            page: 1,
            limit: Number(query.limit) || 10,
            total: 0,
            totalPages: 1,
          },
          data: [],
        };
      }
      playerQuery._id = { $in: likedIds };
    } else if (isSharedFilter) {
      const sharedIds = Array.from(sharedMap.keys()).map((id) => new Types.ObjectId(id));
      if (sharedIds.length === 0) {
        return {
          metrics: {
            allCvs: { label: 'ALL CVS', count: await PlayerProfile.countDocuments({}) },
            likedCvs: { label: 'LIKED CVS', count: favPlayerIdSet.size },
            profilesShared: { label: 'PROFILES SHARED', count: 0 },
          },
          currentTab: 'SHARED',
          meta: {
            page: 1,
            limit: Number(query.limit) || 10,
            total: 0,
            totalPages: 1,
          },
          data: [],
        };
      }
      playerQuery._id = { $in: sharedIds };
    }

    if (position && position !== 'ALL' && position !== 'ALL POSITIONS') {
      playerQuery.position = new RegExp(position, 'i');
    }
    if (country && country !== 'ALL' && country !== 'ALL COUNTRIES' && country !== 'COUNTRY') {
      playerQuery.country = new RegExp(country, 'i');
    }
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      playerQuery.$or = [
        { fullName: searchRegex },
        { currentClub: searchRegex },
        { position: searchRegex },
        { country: searchRegex },
      ];
    }

    const rawPlayers = await PlayerProfile.find(playerQuery)
      .select(
        '_id fullName avatar profileImage position currentClub academy country dateOfBirth age overallRating cvTier',
      )
      .sort({ overallRating: -1, createdAt: -1 })
      .lean();

    let processedPlayers = rawPlayers.map((p: any) => {
      let age = typeof p.age === 'number' ? p.age : null;
      if (p.dateOfBirth) {
        const diffMs = Date.now() - new Date(p.dateOfBirth).getTime();
        age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
      }

      const rating = typeof p.overallRating === 'number' ? p.overallRating : 0;
      const tier: 'GOLD' | 'SILVER' | 'BRONZE' =
        p.cvTier || (rating >= 90 ? 'GOLD' : rating >= 75 ? 'SILVER' : 'BRONZE');
      const pid = p._id.toString();

      return {
        id: p._id,
        playerId: p._id,
        name: p.fullName || '',
        position: (p.position || '').toUpperCase(),
        avatar: p.profileImage || p.avatar || null,
        rating: (rating / 10).toFixed(1),
        rawRating: rating,
        club: p.currentClub || p.academy || '',
        country: p.country || '',
        age,
        status: tier,
        isLiked: favPlayerIdSet.has(pid),
        isShared: sharedMap.has(pid),
        shareCount: sharedMap.get(pid) || 0,
        sharedWith: 'Other Members',
        sharedStatus: (sharedMap.get(pid) || 0) > 0 ? 'Viewed' : 'Not Viewed',
        shareableUrl: `${playerShareBase}/${pid}`,
      };
    });

    if (minAge !== null)
      processedPlayers = processedPlayers.filter((p) => (p.age !== null ? p.age >= minAge : false));
    if (maxAge !== null)
      processedPlayers = processedPlayers.filter((p) => (p.age !== null ? p.age <= maxAge : false));
    if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'ALL STATUS') {
      processedPlayers = processedPlayers.filter((p) => p.status === statusFilter);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const total = processedPlayers.length;
    const paginated = processedPlayers.slice((page - 1) * limit, page * limit);

    const allCvsCount = await PlayerProfile.countDocuments({});
    const totalLikedCount = favPlayerIdSet.size;
    const totalSharedCount = sharedProfiles.reduce(
      (sum: number, s: any) => sum + (s.shareCount || 1),
      0,
    );

    return {
      metrics: {
        allCvs: { label: 'ALL CVS', count: allCvsCount },
        likedCvs: { label: 'LIKED CVS', count: totalLikedCount },
        profilesShared: { label: 'PROFILES SHARED', count: totalSharedCount },
      },
      currentTab: tab,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data: paginated,
    };
  }

  async toggleLikePlayerCv(userId: string, playerId: string) {
    const club = await clubResolverService.resolveClub(userId);
    if (!playerId || !Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }
    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    const existingFav = await ClubFavourite.findOne({
      clubId: club._id,
      targetType: 'PLAYER',
      targetPlayerId: playerId,
    });

    let isLiked: boolean;
    if (existingFav) {
      await ClubFavourite.deleteOne({ _id: existingFav._id });
      club.likedPlayerIds = (club.likedPlayerIds || []).filter((id) => id.toString() !== playerId);
      await club.save();
      isLiked = false;
    } else {
      await ClubFavourite.create({
        clubId: club._id,
        targetType: 'PLAYER',
        targetPlayerId: playerId,
      });
      const current = (club.likedPlayerIds || []).map((id) => id.toString());
      if (!current.includes(playerId)) {
        club.likedPlayerIds = [...(club.likedPlayerIds || []), new Types.ObjectId(playerId)];
        await club.save();
      }
      isLiked = true;
    }

    const totalLikedCvs = await ClubFavourite.countDocuments({
      clubId: club._id,
      targetType: 'PLAYER',
    });

    return {
      isLiked,
      totalLikedCvs,
      message: isLiked ? 'Player added to liked CVs' : 'Player removed from liked CVs',
    };
  }

  async sharePlayerCv(userId: string, playerId: string) {
    const club = await clubResolverService.resolveClub(userId);
    if (!playerId || !Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }
    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    const baseUrl = (env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const playerShareBase = (
      env.SCOUTING_BOARD_SHARE_PLAYER ||
      process.env.SCOUTING_BOARD_SHARE_PLAYER ||
      `${baseUrl}/players/share`
    ).replace(/\/$/, '');
    const profiles = club.sharedPlayerProfiles || [];
    const existingIndex = profiles.findIndex((s) => s.playerId?.toString() === playerId);

    let updatedShareCount = 1;
    if (existingIndex > -1) {
      profiles[existingIndex].shareCount = (profiles[existingIndex].shareCount || 1) + 1;
      profiles[existingIndex].sharedAt = new Date();
      updatedShareCount = profiles[existingIndex].shareCount;
    } else {
      profiles.push({
        playerId: new Types.ObjectId(playerId),
        sharedAt: new Date(),
        shareCount: 1,
      });
    }

    club.sharedPlayerProfiles = profiles;
    await club.save();

    await AgentProfile.findOneAndUpdate({ userId }, { $inc: { cvsSharedCount: 1 } });

    const totalProfilesShared = profiles.reduce((sum, s) => sum + (s.shareCount || 1), 0);

    return {
      shareableUrl: `${playerShareBase}/${playerId}`,
      shareCount: updatedShareCount,
      totalProfilesShared,
      message: 'Profile shared successfully',
    };
  }
}

export const clubCvLibraryService = new ClubCvLibraryService();
