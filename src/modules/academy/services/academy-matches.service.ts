import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IGameReport } from '../academy.interface';
import { Team, GameReport, AcademyMatch } from '../academy.model';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { academyResolverService } from './academy-resolver.service';

export class AcademyMatchesService {
  async createGameReport(academyId: string, payload: Partial<IGameReport>) {
    return GameReport.create({ ...payload, academyId });
  }

  async getGameReports(academyId: string) {
    return GameReport.find({ academyId })
      .populate('playerId', 'fullName position overallRating')
      .populate('coachId', 'fullName title');
  }

  async getMatchesMeta(user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // Reuse existing academy teams directly
    const teams = await Team.find({ academyId: academy._id })
      .select('teamName ageGroup playerIds')
      .sort({ teamName: 1 })
      .lean();

    const formattedTeams = teams.map((t: any) => ({
      _id: t._id,
      id: t._id,
      teamName: t.teamName,
      name: t.teamName,
      ageGroup: t.ageGroup || 'Youth',
      playerCount: (t.playerIds || []).length,
    }));

    return {
      teams: formattedTeams,
      matchTypes: ['Friendly', 'League', 'Tournament', 'Cup'],
      venueTypes: ['HOME GROUND', 'AWAY', 'NEUTRAL'],
      statuses: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
    };
  }

  async getMatches(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const filter: any = { academyId: academy._id };

    // Filter by team
    if (query.teamId && Types.ObjectId.isValid(query.teamId)) {
      filter.ourTeamId = new Types.ObjectId(query.teamId);
    }

    // Filter by status (SCHEDULED, COMPLETED, CANCELLED)
    if (
      query.status &&
      ['SCHEDULED', 'COMPLETED', 'CANCELLED'].includes(String(query.status).toUpperCase())
    ) {
      filter.status = String(query.status).toUpperCase();
    }

    // Filter by matchType (Friendly, League, Tournament, Cup)
    if (query.matchType) {
      filter.matchType = { $regex: new RegExp(String(query.matchType).trim(), 'i') };
    }

    // Filter by homeOrAway
    if (query.homeOrAway) {
      filter.homeOrAway = { $regex: new RegExp(String(query.homeOrAway).trim(), 'i') };
    }

    // Filter by date range or specific date
    if (query.date) {
      const targetDate = new Date(query.date);
      if (!isNaN(targetDate.getTime())) {
        const startOfDay = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
        );
        const endOfDay = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
          23,
          59,
          59,
          999,
        );
        filter.matchDate = { $gte: startOfDay, $lte: endOfDay };
      }
    } else if (query.startDate || query.endDate) {
      filter.matchDate = {};
      if (query.startDate) filter.matchDate.$gte = new Date(query.startDate);
      if (query.endDate) filter.matchDate.$lte = new Date(query.endDate);
    }

    // Search by team name, matchTitle, opponentTeam, venue, or competition
    if (query.search) {
      const searchRegex = new RegExp(String(query.search).trim(), 'i');
      filter.$or = [
        { matchTitle: searchRegex },
        { opponentTeam: searchRegex },
        { venueName: searchRegex },
        { competitionName: searchRegex },
      ];
    }

    // Pagination
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const [totalRecords, matches] = await Promise.all([
      AcademyMatch.countDocuments(filter),
      AcademyMatch.find(filter)
        .populate('ourTeamId', 'teamName ageGroup')
        .sort({ matchDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const monthNames = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];

    const formattedMatches = matches.map((m: any) => {
      const mDate = m.matchDate ? new Date(m.matchDate) : new Date();
      const formattedDate = `${monthNames[mDate.getMonth()]} ${mDate.getDate()}, ${mDate.getFullYear()}`;
      const ourTeam = m.ourTeamId || {};

      const transport = Number(m.transportCost) || 0;
      const ground = Number(m.groundCost) || 0;
      const meals = Number(m.mealsCost) || 0;
      const other = Number(m.otherCosts) || 0;
      const total = transport + ground + meals + other;

      return {
        _id: m._id,
        id: m._id,
        matchTitle: m.matchTitle,
        title: m.matchTitle,
        ourTeamId: ourTeam._id || m.ourTeamId,
        ourTeam: {
          _id: ourTeam._id || null,
          id: ourTeam._id || null,
          name: ourTeam.teamName || 'Academy Team',
          ageGroup: ourTeam.ageGroup || 'Youth',
        },
        opponentTeam: m.opponentTeam,
        matchType: m.matchType || 'Friendly',
        competitionName: m.competitionName || '',
        homeOrAway: String(m.homeOrAway || 'HOME GROUND').toUpperCase(),
        venue: {
          homeOrAway: String(m.homeOrAway || 'HOME GROUND').toUpperCase(),
          name: m.venueName,
          address: m.venueAddress,
        },
        venueName: m.venueName,
        venueAddress: m.venueAddress,
        matchDate: m.matchDate,
        date: formattedDate,
        formattedDate,
        kickOffTime: m.kickOffTime,
        time: m.kickOffTime,
        referees: m.referees || '',
        travelRequired: Boolean(m.travelRequired),
        costs: {
          transport,
          transportFormatted: `$${transport}`,
          groundCost: ground,
          groundCostFormatted: `$${ground}`,
          mealsCost: meals,
          mealsCostFormatted: `$${meals}`,
          otherCosts: other,
          otherCostsFormatted: `$${other}`,
          totalCost: total,
          totalCostFormatted: `$${total}`,
        },
        transportCost: transport,
        groundCost: ground,
        mealsCost: meals,
        otherCosts: other,
        totalCost: total,
        estimatedTotalCost: total,
        notes: m.notes || '',
        status: m.status || 'SCHEDULED',
        createdAt: m.createdAt,
      };
    });

    return {
      matches: formattedMatches,
      meta: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  async getMatchById(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const match = await AcademyMatch.findOne({
      _id: id,
      academyId: academy._id,
    })
      .populate('ourTeamId', 'teamName ageGroup')
      .lean();

    if (!match) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Scheduled match not found');
    }

    const m: any = match;
    const mDate = m.matchDate ? new Date(m.matchDate) : new Date();
    const monthNames = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];
    const formattedDate = `${monthNames[mDate.getMonth()]} ${mDate.getDate()}, ${mDate.getFullYear()}`;
    const ourTeam = m.ourTeamId || {};

    const transport = Number(m.transportCost) || 0;
    const ground = Number(m.groundCost) || 0;
    const meals = Number(m.mealsCost) || 0;
    const other = Number(m.otherCosts) || 0;
    const total = transport + ground + meals + other;

    return {
      _id: m._id,
      id: m._id,
      matchTitle: m.matchTitle,
      ourTeamId: ourTeam._id || m.ourTeamId,
      ourTeam: {
        _id: ourTeam._id || null,
        id: ourTeam._id || null,
        name: ourTeam.teamName || 'Academy Team',
        ageGroup: ourTeam.ageGroup || 'Youth',
      },
      opponentTeam: m.opponentTeam,
      matchType: m.matchType || 'Friendly',
      competitionName: m.competitionName || '',
      homeOrAway: String(m.homeOrAway || 'HOME GROUND').toUpperCase(),
      venueName: m.venueName,
      venueAddress: m.venueAddress,
      matchDate: m.matchDate,
      date: formattedDate,
      kickOffTime: m.kickOffTime,
      referees: m.referees || '',
      travelRequired: Boolean(m.travelRequired),
      transportCost: transport,
      groundCost: ground,
      mealsCost: meals,
      otherCosts: other,
      totalCost: total,
      estimatedTotalCost: total,
      notes: m.notes || '',
      status: m.status || 'SCHEDULED',
      createdAt: m.createdAt,
    };
  }

  async createMatch(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // Validate our team belongs to this academy
    const team = await Team.findOne({
      _id: payload.ourTeamId,
      academyId: academy._id,
    });
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Our team was not found under this academy');
    }

    const transportCost = Number(payload.transportCost) || 0;
    const groundCost = Number(payload.groundCost) || 0;
    const mealsCost = Number(payload.mealsCost) || 0;
    const otherCosts = Number(payload.otherCosts) || 0;
    const estimatedTotalCost = transportCost + groundCost + mealsCost + otherCosts;

    const newMatch = await AcademyMatch.create({
      academyId: academy._id,
      matchTitle: payload.matchTitle,
      ourTeamId: team._id,
      opponentTeam: payload.opponentTeam,
      matchType: payload.matchType || 'Friendly',
      competitionName: payload.competitionName || undefined,
      homeOrAway: String(payload.homeOrAway || 'HOME GROUND').toUpperCase(),
      venueName: payload.venueName,
      venueAddress: payload.venueAddress,
      matchDate: new Date(payload.matchDate),
      kickOffTime: payload.kickOffTime,
      referees: payload.referees || undefined,
      travelRequired: Boolean(payload.travelRequired),
      transportCost,
      groundCost,
      mealsCost,
      otherCosts,
      estimatedTotalCost,
      notes: payload.notes || '',
      status: payload.status || 'SCHEDULED',
    });

    return {
      message: 'Match scheduled successfully',
      match: newMatch,
    };
  }

  async updateMatch(id: string, user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const match = await AcademyMatch.findOne({
      _id: id,
      academyId: academy._id,
    });
    if (!match) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Scheduled match not found');
    }

    if (payload.ourTeamId && payload.ourTeamId !== match.ourTeamId.toString()) {
      const team = await Team.findOne({
        _id: payload.ourTeamId,
        academyId: academy._id,
      });
      if (!team) {
        throw new AppError(StatusCodes.NOT_FOUND, 'Selected team not found in this academy');
      }
      match.ourTeamId = team._id;
    }

    if (payload.matchTitle) match.matchTitle = payload.matchTitle;
    if (payload.opponentTeam) match.opponentTeam = payload.opponentTeam;
    if (payload.matchType) match.matchType = payload.matchType;
    if (payload.competitionName !== undefined) match.competitionName = payload.competitionName;
    if (payload.homeOrAway) match.homeOrAway = String(payload.homeOrAway).toUpperCase();
    if (payload.venueName) match.venueName = payload.venueName;
    if (payload.venueAddress) match.venueAddress = payload.venueAddress;
    if (payload.matchDate) match.matchDate = new Date(payload.matchDate);
    if (payload.kickOffTime) match.kickOffTime = payload.kickOffTime;
    if (payload.referees !== undefined) match.referees = payload.referees;
    if (payload.travelRequired !== undefined)
      match.travelRequired = Boolean(payload.travelRequired);
    if (payload.notes !== undefined) match.notes = payload.notes;
    if (payload.status) match.status = payload.status;

    if (payload.transportCost !== undefined)
      match.transportCost = Number(payload.transportCost) || 0;
    if (payload.groundCost !== undefined) match.groundCost = Number(payload.groundCost) || 0;
    if (payload.mealsCost !== undefined) match.mealsCost = Number(payload.mealsCost) || 0;
    if (payload.otherCosts !== undefined) match.otherCosts = Number(payload.otherCosts) || 0;

    match.estimatedTotalCost =
      (match.transportCost || 0) +
      (match.groundCost || 0) +
      (match.mealsCost || 0) +
      (match.otherCosts || 0);

    await match.save();

    return {
      message: 'Match schedule updated successfully',
      match,
    };
  }

  async deleteMatch(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const match = await AcademyMatch.findOneAndDelete({
      _id: id,
      academyId: academy._id,
    });
    if (!match) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Scheduled match not found');
    }

    return {
      message: 'Scheduled match deleted successfully',
    };
  }

  async getAcademyGameReportsDashboard(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // 1. Gather all players of this academy (direct and via team rosters)
    const directPlayers = await PlayerProfile.find({ academyId: academy._id })
      .select('_id fullName position profileImage ageGroup age overallRating currentClub')
      .lean();

    const teamPlayerIds = await Team.find({ academyId: academy._id }).distinct('roster.playerId');
    const extraPlayers = await PlayerProfile.find({
      _id: { $in: teamPlayerIds, $nin: directPlayers.map((p) => p._id) },
    })
      .select('_id fullName position profileImage ageGroup age overallRating currentClub')
      .lean();

    const allPlayers = [...directPlayers, ...extraPlayers];
    const playerMap = new Map<string, any>();
    allPlayers.forEach((p) => playerMap.set(p._id.toString(), p));

    const allPlayerIds = allPlayers.map((p) => p._id);

    // 2. Fetch all match records for academy players
    const allMatches = await MatchRecord.find({
      playerId: { $in: allPlayerIds },
    })
      .sort({ matchDate: -1, createdAt: -1 })
      .lean();

    // 3. Compute Metrics Cards (Screenshot 1)
    const totalReports = allMatches.length;
    const totalGoals = allMatches.reduce(
      (sum, m: any) => sum + (m.goals ?? m.stats?.goalScored ?? 0),
      0,
    );
    const totalAssists = allMatches.reduce(
      (sum, m: any) => sum + (m.assists ?? m.stats?.assists ?? 0),
      0,
    );

    const ratedMatches = allMatches.filter((m: any) => {
      const r = m.coachReview?.coachRating ?? m.playerRating;
      return r !== undefined && r !== null && Number(r) > 0;
    });

    const avgRatingNum =
      ratedMatches.length > 0
        ? ratedMatches.reduce((sum, m: any) => {
            let r = Number(m.coachReview?.coachRating ?? m.playerRating);
            if (r <= 10) r = r * 10;
            return sum + r;
          }, 0) / ratedMatches.length
        : 0;

    const metrics = {
      avgMatchRating: `${avgRatingNum.toFixed(1)}%`,
      totalGoals,
      totalAssists,
      totalReports,
    };

    // 4. Compute Top Scorers Widget (Screenshot 1)
    const playerGoalsMap = new Map<string, { player: any; goals: number }>();
    allMatches.forEach((m: any) => {
      const pId = m.playerId?.toString();
      const player = playerMap.get(pId);
      if (!player) return;
      const g = m.goals ?? m.stats?.goalScored ?? 0;
      if (!playerGoalsMap.has(pId)) {
        playerGoalsMap.set(pId, { player, goals: 0 });
      }
      playerGoalsMap.get(pId)!.goals += g;
    });

    const topScorers = Array.from(playerGoalsMap.values())
      .filter((item) => item.goals > 0)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 5)
      .map((item) => {
        const p = item.player;
        const pos = (p.position || '').toUpperCase();
        const age = (p as any).ageGroup || (p.age ? `U-${p.age}` : '');
        return {
          _id: p._id,
          name: p.fullName || '',
          position: pos,
          ageGroup: age,
          goals: item.goals,
          avatar: p.profileImage || '',
        };
      });

    // 5. Compute Top Performers Widget (Screenshot 1)
    const topPerformers = allMatches
      .filter((m: any) => {
        const r = Number(m.coachReview?.coachRating ?? m.playerRating ?? 0);
        return r > 0;
      })
      .map((m: any) => {
        let r = Number(m.coachReview?.coachRating ?? m.playerRating ?? 0);
        if (r <= 10) r = Math.round(r * 10);
        const player = playerMap.get(m.playerId?.toString()) || {};
        const pos = (player.position || '').toUpperCase();
        const age = m.ageGroup || (player as any).ageGroup || (player.age ? `U-${player.age}` : '');
        return {
          _id: m._id,
          playerId: player._id,
          name: player.fullName || '',
          position: age && pos ? `${age} · ${pos}` : pos || age || '',
          rating: `${r}%`,
          ratingNum: r,
        };
      })
      .sort((a, b) => b.ratingNum - a.ratingNum)
      .slice(0, 5)
      .map((item, idx) => ({
        rank: `#${idx + 1}`,
        name: item.name,
        position: item.position,
        rating: item.rating,
      }));

    // 6. Search and Paginate Scouting Reports Cards (Screenshot 1)
    let filteredMatches = allMatches;
    if (query.searchTerm || query.search) {
      const term = String(query.searchTerm || query.search)
        .trim()
        .toLowerCase();
      filteredMatches = filteredMatches.filter((m: any) => {
        const player = playerMap.get(m.playerId?.toString());
        const pName = (player?.fullName || '').toLowerCase();
        const scout = (m.coachReview?.coachName || m.scoutName || '').toLowerCase();
        const home = (m.homeTeam || '').toLowerCase();
        const away = (m.awayTeam || '').toLowerCase();
        const pos = (player?.position || '').toLowerCase();
        return (
          pName.includes(term) ||
          scout.includes(term) ||
          home.includes(term) ||
          away.includes(term) ||
          pos.includes(term)
        );
      });
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 9));
    const total = filteredMatches.length;
    const paginatedMatches = filteredMatches.slice((page - 1) * limit, page * limit);

    const scoutingReports = paginatedMatches.map((m: any) => {
      const player = playerMap.get(m.playerId?.toString()) || {};
      let r = Number(m.coachReview?.coachRating ?? m.playerRating ?? 0);
      if (r <= 10) r = Math.round(r * 10);

      const dateVal = m.coachReview?.evaluatedAt || m.matchDate || m.gameDate || m.createdAt;
      let dateStr = '';
      if (dateVal) {
        try {
          const d = new Date(dateVal);
          const months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ];
          dateStr = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        } catch {
          dateStr = String(dateVal);
        }
      }

      const goals = m.goals ?? m.stats?.goalScored ?? 0;
      const assists = m.assists ?? m.stats?.assists ?? 0;
      const passes =
        m.passes ??
        m.stats?.passAccurate ??
        (m.stats?.wrongPass ? (m.stats.passAccurate || 0) + (m.stats.wrongPass || 0) : 0);

      const ratingVal = player.overallRating || 0;
      const tierNum =
        ratingVal >= 80 ? 'TIER 1' : ratingVal >= 60 ? 'TIER 2' : ratingVal > 0 ? 'TIER 3' : '';
      const posUpper = (player.position || '').toUpperCase();

      const home = m.homeTeam || player.currentClub || academy.name || '';
      const away = m.awayTeam && m.awayTeam !== 'Opponent' ? m.awayTeam : '';
      const matchTitle =
        home && away
          ? `${home.toUpperCase()} VS ${away.toUpperCase()}`
          : home.toUpperCase() || away.toUpperCase() || 'MATCH REPORT';

      return {
        _id: m._id,
        playerId: player._id,
        playerName: player.fullName || '',
        playerAvatar: player.profileImage || '',
        ageGroup: m.ageGroup || (player as any).ageGroup || (player.age ? `U-${player.age}` : ''),
        matchTitle,
        date: dateStr,
        scoutName: m.coachReview?.coachName || m.scoutName || '',
        overallPerformance: `${r}%`,
        performanceRatio: `(${r}% / 100%)`,
        goals,
        assists,
        passes,
        position: posUpper,
        tier: tierNum,
        positionTierBadge: posUpper && tierNum ? `${posUpper} · ${tierNum}` : posUpper || tierNum,
        status: m.coachReview?.status || 'COMPLETED',
      };
    });

    return {
      metrics,
      scoutingReports,
      topScorers,
      topPerformers,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const academyMatchesService = new AcademyMatchesService();
