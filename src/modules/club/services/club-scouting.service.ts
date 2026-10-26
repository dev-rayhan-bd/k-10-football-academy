import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { env } from '@/config/env';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { ClubFavourite } from '../club.model';
import { clubResolverService } from './club-resolver.service';

export class ClubScoutingService {
  async getScoutingBoard(userId: string, query: any = {}) {
    const club = await clubResolverService.resolveClub(userId);
    const position = query.position ? String(query.position).toUpperCase() : null;
    const country = query.country ? String(query.country).trim() : null;
    const minAge = query.minAge ? Number(query.minAge) : null;
    const maxAge = query.maxAge ? Number(query.maxAge) : null;
    const playerStatus = query.status ? String(query.status).toUpperCase() : null;
    const searchTerm = query.searchTerm ? String(query.searchTerm).trim() : null;

    const role = query.role ? String(query.role).trim() : null;
    const coachCountry = query.coachCountry ? String(query.coachCountry).trim() : country;
    const speciality = query.speciality ? String(query.speciality).trim() : null;
    const coachStatus =
      query.coachStatus || query.status
        ? String(query.coachStatus || query.status).toUpperCase()
        : null;

    // Fetch club favourites
    const playerFavourites = await ClubFavourite.find({
      clubId: club._id,
      targetType: 'PLAYER',
    }).select('targetPlayerId');
    const coachFavourites = await ClubFavourite.find({
      clubId: club._id,
      targetType: 'COACH',
    }).select('targetCoachId');

    const favPlayerIdSet = new Set(
      playerFavourites.map((f) => f.targetPlayerId?.toString()).filter(Boolean),
    );
    const favCoachIdSet = new Set(
      coachFavourites.map((f) => f.targetCoachId?.toString()).filter(Boolean),
    );

    // Build Player Query
    const playerQuery: any = {};
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
        isFavourite: favPlayerIdSet.has(pid),
      };
    });

    if (minAge !== null)
      processedPlayers = processedPlayers.filter((p) => (p.age !== null ? p.age >= minAge : false));
    if (maxAge !== null)
      processedPlayers = processedPlayers.filter((p) => (p.age !== null ? p.age <= maxAge : false));
    if (playerStatus && playerStatus !== 'ALL' && playerStatus !== 'ALL STATUS') {
      processedPlayers = processedPlayers.filter((p) => p.status === playerStatus);
    }

    // Build Coach Query
    const coachQuery: any = {};
    if (role && role !== 'ALL' && role !== 'ALL ROLES') {
      coachQuery.$or = [{ title: new RegExp(role, 'i') }, { academyRole: new RegExp(role, 'i') }];
    }
    if (
      coachCountry &&
      coachCountry !== 'ALL' &&
      coachCountry !== 'ALL COUNTRIES' &&
      coachCountry !== 'COUNTRY'
    ) {
      coachQuery.$or = [
        { birthCountry: new RegExp(coachCountry, 'i') },
        { location: new RegExp(coachCountry, 'i') },
      ];
    }
    if (speciality && speciality !== 'ALL' && speciality !== 'SPECIALITY') {
      coachQuery.speciality = new RegExp(speciality, 'i');
    }
    if (coachStatus && coachStatus !== 'ALL' && coachStatus !== 'ALL STATUS') {
      coachQuery.status = coachStatus;
    }
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      coachQuery.$or = [
        { fullName: searchRegex },
        { title: searchRegex },
        { speciality: searchRegex },
        { currentClub: searchRegex },
        { birthCountry: searchRegex },
      ];
    }

    const rawCoaches = await CoachProfile.find(coachQuery)
      .select(
        '_id fullName title academyRole speciality currentClub birthCountry location yearsExperience status profileImage',
      )
      .sort({ yearsExperience: -1, createdAt: -1 })
      .lean();

    const processedCoaches = rawCoaches.map((c: any) => {
      const cid = c._id.toString();
      const yrs = typeof c.yearsExperience === 'number' ? c.yearsExperience : 0;
      let status = c.status || 'AVAILABLE';
      if (status === 'ACTIVE') status = 'AVAILABLE';
      return {
        id: c._id,
        coachId: c._id,
        name: c.fullName || '',
        role: (c.title || c.academyRole || 'COACH').toUpperCase(),
        speciality: c.speciality || '',
        club: c.currentClub || '',
        country: c.birthCountry || c.location || '',
        experience: yrs ? `${yrs} yrs` : '0 yrs',
        yearsExperience: yrs,
        status,
        avatar: c.profileImage || null,
        isFavourite: favCoachIdSet.has(cid),
      };
    });

    const playerPage = Math.max(1, Number(query.playerPage || query.page) || 1);
    const playerLimit = Math.max(1, Math.min(100, Number(query.playerLimit || query.limit) || 10));
    const coachPage = Math.max(1, Number(query.coachPage || query.page) || 1);
    const coachLimit = Math.max(1, Math.min(100, Number(query.coachLimit || query.limit) || 10));

    const totalPlayers = processedPlayers.length;
    const paginatedPlayers = processedPlayers.slice(
      (playerPage - 1) * playerLimit,
      playerPage * playerLimit,
    );

    const totalCoaches = processedCoaches.length;
    const paginatedCoaches = processedCoaches.slice(
      (coachPage - 1) * coachLimit,
      coachPage * coachLimit,
    );

    return {
      players: paginatedPlayers,
      coaches: paginatedCoaches,
      meta: {
        players: {
          page: playerPage,
          limit: playerLimit,
          total: totalPlayers,
          totalPages: Math.ceil(totalPlayers / playerLimit) || 1,
        },
        coaches: {
          page: coachPage,
          limit: coachLimit,
          total: totalCoaches,
          totalPages: Math.ceil(totalCoaches / coachLimit) || 1,
        },
      },
    };
  }

  async getScoutingBoardPlayers(userId: string, query: any = {}) {
    const club = await clubResolverService.resolveClub(userId);
    const position = query.position ? String(query.position).toUpperCase().trim() : null;
    const country = query.country ? String(query.country).trim() : null;
    const minAge = query.minAge !== undefined && query.minAge !== '' ? Number(query.minAge) : null;
    const maxAge = query.maxAge !== undefined && query.maxAge !== '' ? Number(query.maxAge) : null;
    const status = query.status ? String(query.status).toUpperCase().trim() : null;
    const searchTerm = query.searchTerm ? String(query.searchTerm).trim() : null;
    const sortBy = query.sortBy ? String(query.sortBy) : 'overallRating';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const baseUrl = (env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const playerShareBase = (
      env.SCOUTING_BOARD_SHARE_PLAYER ||
      process.env.SCOUTING_BOARD_SHARE_PLAYER ||
      `${baseUrl}/players/share`
    ).replace(/\/$/, '');

    // Fetch club favourites
    const playerFavourites = await ClubFavourite.find({
      $or: [
        { clubId: club._id, targetType: 'PLAYER' },
        ...(club.userId ? [{ clubId: club.userId, targetType: 'PLAYER' }] : []),
      ],
    }).select('targetPlayerId');

    const favPlayerIdSet = new Set(
      playerFavourites.map((f: any) => f.targetPlayerId?.toString()).filter(Boolean),
    );
    (club.likedPlayerIds || []).forEach((id: any) => favPlayerIdSet.add(id.toString()));

    // Build Player Query
    const playerQuery: any = {};
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
        { academy: searchRegex },
      ];
    }
    if (status && status !== 'ALL' && status !== 'ALL STATUS') {
      if (['ACTIVE', 'INJURED'].includes(status)) {
        playerQuery.fitnessStatus = status;
      } else if (['GOLD', 'SILVER', 'BRONZE'].includes(status)) {
        playerQuery.cvTier = status;
      }
    }

    const rawPlayers = await PlayerProfile.find(playerQuery)
      .select(
        '_id fullName avatar profileImage position currentClub academy country dateOfBirth age overallRating cvTier fitnessStatus status',
      )
      .sort({ [sortBy]: sortOrder, createdAt: -1 })
      .lean();

    // Map match records for these players
    const playerIds = rawPlayers.map((p: any) => p._id);
    const matchAggregates = await MatchRecord.aggregate([
      { $match: { playerId: { $in: playerIds } } },
      {
        $group: {
          _id: '$playerId',
          matches: { $sum: 1 },
          goals: { $sum: { $ifNull: ['$goals', 0] } },
          assists: { $sum: { $ifNull: ['$assists', 0] } },
        },
      },
    ]);
    const statsMap = new Map<string, { matches: number; goals: number; assists: number }>();
    matchAggregates.forEach((m) => {
      statsMap.set(m._id.toString(), {
        matches: m.matches || 0,
        goals: m.goals || 0,
        assists: m.assists || 0,
      });
    });

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
      const currentStatus =
        p.fitnessStatus || (p.status === 'ACTIVE' || p.status === 'INJURED' ? p.status : 'ACTIVE');
      const stats = statsMap.get(pid) || { matches: 0, goals: 0, assists: 0 };
      const formattedTier = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();

      return {
        id: p._id,
        playerId: p._id,
        name: p.fullName || '',
        position: (p.position || '').toUpperCase(),
        avatar: p.profileImage || p.avatar || null,
        rating: (rating / 10).toFixed(1),
        rawRating: rating,
        club: p.currentClub || p.academy || 'Free Agent',
        country: p.country || '',
        age,
        matches: stats.matches,
        goals: stats.goals,
        assists: stats.assists,
        status: formattedTier,
        statusBadge: formattedTier,
        tier,
        cvTier: tier,
        fitnessStatus: currentStatus,
        isFavourite: favPlayerIdSet.has(pid),
        isLiked: favPlayerIdSet.has(pid),
        shareableUrl: `${playerShareBase}/${p._id}`,
      };
    });

    if (minAge !== null) {
      processedPlayers = processedPlayers.filter((p) => (p.age !== null ? p.age >= minAge : false));
    }
    if (maxAge !== null) {
      processedPlayers = processedPlayers.filter((p) => (p.age !== null ? p.age <= maxAge : false));
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const total = processedPlayers.length;
    const paginatedPlayers = processedPlayers.slice((page - 1) * limit, page * limit);

    // Summary cards (matches Image 2 stats)
    const activeCount = processedPlayers.filter((p) => p.status === 'ACTIVE').length;
    const injuredCount = processedPlayers.filter((p) => p.status === 'INJURED').length;
    const avgRatingVal =
      total > 0
        ? (processedPlayers.reduce((sum, p) => sum + (p.rawRating || 0), 0) / total / 10).toFixed(1)
        : '0.0';

    return {
      summary: {
        totalPlayers: total,
        avgRating: Number(avgRatingVal),
        active: activeCount,
        injured: injuredCount,
      },
      players: paginatedPlayers,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getScoutingBoardCoaches(userId: string, query: any = {}) {
    const club = await clubResolverService.resolveClub(userId);
    const role = query.role ? String(query.role).trim() : null;
    const country = query.country ? String(query.country).trim() : null;
    const speciality = query.speciality ? String(query.speciality).trim() : null;
    const status = query.status ? String(query.status).trim() : null;
    const searchTerm = query.searchTerm ? String(query.searchTerm).trim() : null;
    const sortBy = query.sortBy ? String(query.sortBy) : 'yearsExperience';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const baseUrl = (env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const coachShareBase = (
      env.SCOUTING_BOARD_SHARE_COACH ||
      process.env.SCOUTING_BOARD_SHARE_COACH ||
      `${baseUrl}/coach/share`
    ).replace(/\/$/, '');

    // Fetch coach favourites
    const coachFavourites = await ClubFavourite.find({
      $or: [
        { clubId: club._id, targetType: 'COACH' },
        ...(club.userId ? [{ clubId: club.userId, targetType: 'COACH' }] : []),
      ],
    }).select('targetCoachId');

    const favCoachIdSet = new Set(
      coachFavourites.map((f: any) => f.targetCoachId?.toString()).filter(Boolean),
    );

    // Build Coach Query
    const coachQuery: any = {};
    if (role && role !== 'ALL' && role !== 'ALL ROLES') {
      coachQuery.$or = [{ title: new RegExp(role, 'i') }, { academyRole: new RegExp(role, 'i') }];
    }
    if (country && country !== 'ALL' && country !== 'ALL COUNTRIES' && country !== 'COUNTRY') {
      coachQuery.$or = [
        { birthCountry: new RegExp(country, 'i') },
        { location: new RegExp(country, 'i') },
        { country: new RegExp(country, 'i') },
      ];
    }
    if (speciality && speciality !== 'ALL' && speciality !== 'SPECIALITY') {
      coachQuery.speciality = new RegExp(speciality, 'i');
    }
    if (status && status !== 'ALL' && status !== 'ALL STATUS') {
      coachQuery.status = new RegExp(`^${status}$`, 'i');
    }
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      coachQuery.$or = [
        { fullName: searchRegex },
        { title: searchRegex },
        { academyRole: searchRegex },
        { speciality: searchRegex },
        { currentClub: searchRegex },
        { birthCountry: searchRegex },
        { location: searchRegex },
      ];
    }

    const rawCoaches = await CoachProfile.find(coachQuery)
      .select(
        '_id fullName title academyRole speciality currentClub birthCountry location country yearsExperience status profileImage',
      )
      .sort({ [sortBy]: sortOrder, createdAt: -1 })
      .lean();

    const processedCoaches = rawCoaches.map((c: any) => {
      const cid = c._id.toString();
      const yrs = typeof c.yearsExperience === 'number' ? c.yearsExperience : 0;
      let coachStatus = c.status || 'AVAILABLE';
      if (coachStatus === 'ACTIVE') coachStatus = 'AVAILABLE';

      return {
        id: c._id,
        coachId: c._id,
        name: c.fullName || '',
        avatar: c.profileImage || null,
        role: (c.title || c.academyRole || 'HEAD COACH').toUpperCase(),
        speciality: c.speciality || 'General',
        club: c.currentClub || 'Available',
        country: c.birthCountry || c.location || c.country || '',
        experience: yrs ? `${yrs} yrs` : '0 yrs',
        yearsExperience: yrs,
        status: coachStatus,
        isFavourite: favCoachIdSet.has(cid),
        shareableUrl: `${coachShareBase}/${c._id}`,
      };
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const total = processedCoaches.length;
    const paginatedCoaches = processedCoaches.slice((page - 1) * limit, page * limit);

    return {
      coaches: paginatedCoaches,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async shareScoutingProfile(
    userId: string,
    payload: { targetType: 'PLAYER' | 'COACH'; targetId: string },
  ) {
    const club = await clubResolverService.resolveClub(userId);
    const { targetType, targetId } = payload;
    if (!targetType || !['PLAYER', 'COACH'].includes(targetType)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'targetType must be PLAYER or COACH');
    }
    if (!targetId || !Types.ObjectId.isValid(targetId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid target ID');
    }

    const baseUrl = (env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const playerShareBase = (
      env.SCOUTING_BOARD_SHARE_PLAYER ||
      process.env.SCOUTING_BOARD_SHARE_PLAYER ||
      `${baseUrl}/players/share`
    ).replace(/\/$/, '');
    const coachShareBase = (
      env.SCOUTING_BOARD_SHARE_COACH ||
      process.env.SCOUTING_BOARD_SHARE_COACH ||
      `${baseUrl}/coach/share`
    ).replace(/\/$/, '');

    if (targetType === 'PLAYER') {
      const player = await PlayerProfile.findById(targetId);
      if (!player) throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');

      const profiles = club.sharedPlayerProfiles || [];
      const existingIndex = profiles.findIndex((s) => s.playerId?.toString() === targetId);

      let updatedShareCount = 1;
      if (existingIndex > -1) {
        profiles[existingIndex].shareCount = (profiles[existingIndex].shareCount || 1) + 1;
        profiles[existingIndex].sharedAt = new Date();
        updatedShareCount = profiles[existingIndex].shareCount;
      } else {
        profiles.push({
          playerId: new Types.ObjectId(targetId),
          sharedAt: new Date(),
          shareCount: 1,
        });
      }

      club.sharedPlayerProfiles = profiles;
      await club.save();

      return {
        shareableUrl: `${playerShareBase}/${targetId}`,
        targetType: 'PLAYER',
        targetId,
        shareCount: updatedShareCount,
        message: 'Player profile share link generated successfully',
      };
    } else {
      const coach = await CoachProfile.findById(targetId);
      if (!coach) throw new AppError(StatusCodes.NOT_FOUND, 'Coach not found');

      return {
        shareableUrl: `${coachShareBase}/${targetId}`,
        targetType: 'COACH',
        targetId,
        shareCount: 1,
        message: 'Coach profile share link generated successfully',
      };
    }
  }

  async toggleScoutingFavourite(
    userId: string,
    payload: { targetType: 'PLAYER' | 'COACH'; targetId: string },
  ) {
    const club = await clubResolverService.resolveClub(userId);
    const { targetType, targetId } = payload;
    if (!targetType || !['PLAYER', 'COACH'].includes(targetType)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'targetType must be PLAYER or COACH');
    }
    if (!targetId || !Types.ObjectId.isValid(targetId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid target ID');
    }

    if (targetType === 'PLAYER') {
      const player = await PlayerProfile.findById(targetId);
      if (!player) throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');

      const existingFav = await ClubFavourite.findOne({
        clubId: club._id,
        targetType: 'PLAYER',
        targetPlayerId: targetId,
      });

      if (existingFav) {
        await ClubFavourite.deleteOne({ _id: existingFav._id });
        club.likedPlayerIds = (club.likedPlayerIds || []).filter(
          (id) => id.toString() !== targetId,
        );
        await club.save();
        return { isFavourite: false, message: 'Player removed from favourites' };
      } else {
        await ClubFavourite.create({
          clubId: club._id,
          targetType: 'PLAYER',
          targetPlayerId: targetId,
        });
        const currentLiked = (club.likedPlayerIds || []).map((id) => id.toString());
        if (!currentLiked.includes(targetId)) {
          club.likedPlayerIds = [...(club.likedPlayerIds || []), new Types.ObjectId(targetId)];
          await club.save();
        }
        return { isFavourite: true, message: 'Player added to favourites' };
      }
    } else {
      const coach = await CoachProfile.findById(targetId);
      if (!coach) throw new AppError(StatusCodes.NOT_FOUND, 'Coach not found');

      const existingFav = await ClubFavourite.findOne({
        clubId: club._id,
        targetType: 'COACH',
        targetCoachId: targetId,
      });

      if (existingFav) {
        await ClubFavourite.deleteOne({ _id: existingFav._id });
        return { isFavourite: false, message: 'Coach removed from favourites' };
      } else {
        await ClubFavourite.create({
          clubId: club._id,
          targetType: 'COACH',
          targetCoachId: targetId,
        });
        return { isFavourite: true, message: 'Coach added to favourites' };
      }
    }
  }
}

export const clubScoutingService = new ClubScoutingService();
