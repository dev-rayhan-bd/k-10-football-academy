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

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class CoachAnalyticsService {
  async getCoachAnalytics(coachIdentifier: string): Promise<ICoachAnalyticsResponse> {
    let profile: any = null;
    if (Types.ObjectId.isValid(coachIdentifier)) {
      const objId = new Types.ObjectId(coachIdentifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      }).populate('userId', 'email avatar');
    }

    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }

    const coachUser: any = profile.userId || {};
    const coachUserId = (coachUser._id || profile.userId)?.toString();

    // Real media counts and formations for accurate tier and completion calculation
    const [picturesCount, videosCount, formationCount] = await Promise.all([
      Media.countDocuments({ coachId: profile._id, mediaType: 'IMAGE' }).catch(() => 0),
      Media.countDocuments({ coachId: profile._id, mediaType: 'VIDEO' }).catch(() => 0),
      TacticalFormation.countDocuments({ coachId: profile._id }).catch(() => 0),
    ]);

    const { completionPercentage, autoTier } = computeCoachProfileCompletion(
      profile,
      coachUser.avatar,
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

    // 2. Tournament Stats (pie chart). Stored values when present, else the coach's own totals.
    let win: number;
    let loss: number;
    let draw: number;
    let runnerUp: number;
    let champion: number;
    let totalMatches: number;

    if (profile.tournamentStats && Object.keys(profile.tournamentStats).length > 0) {
      const raw = profile.tournamentStats;
      win = Number(raw.win ?? 0);
      loss = Number(raw.loss ?? 0);
      draw = Number(raw.draw ?? 0);
      runnerUp = Number(raw.runnerUp ?? 0);
      champion = Number(raw.champion ?? 0);
      totalMatches = win + loss + draw + runnerUp + champion;
    } else {
      win = Number(profile.totalWins || 0);
      loss = Number(profile.losses || 0);
      draw = Number(profile.draws || 0);
      champion = Array.isArray(profile.majorTrophies)
        ? profile.majorTrophies.reduce((acc: number, t: any) => acc + Number(t.count ?? 0), 0)
        : 0;
      // Runner-up finishes are not recorded anywhere, so they are not guessed.
      runnerUp = 0;
      totalMatches = Number(profile.matchesCoached || 0) || win + loss + draw;
    }

    // All slices share one denominator so the percentages add up to ~100.
    const sliceTotal = win + loss + draw + runnerUp + champion;
    const pct = (v: number) => (sliceTotal > 0 ? Math.round((v / sliceTotal) * 100) : 0);
    const tournamentStats: ICoachTournamentStats | null = {
      win,
      loss,
      draw,
      runnerUp,
      champion,
      totalMatches,
      percentages: {
        win: pct(win),
        loss: pct(loss),
        draw: pct(draw),
        runnerUp: pct(runnerUp),
        champion: pct(champion),
      },
    };

    // 3. Major Trophies (Bar Chart) - Strictly from DB
    const majorTrophies: Array<{ name: string; value: number }> = Array.isArray(
      profile.majorTrophies,
    )
      ? profile.majorTrophies.map((t: any) => ({
          name: String(t.title || '').toUpperCase(),
          value: Number(t.count ?? 0),
        }))
      : [];

    // 4. Trophies Table - stored table, else stored trophy counts only
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

    // 5. Pending Game Reports addressed to this coach (by profile id, user id, or either email)
    const coachEmails = Array.from(
      new Set(
        [coachUser.email, profile.email]
          .map((e: any) =>
            String(e || '')
              .toLowerCase()
              .trim(),
          )
          .filter(Boolean),
      ),
    );

    const pendingMatches = await MatchRecord.find({
      $or: [
        { 'coachReview.coachId': profile._id },
        ...(coachUserId ? [{ 'coachReview.coachId': coachUserId }] : []),
        ...coachEmails.map((e) => ({
          'coachReview.coachEmail': { $regex: `^${escapeRegex(e)}$`, $options: 'i' },
        })),
      ],
      'coachReview.status': 'PENDING',
      // Only paid reports can be evaluated (same rule as the coach Game Reports list)
      'coachReview.paymentStatus': 'PAID',
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
        matchDate: m.matchDate || null,
        requestedAt: m.createdAt,
        action: 'CREATE',
      };
    });

    // 6. Clubs Interested: a favourite is the only recorded signal (profile views are not tracked)
    const clubFavourites = await ClubFavourite.find({
      targetType: 'COACH',
      targetCoachId: { $in: [profile._id, ...(coachUserId ? [coachUserId] : [])] },
    })
      .populate('clubId', 'name logo country league')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const seenClubs = new Set<string>();
    const clubsInterested = (clubFavourites || [])
      .filter((fav: any) => fav.clubId && fav.clubId.name)
      .filter((fav: any) => {
        const key = fav.clubId._id.toString();
        if (seenClubs.has(key)) return false;
        seenClubs.add(key);
        return true;
      })
      .map((fav: any) => ({
        clubId: fav.clubId._id,
        name: fav.clubId.name,
        logo: fav.clubId.logo || null,
        action: 'Added you to favourites',
        country: fav.clubId.country,
        league: fav.clubId.league,
        favouritedAt: fav.createdAt,
      }));

    // 7. Quick Stats (stored values)
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
