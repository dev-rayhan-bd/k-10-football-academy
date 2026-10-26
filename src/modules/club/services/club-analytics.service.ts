import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { env } from '@/config/env';
import { User } from '@/modules/user/user.model';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { Media } from '@/modules/media/media.model';
import { Notification } from '@/modules/notification/notification.model';
import { ClubFavourite } from '../club.model';
import { clubResolverService } from './club-resolver.service';

export class ClubAnalyticsService {
  async getClubAnalytics(userId: string, query: any = {}) {
    const club = await clubResolverService.resolveClub(userId);

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
    const club = await clubResolverService.resolveClub(userId);
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
      club.profileViews = (club.profileViews || 0) + 1;
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
      totalProfileViews: club.profileViews,
      uniqueProfilesViewed: views.length,
      isNewSessionView,
      message: isNewSessionView
        ? 'Player view recorded successfully'
        : 'View acknowledged (duplicate ignored within cooldown window)',
    };
  }

  async getClubDashboard(userId: string, query: any = {}) {
    const club = await clubResolverService.resolveClub(userId);
    const user = await User.findById(userId).select('name email phone avatar');

    const playerShareBase =
      env.SCOUTING_BOARD_SHARE_PLAYER || 'https://k-10-football-academy.onrender.com/players/share';
    const coachShareBase =
      env.SCOUTING_BOARD_SHARE_COACH || 'https://k-10-football-academy.onrender.com/coach/share';

    // 1. Club Header / Banner Info
    const clubInfo = {
      id: club._id,
      name: club.name || user?.name || '',
      tier: 'ACTIVE CLUB',
      clubType: club.clubType || 'Club',
      category: club.clubType || 'Club',
      establishedYear: club.establishedYear || null,
      country: club.country || '',
      league: club.league || '',
      contactPhone: club.contactPhone || user?.phone || '',
      contactEmail: club.contactEmail || user?.email || '',
      logo: club.logo || '',
      coverPhoto: club.coverPhoto || '',
      description: club.description || '',
    };

    // 2. Metric Cards (PLAYERS, COACHES, LIKED CVS, PROFILE SHARE)
    const [totalPlayersCount, totalCoachesCount, totalLikedCvsCount] = await Promise.all([
      PlayerProfile.countDocuments({}),
      CoachProfile.countDocuments({}),
      ClubFavourite.countDocuments({ clubId: club._id, targetType: 'PLAYER' }),
    ]);

    const sharedProfilesList = club.sharedPlayerProfiles || [];
    const totalSharedCount = sharedProfilesList.reduce(
      (sum: number, s: any) => sum + (s.shareCount || 1),
      0,
    );

    const metrics = {
      players: { label: 'PLAYERS', count: totalPlayersCount },
      coaches: { label: 'COACHES', count: totalCoachesCount },
      likedCvs: { label: 'LIKED CVS', count: totalLikedCvsCount },
      profileShare: { label: 'PROFILE SHARE', count: totalSharedCount },
    };

    // 3. Analytics Charts (PLAYERS & COACHES MONITORED + POSITION INTEREST DISTRIBUTION)
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

    const viewedList = club.viewedPlayerProfiles || [];
    const viewsMap = new Map<string, number>();
    viewedList.forEach((v: any) => {
      if (v.playerId) viewsMap.set(v.playerId.toString(), v.viewCount || 1);
    });

    const sharesMap = new Map<string, number>();
    sharedProfilesList.forEach((s: any) => {
      if (s.playerId) sharesMap.set(s.playerId.toString(), s.shareCount || 1);
    });

    const likedFavs = await ClubFavourite.find({
      clubId: club._id,
      targetType: 'PLAYER',
    }).select('targetPlayerId');
    const likedSet = new Set(
      likedFavs.map((f: any) => f.targetPlayerId?.toString()).filter(Boolean),
    );

    const engagedPlayerIdList = Array.from(
      new Set([
        ...Array.from(viewsMap.keys()),
        ...Array.from(likedSet),
        ...Array.from(sharesMap.keys()),
      ]),
    ).filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id));

    const posCounts: Record<string, number> = {
      Midfielder: 0,
      Striker: 0,
      Defender: 0,
      Goalkeeper: 0,
      Winger: 0,
    };

    if (engagedPlayerIdList.length > 0) {
      const engagedPlayers = await PlayerProfile.find({ _id: { $in: engagedPlayerIdList } })
        .select('position')
        .lean();

      engagedPlayers.forEach((p: any) => {
        const pos = (p.position || '').toUpperCase();
        if (pos.includes('MID')) posCounts.Midfielder++;
        else if (pos.includes('STRIK') || pos.includes('FORWARD')) posCounts.Striker++;
        else if (pos.includes('DEFEND') || pos.includes('BACK')) posCounts.Defender++;
        else if (pos.includes('GOAL') || pos.includes('GK')) posCounts.Goalkeeper++;
        else if (pos.includes('WING')) posCounts.Winger++;
        else posCounts.Midfielder++;
      });
    }

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

    // 4. Coaches & Players Section (Platform Talent: Top 5 Registered Players & Top 5 Registered Coaches)
    const [platformPlayers, platformCoaches] = await Promise.all([
      PlayerProfile.find({})
        .select(
          '_id fullName profileImage avatar position overallRating currentClub academy country age dateOfBirth status fitnessStatus',
        )
        .sort({ overallRating: -1, createdAt: -1 })
        .limit(5)
        .lean(),
      CoachProfile.find({})
        .select(
          '_id fullName profileImage title academyRole speciality currentClub yearsExperience status birthCountry country',
        )
        .sort({ yearsExperience: -1, createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    // Aggregate match stats for the 5 dashboard players
    const dashPlayerIds = platformPlayers.map((p: any) => p._id);
    const dashMatchAggregates = await MatchRecord.aggregate([
      { $match: { playerId: { $in: dashPlayerIds } } },
      {
        $group: {
          _id: '$playerId',
          matches: { $sum: 1 },
          goals: { $sum: { $ifNull: ['$goals', 0] } },
          assists: { $sum: { $ifNull: ['$assists', 0] } },
        },
      },
    ]);
    const dashStatsMap = new Map<string, { matches: number; goals: number; assists: number }>();
    dashMatchAggregates.forEach((m) => {
      dashStatsMap.set(m._id.toString(), {
        matches: m.matches || 0,
        goals: m.goals || 0,
        assists: m.assists || 0,
      });
    });

    const formattedPlayers = platformPlayers.map((p: any) => {
      let age = typeof p.age === 'number' ? p.age : null;
      if (p.dateOfBirth) {
        const diffMs = Date.now() - new Date(p.dateOfBirth).getTime();
        age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
      }
      const rating = typeof p.overallRating === 'number' ? p.overallRating : 0;
      const stats = dashStatsMap.get(p._id.toString()) || { matches: 0, goals: 0, assists: 0 };
      const currentStatus =
        p.fitnessStatus || (p.status === 'ACTIVE' || p.status === 'INJURED' ? p.status : 'ACTIVE');

      return {
        id: p._id,
        playerId: p._id,
        name: p.fullName || '',
        avatar: p.profileImage || p.avatar || null,
        position: (p.position || '').toUpperCase(),
        rating: (rating / 10).toFixed(1),
        rawRating: rating,
        club: p.currentClub || p.academy || 'Free Agent',
        country: p.country || '',
        age,
        matches: stats.matches,
        goals: stats.goals,
        assists: stats.assists,
        status: currentStatus,
        fitnessStatus: currentStatus,
        shareableUrl: `${playerShareBase}/${p._id}`,
      };
    });

    const formattedCoaches = platformCoaches.map((c: any) => ({
      id: c._id,
      coachId: c._id,
      name: c.fullName || '',
      avatar: c.profileImage || null,
      role: (c.title || c.academyRole || 'HEAD COACH').toUpperCase(),
      speciality: c.speciality || 'General',
      team: c.currentClub || 'Available',
      club: c.currentClub || 'Available',
      country: c.birthCountry || c.country || '',
      experience: `${c.yearsExperience || 0} yrs`,
      yearsExperience: c.yearsExperience || 0,
      status: c.status || 'AVAILABLE',
      shareableUrl: `${coachShareBase}/${c._id}`,
    }));

    // 5. Favourites (Favourite Players & Favourite Coaches)
    const favPlayerDocs = await ClubFavourite.find({
      $or: [
        { clubId: club._id, targetType: 'PLAYER' },
        ...(club.userId ? [{ clubId: club.userId, targetType: 'PLAYER' }] : []),
      ],
    })
      .populate({
        path: 'targetPlayerId',
        select:
          '_id fullName avatar profileImage position overallRating currentClub academy country dateOfBirth age',
      })
      .sort({ createdAt: -1 })
      .lean();

    const seenPlayerIds = new Set<string>();
    const favouritePlayers: any[] = [];

    favPlayerDocs.forEach((f: any) => {
      const p = f.targetPlayerId;
      if (!p) return;
      const pid = p._id.toString();
      if (seenPlayerIds.has(pid)) return;
      seenPlayerIds.add(pid);

      let age = typeof p.age === 'number' ? p.age : null;
      if (p.dateOfBirth) {
        const diffMs = Date.now() - new Date(p.dateOfBirth).getTime();
        age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
      }
      const rating = typeof p.overallRating === 'number' ? p.overallRating : 0;
      favouritePlayers.push({
        id: p._id,
        playerId: p._id,
        name: p.fullName || '',
        avatar: p.profileImage || p.avatar || null,
        position: (p.position || '').toUpperCase(),
        rating: (rating / 10).toFixed(1),
        club: p.currentClub || p.academy || '',
        country: p.country || '',
        age,
        shareableUrl: `${playerShareBase}/${p._id}`,
      });
    });

    // Also include any likedPlayerIds from ClubProfile that might not have a ClubFavourite doc
    const likedIds = (club.likedPlayerIds || []).map((id: any) => id.toString());
    const missingLikedIds = likedIds.filter((id: string) => !seenPlayerIds.has(id));
    if (missingLikedIds.length > 0) {
      const missingPlayers = await PlayerProfile.find({ _id: { $in: missingLikedIds } })
        .select(
          '_id fullName avatar profileImage position overallRating currentClub academy country dateOfBirth age',
        )
        .lean();

      missingPlayers.forEach((p: any) => {
        let age = typeof p.age === 'number' ? p.age : null;
        if (p.dateOfBirth) {
          const diffMs = Date.now() - new Date(p.dateOfBirth).getTime();
          age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
        }
        const rating = typeof p.overallRating === 'number' ? p.overallRating : 0;
        favouritePlayers.push({
          id: p._id,
          playerId: p._id,
          name: p.fullName || '',
          avatar: p.profileImage || p.avatar || null,
          position: (p.position || '').toUpperCase(),
          rating: (rating / 10).toFixed(1),
          club: p.currentClub || p.academy || '',
          country: p.country || '',
          age,
          shareableUrl: `${playerShareBase}/${p._id}`,
        });
      });
    }

    const favCoachDocs = await ClubFavourite.find({
      $or: [
        { clubId: club._id, targetType: 'COACH' },
        ...(club.userId ? [{ clubId: club.userId, targetType: 'COACH' }] : []),
      ],
    })
      .populate({
        path: 'targetCoachId',
        select:
          '_id fullName profileImage title speciality currentClub birthCountry yearsExperience',
      })
      .sort({ createdAt: -1 })
      .lean();

    const seenCoachIds = new Set<string>();
    const favouriteCoaches: any[] = [];

    favCoachDocs.forEach((f: any) => {
      const c = f.targetCoachId;
      if (!c) return;
      const cid = c._id.toString();
      if (seenCoachIds.has(cid)) return;
      seenCoachIds.add(cid);

      favouriteCoaches.push({
        id: c._id,
        coachId: c._id,
        name: c.fullName || '',
        avatar: c.profileImage || null,
        role: c.title || c.speciality || 'Coach',
        speciality: c.speciality || 'General',
        club: c.currentClub || '',
        country: c.birthCountry || '',
        experience: `${c.yearsExperience || 0} yrs`,
        shareableUrl: `${coachShareBase}/${c._id}`,
      });
    });

    // 6. Media Gallery (Images & Videos from common Media collection)
    const mediaItems = await Media.find({
      $or: [{ clubId: club._id }, { userId: club.userId, role: 'CLUB' }],
    })
      .sort({ createdAt: -1 })
      .lean();

    const formattedMedia = mediaItems.map((m: any) => ({
      id: m._id,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl || m.url,
      title: m.title || 'Untitled',
      description: m.description || '',
      mediaType: m.mediaType,
      views: m.views || 0,
      likes: m.likes || 0,
      createdAt: m.createdAt,
    }));

    const images = formattedMedia.filter((m: any) => m.mediaType === 'IMAGE');
    const videos = formattedMedia.filter((m: any) => m.mediaType === 'VIDEO');

    // 7. Recent Activity (Notifications + Club Favourites + Profile Views + CV Shares)
    const [notifications, recentFavs] = await Promise.all([
      Notification.find({ recipientId: club.userId }).sort({ createdAt: -1 }).limit(10).lean(),
      ClubFavourite.find({
        $or: [{ clubId: club._id }, ...(club.userId ? [{ clubId: club.userId }] : [])],
      })
        .populate({ path: 'targetPlayerId', select: 'fullName position' })
        .populate({ path: 'targetCoachId', select: 'fullName title speciality' })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const activityList: any[] = [];

    notifications.forEach((n: any) => {
      activityList.push({
        id: n._id,
        title: n.title,
        description: n.message,
        type: n.type || 'NOTIFICATION',
        timeAgo: clubResolverService.formatTimeAgo(n.createdAt),
        createdAt: n.createdAt,
      });
    });

    recentFavs.forEach((fav: any) => {
      if (fav.targetType === 'PLAYER' && fav.targetPlayerId) {
        activityList.push({
          id: fav._id,
          title: 'Player added to favourites',
          description: `Added ${fav.targetPlayerId.fullName || 'player'} to scouting favourites`,
          type: 'FAVOURITE',
          timeAgo: clubResolverService.formatTimeAgo(fav.createdAt),
          createdAt: fav.createdAt,
        });
      } else if (fav.targetType === 'COACH' && fav.targetCoachId) {
        activityList.push({
          id: fav._id,
          title: 'Coach added to favourites',
          description: `Added coach ${fav.targetCoachId.fullName || 'coach'} to scouting favourites`,
          type: 'FAVOURITE',
          timeAgo: clubResolverService.formatTimeAgo(fav.createdAt),
          createdAt: fav.createdAt,
        });
      }
    });

    viewedList.slice(0, 5).forEach((v: any, idx: number) => {
      activityList.push({
        id: `act-view-${idx}`,
        title: 'Player profile reviewed',
        description: `Reviewed player CV profile on scouting board`,
        type: 'VIEW',
        timeAgo: clubResolverService.formatTimeAgo(v.viewedAt || new Date()),
        createdAt: v.viewedAt || new Date(),
      });
    });

    sharedProfilesList.slice(0, 5).forEach((s: any, idx: number) => {
      activityList.push({
        id: `act-share-${idx}`,
        title: 'Player CV shared',
        description: `Shared player CV for recruitment evaluation`,
        type: 'SHARE',
        timeAgo: clubResolverService.formatTimeAgo(s.sharedAt || new Date()),
        createdAt: s.sharedAt || new Date(),
      });
    });

    activityList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const finalActivityList = activityList.slice(0, 10);

    return {
      club: clubInfo,
      metrics,
      analytics: {
        selectedYear,
        playersAndCoachesMonitored,
        positionInterestDistribution,
      },
      coachesAndPlayers: {
        players: formattedPlayers,
        coaches: formattedCoaches,
      },
      favourites: {
        players: favouritePlayers,
        coaches: favouriteCoaches,
      },
      media: {
        images,
        videos,
        all: formattedMedia,
        totalImages: images.length,
        totalVideos: videos.length,
      },
      recentActivity: finalActivityList,
    };
  }
}

export const clubAnalyticsService = new ClubAnalyticsService();
