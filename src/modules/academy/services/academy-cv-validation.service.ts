import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { Team, AcademyCoach, AcademyProfile } from '../academy.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { env } from '@/config/env';
import { academyResolverService } from './academy-resolver.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';

const notificationService = new NotificationService();

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

    // 3. Metrics Cards: Total, Gold, Silver, Bronze
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
        const isVerified = Boolean(p.isVerifiedByCoach || p.coachVerification?.isVerified);
        const rating = Number(p.overallRating) || 0;
        const tier = isVerified
          ? (p.cvTier as any) || (rating >= 81 ? 'GOLD' : rating >= 71 ? 'SILVER' : 'BRONZE')
          : 'BRONZE';
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
      const isVerified = Boolean(p.isVerifiedByCoach || p.coachVerification?.isVerified);
      const validationStatus = isVerified ? 'VERIFIED' : 'PENDING';
      const rating = Number(p.overallRating) || 0;
      const cvTier: 'GOLD' | 'SILVER' | 'BRONZE' = (p.cvTier as any) || 'BRONZE';

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

  // ==========================================
  // CVS LIBRARY (academy browses all player CVs, likes and shares them)
  // ==========================================
  private shareUrlFor(playerId: string) {
    const base = (
      env.PUBLIC_SHARE_URL ||
      `${(env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}/players/share`
    ).replace(/\/$/, '');
    return `${base}/${playerId}`;
  }

  private ageFromProfile(p: any): number | null {
    if (p.dateOfBirth) {
      const dob = new Date(p.dateOfBirth);
      if (!Number.isNaN(dob.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        return age;
      }
    }
    return typeof p.age === 'number' ? p.age : null;
  }

  private async getOwnAcademy(user: any) {
    const academy = await AcademyProfile.findOne({ userId: user?.userId });
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found for this account');
    }
    return academy;
  }

  private async assertPlayerExists(playerId: string) {
    if (!playerId || !Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }
    const player = await PlayerProfile.findById(playerId).select('_id fullName userId');
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player profile not found');
    }
    return player;
  }

  async getCvsLibrary(user: any, query: any = {}) {
    const academy = await this.getOwnAcademy(user);
    const q: Record<string, unknown> = { ...query };

    // Liked / shared ids, ignoring entries whose player no longer exists (read-only, no writes)
    const likedIds = (academy.likedPlayerIds || [])
      .map((id: any) => String(id))
      .filter((id: string) => Types.ObjectId.isValid(id));
    const sharedEntries = (academy.sharedPlayerProfiles || []).filter(
      (s: any) => s.playerId && Types.ObjectId.isValid(String(s.playerId)),
    );
    const referencedIds = [
      ...new Set([...likedIds, ...sharedEntries.map((s: any) => String(s.playerId))]),
    ];
    const existingIdSet = new Set(
      (
        await PlayerProfile.find({ _id: { $in: referencedIds } })
          .select('_id')
          .lean()
      ).map((p: any) => String(p._id)),
    );
    const likedSet = new Set(likedIds.filter((id: string) => existingIdSet.has(id)));
    const sharedMap = new Map<string, number>();
    for (const s of sharedEntries) {
      const id = String(s.playerId);
      if (existingIdSet.has(id)) sharedMap.set(id, s.shareCount || 1);
    }

    // ---- filters → baseFilter (custom params are removed from q before QueryBuilder.filter())
    const and: Record<string, any>[] = [];

    const tab = String(q.tab || 'ALL').toUpperCase();
    if (!['ALL', 'LIKED', 'SHARED'].includes(tab)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid tab. Use ALL, LIKED or SHARED');
    }
    if (tab === 'LIKED') {
      and.push({ _id: { $in: [...likedSet].map((id) => new Types.ObjectId(id)) } });
    } else if (tab === 'SHARED') {
      and.push({ _id: { $in: [...sharedMap.keys()].map((id) => new Types.ObjectId(id)) } });
    }

    const position = String(q.position || '').trim();
    if (position && !['ALL', 'ALL POSITIONS'].includes(position.toUpperCase())) {
      and.push({ position: { $regex: `^${escapeRegex(position)}$`, $options: 'i' } });
    }
    const country = String(q.country || '').trim();
    if (country && !['ALL', 'ALL COUNTRIES'].includes(country.toUpperCase())) {
      and.push({ country: { $regex: `^${escapeRegex(country)}$`, $options: 'i' } });
    }

    const status = String(q.status || '').toUpperCase();
    if (status && !['ALL', 'ALL STATUS'].includes(status)) {
      if (!['GOLD', 'SILVER', 'BRONZE'].includes(status)) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid status. Use GOLD, SILVER or BRONZE');
      }
      // cvTier is the persisted card tier computed by computePlayerCardTier (client rules)
      and.push(
        status === 'BRONZE'
          ? { $or: [{ cvTier: 'BRONZE' }, { cvTier: { $exists: false } }, { cvTier: null }] }
          : { cvTier: status },
      );
    }

    const minAge = q.minAge !== undefined && q.minAge !== '' ? Number(q.minAge) : null;
    const maxAge = q.maxAge !== undefined && q.maxAge !== '' ? Number(q.maxAge) : null;
    if ((minAge !== null && Number.isNaN(minAge)) || (maxAge !== null && Number.isNaN(maxAge))) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'minAge and maxAge must be numbers');
    }
    const noDob = { $or: [{ dateOfBirth: { $exists: false } }, { dateOfBirth: null }] };
    if (minAge !== null) {
      const bornOnOrBefore = new Date();
      bornOnOrBefore.setFullYear(bornOnOrBefore.getFullYear() - minAge);
      and.push({
        $or: [
          { dateOfBirth: { $lte: bornOnOrBefore } },
          { $and: [noDob, { age: { $gte: minAge } }] },
        ],
      });
    }
    if (maxAge !== null) {
      const bornAfter = new Date();
      bornAfter.setFullYear(bornAfter.getFullYear() - (maxAge + 1));
      and.push({
        $or: [{ dateOfBirth: { $gt: bornAfter } }, { $and: [noDob, { age: { $lte: maxAge } }] }],
      });
    }

    const term = String(q.searchTerm || q.search || '').trim();
    if (term) q.searchTerm = escapeRegex(term);
    delete q.search;
    Object.keys(q).forEach((key) => {
      if (!['searchTerm', 'sort', 'page', 'limit'].includes(key)) delete q[key];
    });
    if (!q.sort) q.sort = '-overallRating,-createdAt';
    q.page = Math.max(1, Number(q.page) || 1);
    q.limit = Math.max(1, Math.min(100, Number(q.limit) || 10));
    q.fields =
      '_id,fullName,profileImage,position,currentClub,country,dateOfBirth,age,overallRating,cvTier';
    const builder = new QueryBuilder(PlayerProfile.find(and.length ? { $and: and } : {}), q)
      .search(['fullName', 'currentClub', 'position', 'country'])
      .filter()
      .sort()
      .paginate()
      .fields();

    const [players, pageMeta, allCvsCount, countries, positions] = await Promise.all([
      builder.modelQuery.lean(),
      builder.countTotal(),
      PlayerProfile.countDocuments({}),
      PlayerProfile.distinct('country', { country: { $nin: [null, ''] } }),
      PlayerProfile.distinct('position', { position: { $nin: [null, ''] } }),
    ]);

    const rows = players.map((p: any) => {
      const pid = String(p._id);
      const raw = typeof p.overallRating === 'number' ? p.overallRating : null;
      return {
        id: p._id,
        playerId: p._id,
        name: p.fullName || '',
        position: p.position || '',
        avatar: p.profileImage || null,
        rating: raw !== null ? (raw / 10).toFixed(1) : null,
        rawRating: raw,
        club: p.currentClub || '',
        country: p.country || '',
        age: this.ageFromProfile(p),
        status: p.cvTier || 'BRONZE',
        isLiked: likedSet.has(pid),
        shareCount: sharedMap.get(pid) || 0,
        shareableUrl: this.shareUrlFor(pid),
      };
    });

    return {
      metrics: {
        allCvs: { label: 'ALL CVS', count: allCvsCount },
        likedCvs: { label: 'LIKED CVS', count: likedSet.size },
        profilesShared: { label: 'PROFILES SHARED', count: sharedMap.size },
      },
      filterOptions: {
        positions: (positions as string[]).sort(),
        countries: (countries as string[]).sort(),
        statuses: ['GOLD', 'SILVER', 'BRONZE'],
      },
      currentTab: tab,
      meta: {
        page: pageMeta.page,
        limit: pageMeta.limit,
        total: pageMeta.total,
        totalPages: pageMeta.totalPage,
      },
      data: rows,
    };
  }

  async toggleLikePlayerCv(user: any, playerId: string) {
    const player = await this.assertPlayerExists(playerId);
    const academy = await this.getOwnAcademy(user);

    const alreadyLiked = (academy.likedPlayerIds || []).some(
      (id: any) => String(id) === String(player._id),
    );
    const updated = await AcademyProfile.findByIdAndUpdate(
      academy._id,
      alreadyLiked
        ? { $pull: { likedPlayerIds: player._id } }
        : { $addToSet: { likedPlayerIds: player._id } },
      { new: true },
    )
      .select('likedPlayerIds')
      .lean();

    const playerTotalLikes = await playerCacheService.syncPlayerTotalLikes(
      String(player._id),
      player.userId,
    );

    return {
      playerId: player._id,
      playerName: player.fullName,
      isLiked: !alreadyLiked,
      likedCount: updated?.likedPlayerIds?.length || 0,
      playerTotalLikes,
      message: alreadyLiked
        ? `${player.fullName} removed from Liked CVs`
        : `${player.fullName} added to Liked CVs`,
    };
  }

  async sharePlayerCv(user: any, playerId: string) {
    const player = await this.assertPlayerExists(playerId);
    const academy = await this.getOwnAcademy(user);
    const now = new Date();

    // increment if this player was shared before, otherwise add the entry
    const inc = await AcademyProfile.updateOne(
      { _id: academy._id, 'sharedPlayerProfiles.playerId': player._id },
      {
        $inc: { 'sharedPlayerProfiles.$.shareCount': 1 },
        $set: { 'sharedPlayerProfiles.$.sharedAt': now },
      },
    );
    if (!inc.matchedCount) {
      await AcademyProfile.updateOne(
        { _id: academy._id },
        { $push: { sharedPlayerProfiles: { playerId: player._id, sharedAt: now, shareCount: 1 } } },
      );
    }
    const updated = await AcademyProfile.findById(academy._id)
      .select('sharedPlayerProfiles')
      .lean();
    const entry = (updated?.sharedPlayerProfiles || []).find(
      (s: any) => String(s.playerId) === String(player._id),
    );

    return {
      playerId: player._id,
      playerName: player.fullName,
      shareableUrl: this.shareUrlFor(String(player._id)),
      shareCount: entry?.shareCount || 1,
      uniqueSharedProfiles: updated?.sharedPlayerProfiles?.length || 0,
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

    const rawRating =
      typeof (player as any).overallRating === 'number' ? (player as any).overallRating : null;
    const tier = (player as any).cvTier || 'BRONZE';
    const age = this.ageFromProfile(player);

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
      rating: rawRating !== null ? (rawRating / 10).toFixed(1) : null,
      tier,
      avatar:
        (player as any).avatar ||
        (player as any).profileImage ||
        (player.userId as any)?.avatar ||
        null,
      currentClub: player.currentClub || (player.academyId as any)?.name || '',
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
        result: m.matchResult || null,
      })),
      isPublic: true,
    };
  }
}

export const academyCvValidationService = new AcademyCvValidationService();
