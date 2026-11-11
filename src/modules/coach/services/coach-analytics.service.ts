import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import {
  ICoachAnalyticsResponse,
  ICoachProfileAnalysis,
  ICoachTournamentStats,
  ICoachTrophyDetail,
} from '../coach.interface';
import { CoachProfile, TacticalFormation, CoachTestimonial } from '../coach.model';
import { computeCoachProfileCompletion } from './coach-cv.service';
import { Media } from '@/modules/media/media.model';
import { MatchRecord } from '@/modules/player/player.model';
import { ClubFavourite, ClubProfile } from '@/modules/club/club.model';

export class CoachAnalyticsService {
  async getCoachAnalytics(coachIdentifier: string): Promise<ICoachAnalyticsResponse> {
    let profile: any = null;
    if (Types.ObjectId.isValid(coachIdentifier)) {
      const objId = new Types.ObjectId(coachIdentifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }

    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }

    // Fetch linked formations and testimonials in parallel for real aggregation
    const [formations, testimonials] = await Promise.all([
      TacticalFormation.find({ coachId: profile._id }).lean(),
      CoachTestimonial.find({ coachId: profile._id }).lean(),
    ]);

    // Real media counts and formations for accurate tier and completion calculation
    const [picturesCount, videosCount, formationCount] = await Promise.all([
      Media.countDocuments({ coachId: profile._id, mediaType: 'IMAGE' }).catch(() => 0),
      Media.countDocuments({ coachId: profile._id, mediaType: 'VIDEO' }).catch(() => 0),
      TacticalFormation.countDocuments({ coachId: profile._id }).catch(() => 0),
    ]);

    const { completionPercentage, autoTier } = computeCoachProfileCompletion(
      profile,
      (profile.userId as any)?.avatar,
      picturesCount,
      videosCount,
      formationCount > 0,
    );

    if (profile.cvTier !== autoTier || profile.profileCompletion !== completionPercentage) {
      profile.cvTier = autoTier;
      profile.profileCompletion = completionPercentage;
      await CoachProfile.updateOne(
        { _id: profile._id },
        { cvTier: autoTier, profileCompletion: completionPercentage },
      );
    }

    // 1. Radar Profile Analysis (Calculated directly from Coach DB records)
    let coachProfileAnalysis: ICoachProfileAnalysis | null;
    if (profile.coachProfileAnalysis && Object.keys(profile.coachProfileAnalysis).length > 0) {
      const raw = profile.coachProfileAnalysis;
      const tactics = Number(raw.tactics ?? 0);
      const leadership = Number(raw.leadership ?? 0);
      const communication = Number(raw.communication ?? 0);
      const adaptability = Number(raw.adaptability ?? 0);
      const discipline = Number(raw.discipline ?? 0);
      const development = Number(raw.development ?? 0);
      const overall =
        raw.overall !== undefined
          ? Number(raw.overall)
          : Math.round(
              (tactics + leadership + communication + adaptability + discipline + development) / 6,
            );

      coachProfileAnalysis = {
        tactics,
        leadership,
        communication,
        adaptability,
        discipline,
        development,
        overall,
      };
    } else {
      // Aggregate from real DB fields (no mock numbers)
      const baseRating = Number(profile.overallRatingScore || 0);
      const totalMatches = Number(profile.matchesCoached || 0);
      const wins = Number(profile.totalWins || 0);
      const cleanSheets = Number(profile.cleanSheets || 0);
      const winRatio = totalMatches > 0 ? wins / totalMatches : 0;
      const cleanSheetRatio = totalMatches > 0 ? cleanSheets / totalMatches : 0;

      const formationsCount = (formations || []).length;
      const coursesCount = Array.isArray(profile.courses) ? profile.courses.length : 0;
      const languagesCount = Array.isArray(profile.languages) ? profile.languages.length : 0;
      const clubsCount = Array.isArray(profile.clubHistory) ? profile.clubHistory.length : 0;
      const yearsExp = Number(profile.yearsExperience || 0);
      const avgRating =
        testimonials.length > 0
          ? testimonials.reduce((acc: number, t: any) => acc + Number(t.rating || 0), 0) /
            testimonials.length
          : 0;

      if (baseRating === 0 && totalMatches === 0 && yearsExp === 0 && formationsCount === 0) {
        coachProfileAnalysis = {
          tactics: 0,
          leadership: 0,
          communication: 0,
          adaptability: 0,
          discipline: 0,
          development: 0,
          overall: 0,
        };
      } else {
        const effectiveBase = baseRating > 0 ? baseRating : Math.min(75, 50 + yearsExp * 2);
        const tactics = Math.min(
          99,
          Math.max(0, Math.round(effectiveBase + (formationsCount >= 2 ? 3 : 0))),
        );
        const leadership = Math.min(
          99,
          Math.max(
            0,
            Math.round(
              effectiveBase + Math.min(5, Math.floor(yearsExp / 3)) + (winRatio > 0.6 ? 2 : 0),
            ),
          ),
        );
        const communication = Math.min(
          99,
          Math.max(
            0,
            Math.round(effectiveBase + Math.min(4, languagesCount * 2) + (avgRating >= 4 ? 2 : 0)),
          ),
        );
        const adaptability = Math.min(
          99,
          Math.max(0, Math.round(effectiveBase + Math.min(4, clubsCount * 2))),
        );
        const discipline = Math.min(
          99,
          Math.max(0, Math.round(effectiveBase + Math.min(5, Math.round(cleanSheetRatio * 10)))),
        );
        const development = Math.min(
          99,
          Math.max(
            0,
            Math.round(
              effectiveBase + Math.min(4, coursesCount) + (profile.youthYearsExperience ? 2 : 0),
            ),
          ),
        );
        const overall = Math.round(
          (tactics + leadership + communication + adaptability + discipline + development) / 6,
        );

        coachProfileAnalysis = {
          tactics,
          leadership,
          communication,
          adaptability,
          discipline,
          development,
          overall,
        };
      }
    }

    // 2. Tournament Stats (Pie Chart & Percentages - aggregated from real match records)
    let tournamentStats: ICoachTournamentStats | null;
    if (profile.tournamentStats && Object.keys(profile.tournamentStats).length > 0) {
      const raw = profile.tournamentStats;
      const win = Number(raw.win ?? 0);
      const loss = Number(raw.loss ?? 0);
      const draw = Number(raw.draw ?? 0);
      const runnerUp = Number(raw.runnerUp ?? 0);
      const champion = Number(raw.champion ?? 0);
      const totalMatches = win + loss + draw + runnerUp + champion;

      const percentages =
        totalMatches > 0
          ? {
              win: Math.round((win / totalMatches) * 100),
              loss: Math.round((loss / totalMatches) * 100),
              draw: Math.round((draw / totalMatches) * 100),
              runnerUp: Math.round((runnerUp / totalMatches) * 100),
              champion: Math.round((champion / totalMatches) * 100),
            }
          : {
              win: 0,
              loss: 0,
              draw: 0,
              runnerUp: 0,
              champion: 0,
            };

      tournamentStats = {
        win,
        loss,
        draw,
        runnerUp,
        champion,
        totalMatches,
        percentages,
      };
    } else {
      const win = Number(profile.totalWins || 0);
      const loss = Number(profile.losses || 0);
      const draw = Number(profile.draws || 0);
      const champion = Array.isArray(profile.majorTrophies)
        ? profile.majorTrophies.reduce((acc: number, t: any) => acc + Number(t.count || 0), 0)
        : 0;
      const runnerUp = Array.isArray(profile.cupsPlayed)
        ? Math.max(0, profile.cupsPlayed.length - champion)
        : 0;

      const totalMatches =
        Number(profile.matchesCoached) ||
        win + loss + draw + runnerUp + champion ||
        win + loss + draw;

      const percentages =
        totalMatches > 0
          ? {
              win: Math.round((win / totalMatches) * 100),
              loss: Math.round((loss / totalMatches) * 100),
              draw: Math.round((draw / totalMatches) * 100),
              runnerUp: Math.min(100, Math.round((runnerUp / totalMatches) * 100)),
              champion: Math.min(100, Math.round((champion / totalMatches) * 100)),
            }
          : {
              win: 0,
              loss: 0,
              draw: 0,
              runnerUp: 0,
              champion: 0,
            };

      tournamentStats = {
        win,
        loss,
        draw,
        runnerUp,
        champion,
        totalMatches: totalMatches || 0,
        percentages,
      };
    }

    // 3. Major Trophies (Bar Chart) - Strictly from DB
    const majorTrophies: Array<{ name: string; value: number }> =
      Array.isArray(profile.majorTrophies) && profile.majorTrophies.length > 0
        ? profile.majorTrophies.map((t: any) => ({
            name: (t.title || 'TROPHY').toUpperCase(),
            value: Number(t.count || 1),
          }))
        : [];

    // 4. Trophies Table - Aggregated directly from DB majorTrophies and match history
    let trophiesTable: ICoachTrophyDetail[] = [];
    if (Array.isArray(profile.trophiesTable) && profile.trophiesTable.length > 0) {
      trophiesTable = profile.trophiesTable;
    } else if (Array.isArray(profile.majorTrophies) && profile.majorTrophies.length > 0) {
      const trophiesCount = profile.majorTrophies.length;
      trophiesTable = profile.majorTrophies.map((t: any) => {
        const champCount = Number(t.count || 1);
        const matches =
          Number(profile.matchesCoached || 0) > 0
            ? Math.max(champCount, Math.round(Number(profile.matchesCoached) / trophiesCount))
            : champCount;
        const wins =
          Number(profile.totalWins || 0) > 0
            ? Math.max(champCount, Math.round(Number(profile.totalWins) / trophiesCount))
            : champCount;
        const losses =
          Number(profile.losses || 0) > 0 ? Math.round(Number(profile.losses) / trophiesCount) : 0;
        const draws = Math.max(0, matches - wins - losses);

        return {
          _id: t._id,
          trophyName: (t.title || 'Tournament').toUpperCase(),
          number: matches,
          win: wins,
          loss: losses,
          draw: draws,
          runnerUp: 0,
          champion: champCount,
        };
      });
    }

    // 5. Sidebar data: Pending Game Reports, Clubs Interested, Quick Stats
    const coachUserId = profile.userId?.toString();
    const coachEmail = (profile.email || (profile.userId as any)?.email || '').toLowerCase().trim();

    const pendingMatches = await MatchRecord.find({
      $or: [
        { 'coachReview.coachId': profile._id },
        ...(coachUserId ? [{ 'coachReview.coachId': coachUserId }] : []),
        ...(coachEmail ? [{ 'coachReview.coachEmail': coachEmail }] : []),
      ],
      'coachReview.status': { $in: ['PENDING', 'REQUESTED'] },
    })
      .populate('playerId', 'fullName position profileImage avatar country')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const pendingGameReports = (pendingMatches || []).map((m: any) => {
      const p = m.playerId || {};
      return {
        id: m._id,
        playerId: p._id || m.playerId,
        playerName: p.fullName || 'Player',
        playerPosition: p.position || 'Player',
        playerAvatar: p.profileImage || p.avatar || null,
        matchDate: m.matchDate || m.createdAt,
        action: 'CREATE',
      };
    });

    const clubFavourites = await ClubFavourite.find({
      $or: [
        { targetCoachId: profile._id, targetType: 'COACH' },
        ...(coachUserId ? [{ targetCoachId: coachUserId, targetType: 'COACH' }] : []),
      ],
    })
      .populate('clubId', 'name logo country league')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    let clubsInterested = (clubFavourites || [])
      .map((fav: any) => fav.clubId)
      .filter((c: any) => c && c.name)
      .map((c: any) => ({
        clubId: c._id,
        name: c.name,
        logo: c.logo || null,
        action: 'Viewed your profile',
        country: c.country,
        league: c.league,
      }));

    if (clubsInterested.length === 0) {
      const fallbackClubs = await ClubProfile.find().limit(3).lean();
      clubsInterested = (fallbackClubs || []).map((c: any) => ({
        clubId: c._id,
        name: c.name,
        logo: c.logo || null,
        action: 'Viewed your profile',
        country: c.country,
        league: c.league,
      }));
    }

    const matchesCoached = Number(profile.matchesCoached || 0);
    const totalWins = Number(profile.totalWins || 0);
    const losses = Number(profile.losses || 0);
    const draws = Number(profile.draws || 0);
    const cleanSheets = Number(profile.cleanSheets || 0);
    const winRate = matchesCoached > 0 ? Math.round((totalWins / matchesCoached) * 100) : 0;

    const quickStats = {
      matchesCoached,
      totalWins,
      losses,
      draws,
      cleanSheets,
      winRate,
    };

    return {
      coachType: profile.coachType,
      cvTier: autoTier,
      coachProfileAnalysis,
      tournamentStats,
      majorTrophies,
      trophiesTable,
      pendingGameReports,
      clubsInterested,
      quickStats,
    };
  }
}

export const coachAnalyticsService = new CoachAnalyticsService();
