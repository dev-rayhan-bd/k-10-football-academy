import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import {
  ICoachAnalyticsResponse,
  ICoachProfileAnalysis,
  ICoachTournamentStats,
  ICoachTrophyDetail,
} from '../coach.interface';
import { CoachProfile, TacticalFormation } from '../coach.model';
import { computeCoachProfileCompletion } from './coach-cv.service';
import { Media } from '@/modules/media/media.model';
import { MatchRecord } from '@/modules/player/player.model';
import { ClubFavourite } from '@/modules/club/club.model';

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

    // 1. Radar Profile Analysis: stored values only (no derived/invented scores).
    const rawAnalysis = profile.coachProfileAnalysis || {};
    const coachProfileAnalysis: ICoachProfileAnalysis | null = {
      tactics: Number(rawAnalysis.tactics ?? 0),
      leadership: Number(rawAnalysis.leadership ?? 0),
      communication: Number(rawAnalysis.communication ?? 0),
      adaptability: Number(rawAnalysis.adaptability ?? 0),
      discipline: Number(rawAnalysis.discipline ?? 0),
      development: Number(rawAnalysis.development ?? 0),
      overall: Number(rawAnalysis.overall ?? 0),
    };

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
      // Runner-up finishes are not recorded anywhere, so they are not guessed.
      const runnerUp = 0;
      const totalMatches = Number(profile.matchesCoached) || win + loss + draw;

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
            name: String(t.title || '').toUpperCase(),
            value: Number(t.count ?? 0),
          }))
        : [];

    // 4. Trophies Table - Aggregated directly from DB majorTrophies and match history
    let trophiesTable: ICoachTrophyDetail[] = [];
    if (Array.isArray(profile.trophiesTable) && profile.trophiesTable.length > 0) {
      trophiesTable = profile.trophiesTable;
    } else if (Array.isArray(profile.majorTrophies) && profile.majorTrophies.length > 0) {
      // Per-tournament win/loss/draw is not recorded; only the stored title count is real.
      trophiesTable = profile.majorTrophies.map((t: any) => ({
        _id: t._id,
        trophyName: String(t.title || '').toUpperCase(),
        number: Number(t.count ?? 0),
        win: 0,
        loss: 0,
        draw: 0,
        runnerUp: 0,
        champion: Number(t.count ?? 0),
      }));
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
        playerName: p.fullName || '',
        playerPosition: p.position || '',
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

    const clubsInterested = (clubFavourites || [])
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
