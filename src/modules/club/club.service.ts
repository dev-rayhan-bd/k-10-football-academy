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
    const establishedYear = p.establishedYear || 1878;
    const contactPhone = p.contactPhone || user.phone || '+55 11 9999-8888';
    const contactEmail = p.contactEmail || user.email || 'liverpool.fc@gmail.com';
    const country = p.country || 'Brazil';
    const league = p.league || 'Premier League';
    const clubName = p.name || user.name || 'Liverpool FC';
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
      dateOfEstablishment: String(establishedYear),
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
        category: p.clubType || 'Premium Club',
        status: 'ACTIVE CLUB',
        tier: 'ACTIVE CLUB',
        subInfo: `${p.clubType || 'Premium Club'} • Est. ${establishedYear} • ${country}`,
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
        name: user.name || 'Liverpool FC',
        clubType: 'Premium Club',
        establishedYear: 1878,
        country: 'Brazil',
        league: 'Premier League',
        contactPhone: user.phone || '+55 11 9999-8888',
        contactEmail: user.email || 'liverpool.fc@gmail.com',
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
        name: user.name || 'Liverpool FC',
        clubType: 'Premium Club',
        establishedYear: 1878,
        country: 'Brazil',
        league: 'Premier League',
        contactPhone: user.phone || '+55 11 9999-8888',
        contactEmail: user.email || 'liverpool.fc@gmail.com',
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
        name: payload.clubName || payload.name || user.name || 'Liverpool FC',
        clubType: payload.clubType || 'Premium Club',
        establishedYear: 1878,
        country: payload.clubCountry || payload.country || 'Brazil',
        league: payload.clubLeague || payload.league || 'Premier League',
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
      let age = 18;
      if (p.dateOfBirth) {
        const diffMs = Date.now() - new Date(p.dateOfBirth).getTime();
        age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
      } else if (typeof p.age === 'number') {
        age = p.age;
      }

      const rating = Number(p.overallRating || 75);
      const tier: 'GOLD' | 'SILVER' | 'BRONZE' =
        p.cvTier || (rating >= 90 ? 'GOLD' : rating >= 75 ? 'SILVER' : 'BRONZE');
      const pid = p._id.toString();

      return {
        id: p._id,
        playerId: p._id,
        name: p.fullName || 'Athlete',
        position: (p.position || 'FORWARD').toUpperCase(),
        avatar: p.profileImage || p.avatar || null,
        rating: (rating / 10).toFixed(1),
        rawRating: rating,
        club: p.currentClub || p.academy || 'Manchester Academy',
        country: p.country || 'Brazil',
        age,
        status: tier,
        isFavourite: favPlayerIdSet.has(pid),
      };
    });

    if (minAge !== null) processedPlayers = processedPlayers.filter((p) => p.age >= minAge);
    if (maxAge !== null) processedPlayers = processedPlayers.filter((p) => p.age <= maxAge);
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
      const yrs = c.yearsExperience || 1;
      let status = c.status || 'AVAILABLE';
      if (status === 'ACTIVE') status = 'AVAILABLE';
      return {
        id: c._id,
        coachId: c._id,
        name: c.fullName || 'Coach',
        role: (c.title || c.academyRole || 'HEAD COACH').toUpperCase(),
        speciality: c.speciality || 'Attacking',
        club: c.currentClub || 'Santos FC',
        country: c.birthCountry || c.location || 'Brazil',
        experience: `${yrs} yrs`,
        yearsExperience: yrs,
        status,
        avatar: c.profileImage || null,
        isFavourite: favCoachIdSet.has(cid),
      };
    });

    return {
      players: processedPlayers,
      coaches: processedCoaches,
    };
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
      let age = 18;
      if (p.dateOfBirth) {
        const diffMs = Date.now() - new Date(p.dateOfBirth).getTime();
        age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
      } else if (typeof p.age === 'number') {
        age = p.age;
      }

      const rating = Number(p.overallRating || 75);
      const tier: 'GOLD' | 'SILVER' | 'BRONZE' =
        p.cvTier || (rating >= 90 ? 'GOLD' : rating >= 75 ? 'SILVER' : 'BRONZE');
      const pid = p._id.toString();

      return {
        id: p._id,
        playerId: p._id,
        name: p.fullName || 'Athlete',
        position: (p.position || 'FORWARD').toUpperCase(),
        avatar: p.profileImage || p.avatar || null,
        rating: (rating / 10).toFixed(1),
        rawRating: rating,
        club: p.currentClub || p.academy || 'Manchester Academy',
        country: p.country || 'Brazil',
        age,
        status: tier,
        isLiked: favPlayerIdSet.has(pid),
        shareCount: sharedMap.get(pid) || 0,
        shareableUrl: `${baseUrl}/players/share/${pid}`,
      };
    });

    if (minAge !== null) processedPlayers = processedPlayers.filter((p) => p.age >= minAge);
    if (maxAge !== null) processedPlayers = processedPlayers.filter((p) => p.age <= maxAge);
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
      shareableUrl: `${baseUrl}/players/share/${playerId}`,
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
      status: payload.status || 'PENDING',
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
