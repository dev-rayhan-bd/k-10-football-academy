import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { env } from '@/config/env';
import { User } from '@/modules/user/user.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { IClubProfile, IClubAchievement, IClubFavourite } from './club.interface';
import { ClubProfile, ClubAchievement, ClubFavourite, ClubSuccessStory } from './club.model';

export class ClubService {
  formatClubProfileResponse(profile: any, fallbackUser?: any) {
    const p = profile.toObject ? profile.toObject() : profile;
    const user = p.userId && typeof p.userId === 'object' ? p.userId : fallbackUser || {};
    const establishedYear = p.establishedYear || null;
    const contactPhone = p.contactPhone || user.phone || '';
    const contactEmail = p.contactEmail || user.email || '';
    const country = p.country || '';
    const league = p.league || '';
    const clubName = p.name || user.name || '';
    const achievements = Array.isArray(p.achievements) ? p.achievements : [];

    return {
      ...p,
      id: p._id,
      name: clubName,
      clubName,
      country,
      clubCountry: country,
      league,
      clubLeague: league,
      establishedYear,
      dateOfEstablishment: establishedYear ? String(establishedYear) : '',
      contact: contactPhone,
      contactPhone,
      email: contactEmail,
      contactEmail,
      tier: 'ACTIVE CLUB',
      activeStatus: 'ACTIVE CLUB',
      achievements,
      bannerInfo: {
        name: clubName,
        clubName,
        logo: p.logo || user.avatar || null,
        coverPhoto: p.coverPhoto || null,
        category: p.clubType || 'Club',
        status: 'ACTIVE CLUB',
        tier: 'ACTIVE CLUB',
        subInfo: `${p.clubType || 'Club'}${establishedYear ? ` • Est. ${establishedYear}` : ''}${country ? ` • ${country}` : ''}`,
        country,
        foundedYear: establishedYear,
        contact: contactPhone,
        email: contactEmail,
      },
      aboutClub: {
        description: p.description || '',
        visionAndMission: p.visionAndMission || '',
      },
    };
  }

  async resolveClub(userId: string) {
    let profile = await ClubProfile.findOne({ userId });
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
      profile = await ClubProfile.create({
        userId: user._id,
        name: user.name || '',
        clubType: 'Club',
        establishedYear: new Date().getFullYear(),
        country: '',
        league: '',
        contactPhone: user.phone || '',
        contactEmail: user.email || '',
      });
    }
    return profile;
  }

  async getMyClubProfile(userId: string) {
    let profile = await ClubProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
      profile = await ClubProfile.create({
        userId: user._id,
        name: user.name || '',
        clubType: 'Club',
        establishedYear: new Date().getFullYear(),
        country: '',
        league: '',
        contactPhone: user.phone || '',
        contactEmail: user.email || '',
      });
      profile = await ClubProfile.findById(profile._id).populate(
        'userId',
        'name email avatar phone',
      );
    }
    return this.formatClubProfileResponse(profile);
  }

  async updateMyClubProfile(userId: string, payload: any) {
    let profile = await ClubProfile.findOne({ userId });
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
      profile = await ClubProfile.create({
        userId: user._id,
        name: payload.clubName || payload.name || user.name || '',
        clubType: payload.clubType || 'Club',
        establishedYear: new Date().getFullYear(),
        country: payload.clubCountry || payload.country || '',
        league: payload.clubLeague || payload.league || '',
      });
    }

    if (payload.clubName || payload.name) {
      profile.name = payload.clubName || payload.name;
    }
    if (payload.clubCountry || payload.country) {
      profile.country = payload.clubCountry || payload.country;
    }
    if (payload.clubLeague || payload.league) {
      profile.league = payload.clubLeague || payload.league;
    }
    if (payload.clubType) {
      profile.clubType = payload.clubType;
    }
    if (payload.establishedYear || payload.dateOfEstablishment) {
      const yr = Number(payload.establishedYear || payload.dateOfEstablishment);
      if (!isNaN(yr) && yr > 1800) {
        profile.establishedYear = yr;
      }
    }
    if (payload.contact || payload.contactPhone || payload.phone) {
      profile.contactPhone = payload.contact || payload.contactPhone || payload.phone;
    }
    if (payload.email || payload.contactEmail) {
      profile.contactEmail = payload.email || payload.contactEmail;
    }
    if (payload.coverPhoto || payload.coverImage) {
      profile.coverPhoto = payload.coverPhoto || payload.coverImage;
    }
    if (payload.logo || payload.avatar) {
      profile.logo = payload.logo || payload.avatar;
    }
    if (payload.description !== undefined) {
      profile.description = payload.description;
    }
    if (payload.visionAndMission !== undefined || payload.visionMission !== undefined) {
      profile.visionAndMission = payload.visionAndMission ?? payload.visionMission;
    }
    if (payload.achievements !== undefined) {
      if (typeof payload.achievements === 'string') {
        try {
          profile.achievements = JSON.parse(payload.achievements);
        } catch {
          // ignore
        }
      } else if (Array.isArray(payload.achievements)) {
        profile.achievements = payload.achievements;
      }
    }

    await profile.save();

    const updated = await ClubProfile.findById(profile._id).populate(
      'userId',
      'name email avatar phone',
    );
    return this.formatClubProfileResponse(updated);
  }

  // ==========================================
  // SCOUTING BOARD (SCREENSHOTS 1 & 2)
  // ==========================================
  async getScoutingBoard(userId: string, query: any = {}) {
    const club = await this.resolveClub(userId);
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

  async shareScoutingProfile(
    userId: string,
    payload: { targetType: 'PLAYER' | 'COACH'; targetId: string },
  ) {
    const club = await this.resolveClub(userId);
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
    const club = await this.resolveClub(userId);
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

  // ==========================================
  // CVS LIBRARY (SCREENSHOT 3)
  // ==========================================
  async getClubCvsLibrary(userId: string, query: any = {}) {
    const club = await this.resolveClub(userId);
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

    const playerQuery: any = {};
    if (tab === 'LIKED') {
      playerQuery._id = { $in: Array.from(favPlayerIdSet).map((id) => new Types.ObjectId(id)) };
    } else if (tab === 'SHARED') {
      playerQuery._id = { $in: Array.from(sharedMap.keys()).map((id) => new Types.ObjectId(id)) };
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
        shareCount: sharedMap.get(pid) || 0,
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
    const club = await this.resolveClub(userId);
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
    const club = await this.resolveClub(userId);
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

    const totalProfilesShared = profiles.reduce((sum, s) => sum + (s.shareCount || 1), 0);

    return {
      shareableUrl: `${playerShareBase}/${playerId}`,
      shareCount: updatedShareCount,
      totalProfilesShared,
      message: 'Profile shared successfully',
    };
  }

  // ==========================================
  // SUCCESS STORIES (SCREENSHOTS 4 & 5)
  // ==========================================
  async getClubSuccessStories(userId: string, query: any = {}) {
    const club = await this.resolveClub(userId);
    const filter: any = { clubId: club._id, isDeleted: false };
    if (query.status && query.status !== 'ALL') {
      filter.status = String(query.status).toUpperCase();
    }
    if (query.category && query.category !== 'ALL') {
      filter.category = new RegExp(String(query.category).trim(), 'i');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));

    const total = await ClubSuccessStory.countDocuments(filter);
    const stories = await ClubSuccessStory.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data: stories.map((s) => ({
        id: s._id,
        _id: s._id,
        storyTitle: s.storyTitle,
        category: s.category,
        date: s.date,
        formattedDate: s.formattedDate || new Date(s.date).toISOString().split('T')[0],
        coverImage: s.coverImage || s.photo || '',
        photo: s.photo || s.coverImage || '',
        status: s.status,
        createdAt: s.createdAt,
      })),
    };
  }

  async createClubSuccessStory(userId: string, payload: any) {
    const club = await this.resolveClub(userId);
    const storyTitle = payload.storyTitle || payload.title;
    const category = payload.category;
    if (!storyTitle) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Story title is required');
    }
    if (!category) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Category is required');
    }

    const story = await ClubSuccessStory.create({
      clubId: club._id,
      storyTitle,
      category,
      date: payload.date ? new Date(payload.date) : new Date(),
      coverImage: payload.coverImage || payload.photo || '',
      photo: payload.photo || payload.coverImage || '',
      status: payload.status || 'APPROVED',
    });

    return {
      id: story._id,
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      date: story.date,
      formattedDate: story.formattedDate,
      coverImage: story.coverImage,
      photo: story.photo,
      status: story.status,
      createdAt: story.createdAt,
    };
  }

  async updateClubSuccessStory(userId: string, storyId: string, payload: any) {
    const club = await this.resolveClub(userId);
    const story = await ClubSuccessStory.findOne({
      _id: storyId,
      clubId: club._id,
      isDeleted: false,
    });
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    if (payload.storyTitle || payload.title) {
      story.storyTitle = payload.storyTitle || payload.title;
    }
    if (payload.category) {
      story.category = payload.category;
    }
    if (payload.date) {
      story.date = new Date(payload.date);
    }
    if (payload.coverImage || payload.photo) {
      story.coverImage = payload.coverImage || payload.photo;
      story.photo = payload.photo || payload.coverImage;
    }
    if (payload.status) {
      story.status = payload.status;
    }

    await story.save();

    return {
      id: story._id,
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      date: story.date,
      formattedDate: story.formattedDate,
      coverImage: story.coverImage,
      photo: story.photo,
      status: story.status,
      createdAt: story.createdAt,
    };
  }

  async deleteClubSuccessStory(userId: string, storyId: string) {
    const club = await this.resolveClub(userId);
    const story = await ClubSuccessStory.findOne({
      _id: storyId,
      clubId: club._id,
      isDeleted: false,
    });
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    story.isDeleted = true;
    story.deletedAt = new Date();
    await story.save();

    return { message: 'Success story deleted successfully' };
  }

  // ==========================================
  // CLUB ANALYTICS (SCREENSHOTS 2 & 3)
  // ==========================================
  async getClubAnalytics(userId: string, query: any = {}) {
    const club = await this.resolveClub(userId);

    const position = query.position ? String(query.position).toUpperCase() : null;
    const country = query.country ? String(query.country).trim() : null;
    const minAge = query.minAge ? Number(query.minAge) : null;
    const maxAge = query.maxAge ? Number(query.maxAge) : null;
    const statusFilter = query.status ? String(query.status).toUpperCase() : null;
    const searchTerm = query.searchTerm ? String(query.searchTerm).trim() : null;

    // 1. Metric counts
    const viewedProfiles = club.viewedPlayerProfiles || [];
    // Enterprise standard: PLAYERS PROFILE VIEWED represents unique player profiles reviewed by this club
    const playersProfileViewedCount = viewedProfiles.length;
    const totalLikedCount = await ClubFavourite.countDocuments({
      clubId: club._id,
      targetType: 'PLAYER',
    });
    const sharedProfiles = club.sharedPlayerProfiles || [];
    const totalSharedCount = sharedProfiles.reduce((sum, s) => sum + (s.shareCount || 1), 0);
    const profileViewsCount = club.profileViews || 0;

    // Maps for fast lookup
    const viewsMap = new Map<string, number>();
    viewedProfiles.forEach((v: any) => {
      if (v.playerId) viewsMap.set(v.playerId.toString(), v.viewCount || 1);
    });

    const sharesMap = new Map<string, number>();
    sharedProfiles.forEach((s: any) => {
      if (s.playerId) sharesMap.set(s.playerId.toString(), s.shareCount || 1);
    });

    const likedFavs = await ClubFavourite.find({
      clubId: club._id,
      targetType: 'PLAYER',
    }).select('targetPlayerId');
    const likedSet = new Set(likedFavs.map((f) => f.targetPlayerId?.toString()).filter(Boolean));

    const engagedPlayerIdList = Array.from(
      new Set([
        ...Array.from(viewsMap.keys()),
        ...Array.from(likedSet),
        ...Array.from(sharesMap.keys()),
      ]),
    ).filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id));

    // 2. Query Players for Top Players Engaged Table (Only players this club engaged with)
    const playerQuery: any = {
      _id: { $in: engagedPlayerIdList },
    };
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

    const rawPlayers =
      engagedPlayerIdList.length > 0
        ? await PlayerProfile.find(playerQuery)
            .select(
              '_id fullName avatar profileImage position currentClub academy country dateOfBirth age overallRating cvTier profileViews totalLikes',
            )
            .sort({ overallRating: -1, createdAt: -1 })
            .lean()
        : [];

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

      const views = viewsMap.get(pid) || 0;
      const likes = likedSet.has(pid) ? 1 : 0;
      const shares = sharesMap.get(pid) || 0;

      return {
        id: p._id,
        playerId: p._id,
        name: p.fullName || '',
        position: (p.position || '').toUpperCase(),
        avatar: p.profileImage || p.avatar || null,
        rating: (rating / 10).toFixed(1),
        rawRating: rating,
        age,
        country: p.country || '',
        club: p.currentClub || p.academy || '',
        status: tier,
        views,
        likes,
        shares,
      };
    });

    if (minAge !== null)
      processedPlayers = processedPlayers.filter((p) => (p.age !== null ? p.age >= minAge : false));
    if (maxAge !== null)
      processedPlayers = processedPlayers.filter((p) => (p.age !== null ? p.age <= maxAge : false));
    if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'ALL STATUS') {
      processedPlayers = processedPlayers.filter((p) => p.status === statusFilter);
    }

    // Sort by engagement (views + likes + shares)
    processedPlayers.sort((a, b) => b.views + b.likes + b.shares - (a.views + a.likes + a.shares));

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const total = processedPlayers.length;
    const paginated = processedPlayers.slice((page - 1) * limit, page * limit);

    // 3. Position Interest Distribution
    const posCounts: Record<string, number> = {
      Midfielder: 0,
      Striker: 0,
      Defender: 0,
      Goalkeeper: 0,
      Winger: 0,
    };

    rawPlayers.forEach((p: any) => {
      const pos = (p.position || '').toUpperCase();
      if (pos.includes('MID')) posCounts.Midfielder++;
      else if (pos.includes('STRIK') || pos.includes('FORWARD')) posCounts.Striker++;
      else if (pos.includes('DEFEND') || pos.includes('BACK')) posCounts.Defender++;
      else if (pos.includes('GOAL') || pos.includes('GK')) posCounts.Goalkeeper++;
      else if (pos.includes('WING')) posCounts.Winger++;
      else posCounts.Midfielder++;
    });

    const totalPos = Object.values(posCounts).reduce((a, b) => a + b, 0);
    const positionInterestDistribution = [
      {
        position: 'Midfielder',
        value: posCounts.Midfielder,
        percentage: totalPos > 0 ? Math.round((posCounts.Midfielder / totalPos) * 100) : 0,
      },
      {
        position: 'Striker',
        value: posCounts.Striker,
        percentage: totalPos > 0 ? Math.round((posCounts.Striker / totalPos) * 100) : 0,
      },
      {
        position: 'Defender',
        value: posCounts.Defender,
        percentage: totalPos > 0 ? Math.round((posCounts.Defender / totalPos) * 100) : 0,
      },
      {
        position: 'Goalkeeper',
        value: posCounts.Goalkeeper,
        percentage: totalPos > 0 ? Math.round((posCounts.Goalkeeper / totalPos) * 100) : 0,
      },
      {
        position: 'Winger',
        value: posCounts.Winger,
        percentage: totalPos > 0 ? Math.round((posCounts.Winger / totalPos) * 100) : 0,
      },
    ];

    // 4. Real Players & Coaches Monitored Chart Trend (Grouped bi-monthly for the selected year)
    const selectedYear = query.year ? Number(query.year) : new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0));
    const endOfYear = new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59, 999));

    const favsThisYear = await ClubFavourite.find({
      clubId: club._id,
      createdAt: { $gte: startOfYear, $lte: endOfYear },
    }).select('targetType createdAt');

    const playersAndCoachesMonitored = [
      { period: 'Jan-Feb', players: 0, coaches: 0 },
      { period: 'Mar-Apr', players: 0, coaches: 0 },
      { period: 'May-Jun', players: 0, coaches: 0 },
      { period: 'Jul-Aug', players: 0, coaches: 0 },
      { period: 'Sept-Oct', players: 0, coaches: 0 },
      { period: 'Nov-Dec', players: 0, coaches: 0 },
    ];

    favsThisYear.forEach((fav: any) => {
      const m = new Date(fav.createdAt).getUTCMonth();
      const bucketIdx = Math.floor(m / 2);
      if (bucketIdx >= 0 && bucketIdx < 6) {
        if (fav.targetType === 'PLAYER') {
          playersAndCoachesMonitored[bucketIdx].players++;
        } else if (fav.targetType === 'COACH') {
          playersAndCoachesMonitored[bucketIdx].coaches++;
        }
      }
    });

    return {
      selectedYear,
      metrics: {
        playersProfileViewed: {
          label: 'PLAYERS PROFILE VIEWED',
          count: playersProfileViewedCount,
        },
        likedCvs: { label: 'LIKED CVS', count: totalLikedCount },
        sharedProfiles: { label: 'SHARED PROFILES', count: totalSharedCount },
        profileViews: { label: 'PROFILE VIEWS', count: profileViewsCount },
      },
      playersAndCoachesMonitored,
      positionInterestDistribution,
      topPlayersEngaged: {
        data: paginated,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    };
  }

  async recordPlayerView(userId: string, playerId: string) {
    const club = await this.resolveClub(userId);
    if (!playerId || !Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    const views = club.viewedPlayerProfiles || [];
    const existingIndex = views.findIndex((v) => v.playerId?.toString() === playerId);

    // Enterprise session deduplication: 1-hour cooldown window for repeated clicks/refreshes
    const COOLDOWN_MS = 60 * 60 * 1000;
    const now = new Date();
    let isNewSessionView: boolean;
    let updatedCount: number;

    if (existingIndex > -1) {
      const lastViewedAt = views[existingIndex].viewedAt
        ? new Date(views[existingIndex].viewedAt).getTime()
        : 0;
      const elapsed = now.getTime() - lastViewedAt;

      if (elapsed >= COOLDOWN_MS) {
        // Cooldown passed: record new view session
        views[existingIndex].viewCount = (views[existingIndex].viewCount || 1) + 1;
        views[existingIndex].viewedAt = now;
        isNewSessionView = true;
      } else {
        // Inside cooldown window: duplicate click ignored
        isNewSessionView = false;
      }
      updatedCount = views[existingIndex].viewCount || 1;
    } else {
      // First time viewing this player profile
      views.push({
        playerId: new Types.ObjectId(playerId),
        viewedAt: now,
        viewCount: 1,
      });
      isNewSessionView = true;
      updatedCount = 1;
    }

    if (isNewSessionView) {
      club.viewedPlayerProfiles = views;
      await club.save();

      // Synchronize with Player Profile views & interested clubs
      await PlayerProfile.updateOne(
        { _id: playerId },
        {
          $inc: { profileViews: 1 },
          $addToSet: {
            clubsInterested: {
              clubName: club.name,
              logoUrl: club.logo || '',
              viewedAt: now,
            },
          },
        },
      );
    }

    return {
      playerId,
      viewsCount: updatedCount,
      uniqueProfilesViewed: views.length,
      isNewSessionView,
      message: isNewSessionView
        ? 'Player view recorded successfully'
        : 'View acknowledged (duplicate ignored within cooldown window)',
    };
  }

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
    return this.formatClubProfileResponse(profile);
  }

  async getAllProfiles(filter: Record<string, unknown> = {}) {
    return ClubProfile.find(filter).populate('userId', 'name email avatar');
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
