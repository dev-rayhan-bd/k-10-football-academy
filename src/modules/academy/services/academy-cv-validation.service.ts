import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { Team, AcademyCoach } from '../academy.model';
import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { env } from '@/config/env';
import { academyResolverService } from './academy-resolver.service';

const notificationService = new NotificationService();

export class AcademyCvValidationService {
  async getAcademyValidateCvDashboard(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // 1. Gather all players of this academy without schema-breaking population
    const teamPlayerIds = await Team.find({ academyId: academy._id }).distinct('roster.playerId');
    const playerQueryFilter: any = {
      $or: [{ academyId: academy._id }, { _id: { $in: teamPlayerIds } }],
    };

    const allPlayers = await PlayerProfile.find(playerQueryFilter)
      .populate('userId', 'email name avatar')
      .lean();

    // 2. Resolve Academy Coaches & Verifying Coaches
    const academyCoaches = await AcademyCoach.find({
      academyId: academy._id,
      status: 'APPROVED',
    })
      .populate('coachId', 'fullName title profileImage')
      .lean();

    const verifyingCoachIds = allPlayers.map((p) => p.verifyingCoachId).filter(Boolean);

    const coachProfiles = await CoachProfile.find({
      $or: [{ _id: { $in: verifyingCoachIds } }, { userId: { $in: verifyingCoachIds } }],
    }).lean();

    const coachMap = new Map<string, any>();
    coachProfiles.forEach((c) => {
      coachMap.set(c._id.toString(), c);
      if (c.userId) coachMap.set(c.userId.toString(), c);
    });

    const defaultAcademyCoach = academyCoaches[0];
    const defaultCoachName = (defaultAcademyCoach?.coachId as any)?.fullName || '';
    const defaultCoachId = (defaultAcademyCoach?.coachId as any)?._id || null;

    // 3. Metrics Cards: Total, Gold, Silver, Bronze (Screenshot 4)
    let goldCount = 0;
    let silverCount = 0;
    let bronzeCount = 0;

    allPlayers.forEach((p) => {
      const rating = Number(p.overallRating) || 0;
      if (rating >= 80) {
        goldCount++;
      } else if (rating >= 60) {
        silverCount++;
      } else {
        bronzeCount++;
      }
    });

    const metrics = {
      totalPlayers: allPlayers.length,
      goldCvs: goldCount,
      silverCvs: silverCount,
      bronzeCvs: bronzeCount,
    };

    // 4. Search & Filter
    let filtered = allPlayers;

    // Search term
    if (query.searchTerm || query.search) {
      const term = String(query.searchTerm || query.search)
        .trim()
        .toLowerCase();
      filtered = filtered.filter((p) => {
        const name = (p.fullName || '').toLowerCase();
        const pos = (p.position || '').toLowerCase();
        const country = (p.country || '').toLowerCase();
        const verifyingCoach = p.verifyingCoachId
          ? coachMap.get(p.verifyingCoachId.toString())
          : null;
        const coach = (
          verifyingCoach?.fullName ||
          p.coachVerification?.coachName ||
          defaultCoachName
        ).toLowerCase();
        return (
          name.includes(term) ||
          pos.includes(term) ||
          country.includes(term) ||
          coach.includes(term)
        );
      });
    }

    // Tier filter (GOLD, SILVER, BRONZE)
    if (query.tier && String(query.tier).toUpperCase() !== 'ALL') {
      const targetTier = String(query.tier).toUpperCase();
      filtered = filtered.filter((p) => {
        const rating = Number(p.overallRating) || 0;
        const tier = rating >= 80 ? 'GOLD' : rating >= 60 ? 'SILVER' : 'BRONZE';
        return tier === targetTier;
      });
    }

    // Position filter
    if (query.position && String(query.position).toUpperCase() !== 'ALL') {
      const posFilter = String(query.position).toLowerCase();
      filtered = filtered.filter((p) => (p.position || '').toLowerCase().includes(posFilter));
    }

    // Validation filter (VERIFIED, PENDING)
    if (query.validation && String(query.validation).toUpperCase() !== 'ALL') {
      const valFilter = String(query.validation).toUpperCase();
      filtered = filtered.filter((p) => {
        const isVerified = Boolean(p.isVerifiedByCoach || p.coachVerification?.isVerified);
        const status = isVerified ? 'VERIFIED' : 'PENDING';
        return status === valFilter;
      });
    }

    // 5. Pagination
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    // Helper to determine player position type group
    const getTypeGroup = (position: string = ''): string => {
      const pos = position.toUpperCase();
      if (pos.includes('GOAL') || pos === 'GK') return 'Goalkeeper';
      if (
        pos.includes('DEF') ||
        pos === 'CB' ||
        pos === 'LB' ||
        pos === 'RB' ||
        pos === 'LWB' ||
        pos === 'RWB'
      )
        return 'Defender';
      if (
        pos.includes('MID') ||
        pos === 'CM' ||
        pos === 'CDM' ||
        pos === 'CAM' ||
        pos === 'LM' ||
        pos === 'RM'
      )
        return 'Midfielder';
      return 'Forward';
    };

    const playersList = paginated.map((p) => {
      const rating = Number(p.overallRating) || 0;
      const cvTier: 'GOLD' | 'SILVER' | 'BRONZE' =
        rating >= 80 ? 'GOLD' : rating >= 60 ? 'SILVER' : 'BRONZE';

      const isVerified = Boolean(p.isVerifiedByCoach || p.coachVerification?.isVerified);
      const validationStatus = isVerified ? 'VERIFIED' : 'PENDING';

      const verifyingCoach = p.verifyingCoachId
        ? coachMap.get(p.verifyingCoachId.toString())
        : null;

      const coachName =
        verifyingCoach?.fullName ||
        p.coachVerification?.coachName ||
        defaultCoachName ||
        'Unassigned';

      const coachId = verifyingCoach?._id || defaultCoachId || null;

      return {
        _id: p._id,
        player: {
          _id: p._id,
          name: p.fullName || '',
          country: (p.country || '').toUpperCase(),
          avatar: p.profileImage || (p.userId as any)?.avatar || '',
        },
        rating,
        cvTier,
        cvTierBadge: {
          label: cvTier,
          variant: cvTier.toLowerCase(),
        },
        type: getTypeGroup(p.position),
        position: p.position || '',
        validation: validationStatus,
        validationBadge: {
          label: validationStatus,
          variant: isVerified ? 'green' : 'yellow',
        },
        coach: coachName,
        assignedCoachId: coachId,
        cvUrl: `/players/${p._id}/cv`,
      };
    });

    return {
      metrics,
      players: playersList,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async notifyCoachForCvValidation(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const { playerId, coachId, message } = payload;
    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    let targetCoachUserId = null;
    let coachName = 'Coach';

    if (coachId) {
      // Find coach profile
      const coach = await CoachProfile.findOne({
        $or: [{ _id: coachId }, { userId: coachId }],
      });
      if (coach) {
        targetCoachUserId = coach.userId;
        coachName = coach.fullName;
      }
    }

    const pAny = player as any;
    if (!targetCoachUserId && (pAny.assignedCoachId || player.verifyingCoachId)) {
      const cId = pAny.assignedCoachId || player.verifyingCoachId;
      const coach = await CoachProfile.findOne({
        $or: [{ _id: cId }, { userId: cId }],
      });
      if (coach) {
        targetCoachUserId = coach.userId;
        coachName = coach.fullName;
      }
    }

    if (!targetCoachUserId) {
      const defaultAcademyCoach = await AcademyCoach.findOne({
        academyId: academy._id,
        status: 'APPROVED',
      });
      if (defaultAcademyCoach) {
        targetCoachUserId = defaultAcademyCoach.coachUserId || defaultAcademyCoach.coachId;
        const coachProfile = await CoachProfile.findOne({
          $or: [{ _id: defaultAcademyCoach.coachId }, { userId: defaultAcademyCoach.coachUserId }],
        });
        coachName = coachProfile?.fullName || 'Coach';
      }
    }

    if (targetCoachUserId) {
      await notificationService.createNotification({
        recipientId: targetCoachUserId,
        recipientRole: 'COACH',
        type: 'CV_VALIDATION_REQUEST',
        title: 'Player CV Validation Request',
        message:
          message ||
          `Academy "${academy.name}" has requested you to review and validate the CV of player ${player.fullName}.`,
        data: {
          playerId: player._id,
          academyId: academy._id,
          actionUrl: '/coach/player-cv-validations',
        },
      });
    }

    return {
      message: `Notification sent successfully to ${coachName} to validate ${player.fullName}'s CV`,
      coachName,
      playerId: player._id,
    };
  }

  async getCvsLibrary(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);
    const baseUrl = (env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

    const tab = (query.tab || 'ALL').toUpperCase();
    const position = query.position ? String(query.position).toUpperCase() : null;
    const country = query.country ? String(query.country).trim() : null;
    const minAge = query.minAge ? Number(query.minAge) : null;
    const maxAge = query.maxAge ? Number(query.maxAge) : null;
    const statusFilter = query.status ? String(query.status).toUpperCase() : null;
    const searchTerm = query.searchTerm ? String(query.searchTerm).trim() : null;

    // Only consider shared and liked entries for players that actually exist in DB
    const realSharedPlayerIds = (academy.sharedPlayerProfiles || [])
      .map((s: any) => s.playerId)
      .filter((id: any) => id && Types.ObjectId.isValid(id));
    const existingSharedPlayers =
      realSharedPlayerIds.length > 0
        ? await PlayerProfile.find({ _id: { $in: realSharedPlayerIds } })
            .select('_id')
            .lean()
        : [];
    const existingSharedIdSet = new Set(existingSharedPlayers.map((p) => p._id.toString()));
    const validSharedProfiles = (academy.sharedPlayerProfiles || []).filter(
      (s: any) => s.playerId && existingSharedIdSet.has(s.playerId.toString()),
    );

    // Auto-clean any stale or non-existent test IDs from academy document
    if (validSharedProfiles.length !== (academy.sharedPlayerProfiles || []).length) {
      academy.sharedPlayerProfiles = validSharedProfiles;
      await academy.save();
    }

    const realLikedPlayerIds = (academy.likedPlayerIds || []).filter(
      (id: any) => id && Types.ObjectId.isValid(id),
    );
    const existingLikedPlayers =
      realLikedPlayerIds.length > 0
        ? await PlayerProfile.find({ _id: { $in: realLikedPlayerIds } })
            .select('_id')
            .lean()
        : [];
    const likedSet = new Set(existingLikedPlayers.map((p) => p._id.toString()));

    if (likedSet.size !== (academy.likedPlayerIds || []).length) {
      academy.likedPlayerIds = Array.from(likedSet).map((id) => new Types.ObjectId(id));
      await academy.save();
    }

    const sharedMap = new Map<string, number>();
    validSharedProfiles.forEach((s: any) => {
      if (s.playerId) sharedMap.set(s.playerId.toString(), s.shareCount || 1);
    });

    const playerQuery: any = {};
    if (tab === 'LIKED') {
      playerQuery._id = { $in: Array.from(likedSet).map((id) => new Types.ObjectId(id)) };
    } else if (tab === 'SHARED') {
      playerQuery._id = { $in: Array.from(sharedMap.keys()).map((id) => new Types.ObjectId(id)) };
    }

    if (position && position !== 'ALL' && position !== 'ALL POSITIONS') {
      playerQuery.position = new RegExp(position, 'i');
    }
    if (country && country !== 'ALL' && country !== 'ALL COUNTRIES') {
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

    const playersRaw = await PlayerProfile.find(playerQuery)
      .select('_id fullName avatar position currentClub country dateOfBirth age overallRating')
      .sort({ overallRating: -1, createdAt: -1 })
      .lean();

    let processedPlayers = playersRaw.map((p: any) => {
      let age = 18;
      if (p.dateOfBirth) {
        const diffMs = Date.now() - new Date(p.dateOfBirth).getTime();
        age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
      } else if (typeof p.age === 'number') {
        age = p.age;
      }

      const rating = Number(p.overallRating || 85);
      const tier: 'GOLD' | 'SILVER' | 'BRONZE' =
        rating >= 90 ? 'GOLD' : rating >= 75 ? 'SILVER' : 'BRONZE';
      const pid = p._id.toString();

      return {
        id: p._id,
        playerId: p._id,
        name: p.fullName || 'Athlete',
        position: (p.position || 'FORWARD').toUpperCase(),
        avatar: p.avatar || null,
        rating: (rating / 10).toFixed(1),
        rawRating: rating,
        club: p.currentClub || academy.name || 'Academy Athlete',
        country: p.country || 'Brazil',
        age,
        status: tier,
        isLiked: likedSet.has(pid),
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

    const totalLikedCount = likedSet.size;
    const totalSharedCount = validSharedProfiles.reduce(
      (sum: number, s: any) => sum + (s.shareCount || 1),
      0,
    );
    const allCvsCount = await PlayerProfile.countDocuments({});

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

  async toggleLikePlayerCv(user: any, playerId: string, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);
    if (!playerId || !Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player profile not found');
    }

    const pId = new Types.ObjectId(playerId);
    const existingIndex = (academy.likedPlayerIds || []).findIndex(
      (id: any) => id.toString() === playerId,
    );

    let isLiked: boolean;
    if (existingIndex > -1 && academy.likedPlayerIds) {
      academy.likedPlayerIds.splice(existingIndex, 1);
      isLiked = false;
    } else {
      academy.likedPlayerIds = academy.likedPlayerIds || [];
      academy.likedPlayerIds.push(pId);
      isLiked = true;
    }

    await academy.save();

    return {
      playerId,
      playerName: player.fullName,
      isLiked,
      likedCount: academy.likedPlayerIds ? academy.likedPlayerIds.length : 0,
      message: isLiked
        ? `${player.fullName} added to Liked CVs`
        : `${player.fullName} removed from Liked CVs`,
    };
  }

  async sharePlayerCv(user: any, playerId: string, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);
    if (!playerId || !Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player profile not found');
    }

    const baseShareUrl = (
      env.PUBLIC_SHARE_URL ||
      `${(env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}/players/share`
    ).replace(/\/$/, '');
    const shareableUrl = `${baseShareUrl}/${player._id}`;

    academy.sharedPlayerProfiles = academy.sharedPlayerProfiles || [];
    const existing = academy.sharedPlayerProfiles.find(
      (s: any) => s.playerId && s.playerId.toString() === playerId,
    );

    if (existing) {
      existing.shareCount = (existing.shareCount || 1) + 1;
      existing.sharedAt = new Date();
    } else {
      academy.sharedPlayerProfiles.push({
        playerId: new Types.ObjectId(playerId),
        sharedAt: new Date(),
        shareCount: 1,
      });
    }

    await academy.save();

    const totalSharedCount = academy.sharedPlayerProfiles.reduce(
      (sum: number, s: any) => sum + (s.shareCount || 1),
      0,
    );

    return {
      playerId: player._id.toString(),
      playerName: player.fullName,
      shareableUrl,
      sharedCount: totalSharedCount,
      uniqueSharedProfiles: academy.sharedPlayerProfiles.length,
      message: 'Share link generated and tracked successfully',
    };
  }

  async getPublicPlayerCv(playerId: string) {
    if (!Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }

    const player = await PlayerProfile.findById(playerId)
      .populate('userId', 'name email avatar phone')
      .populate('academyId', 'name logo location category contactPhone contactEmail')
      .lean();

    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player profile not found');
    }

    const rating = Number((player as any).overallRating || 85);
    const tier = rating >= 90 ? 'GOLD' : rating >= 75 ? 'SILVER' : 'BRONZE';

    let age = 18;
    if (player.dateOfBirth) {
      const diffMs = Date.now() - new Date(player.dateOfBirth).getTime();
      age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
    } else if (typeof player.age === 'number') {
      age = player.age;
    }

    const matchRecords = await MatchRecord.find({ playerId: player._id })
      .sort({ matchDate: -1 })
      .limit(5)
      .lean();

    return {
      id: player._id,
      name: player.fullName,
      position: player.position,
      age,
      country: player.country,
      rating: (rating / 10).toFixed(1),
      tier,
      avatar:
        (player as any).avatar ||
        (player as any).profileImage ||
        (player.userId as any)?.avatar ||
        null,
      currentClub: player.currentClub || (player.academyId as any)?.name || 'Football Academy',
      academy: player.academyId
        ? {
            id: (player.academyId as any)._id,
            name: (player.academyId as any).name,
            logo: (player.academyId as any).logo,
            location: (player.academyId as any).location,
            contactEmail: (player.academyId as any).contactEmail,
            contactPhone: (player.academyId as any).contactPhone,
          }
        : null,
      matchRecords: matchRecords.map((m: any) => ({
        matchName: m.matchName,
        matchDate: m.matchDate,
        goals: m.goals || 0,
        assists: m.assists || 0,
        result: m.matchResult || 'W',
      })),
      isPublic: true,
    };
  }
}

export const academyCvValidationService = new AcademyCvValidationService();
