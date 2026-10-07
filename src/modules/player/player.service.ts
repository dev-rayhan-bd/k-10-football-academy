import { AppError } from '@/utils/AppError';
import { calculatePositionRating, calculateMatchPerformance } from '@/utils/ratingCalculator';
import { Types } from 'mongoose';
import { IPlayerProfile, IPlayerAttributes, IMatchRecord } from './player.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
  MatchRecord,
  PlayerMedia,
} from './player.model';
import { ParentMatchReport } from '../parent/parent.model';

const computeProfileCompletion = (
  profile: Partial<IPlayerProfile>,
  hasAttributes = false,
): number => {
  const fields = [
    profile.fullName,
    profile.position,
    profile.age,
    profile.dateOfBirth,
    profile.country,
    profile.preferredFoot,
    profile.profileImage,
    profile.highlightVideo,
    profile.height,
    profile.weight,
    profile.currentClub,
    hasAttributes ? true : undefined,
  ];
  const filledCount = fields.filter(
    (val) => val !== undefined && val !== null && val !== '',
  ).length;
  return Math.round((filledCount / fields.length) * 100);
};

export class PlayerService {
  async recalculatePlayerStats(profileId: Types.ObjectId | string) {
    const profile = await PlayerProfile.findById(profileId);
    if (!profile) return;

    // 1. Get attributes rating
    const attributes = await PlayerAttributes.findOne({ playerId: profile._id });
    let positionRating = profile.overallRating || 50;
    let hasAttributes = false;

    if (attributes) {
      hasAttributes = true;
      const rawAttributes =
        typeof attributes.toObject === 'function' ? attributes.toObject() : attributes;
      const attrObj = rawAttributes as unknown as Record<string, number>;
      positionRating = calculatePositionRating(profile.position || 'CM', attrObj);
    }

    // 2. Get match records
    const matches = await MatchRecord.find({ playerId: profile._id });
    const matchCount = matches.length;
    let totalGoals = 0;
    let totalAssists = 0;
    let avgMatchRating = 0;

    if (matchCount > 0) {
      const sumRating = matches.reduce((acc, m) => acc + (m.playerRating || 50), 0);
      totalGoals = matches.reduce((acc, m) => acc + (m.goals || 0), 0);
      totalAssists = matches.reduce((acc, m) => acc + (m.assists || 0), 0);
      avgMatchRating = sumRating / matchCount;
    }

    // 3. Compute overall rating
    let finalOverall = positionRating;
    if (matchCount > 0) {
      finalOverall = Math.round(positionRating * 0.7 + avgMatchRating * 0.3);
    }
    profile.overallRating = Math.min(100, Math.max(0, finalOverall));

    // 4. Compute cvTier
    if (profile.overallRating >= 80 || profile.isVerifiedByCoach) {
      profile.cvTier = 'GOLD';
    } else if (profile.overallRating >= 65 || matchCount >= 3) {
      profile.cvTier = 'SILVER';
    } else {
      profile.cvTier = 'BRONZE';
    }

    // 5. Compute marketValue
    const ageBonus = Math.max(0, (30 - (profile.age || 20)) * 1000);
    profile.marketValue = Math.round(
      profile.overallRating * 2000 + totalGoals * 5000 + totalAssists * 3000 + ageBonus,
    );

    // 6. Compute profileCompletion
    const rawProfile = typeof profile.toObject === 'function' ? profile.toObject() : profile;
    profile.profileCompletion = computeProfileCompletion(rawProfile, hasAttributes);

    await profile.save();

    await FifaCardStats.findOneAndUpdate(
      { playerId: profile._id },
      { overallRating: profile.overallRating, position: profile.position },
      { upsert: true },
    );

    return profile;
  }

  async createProfile(payload: Partial<IPlayerProfile>) {
    const existing = await PlayerProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Player profile already exists for this user');
    }
    payload.profileCompletion = computeProfileCompletion(payload, false);
    const profile = await PlayerProfile.create(payload);

    // Initialize default sub-records
    await PlayerAttributes.create({ playerId: profile._id });
    await PlayerMentalAnalysis.create({ playerId: profile._id });
    await PlayerFullPotential.create({ playerId: profile._id });
    await FifaCardStats.create({
      playerId: profile._id,
      overallRating: profile.overallRating || 50,
      position: profile.position,
    });

    const updatedProfile = await this.recalculatePlayerStats(profile._id);

    return updatedProfile || profile;
  }

  async getProfileById(id: string) {
    let profile = null;
    if (Types.ObjectId.isValid(id)) {
      profile = await PlayerProfile.findOne({
        $or: [{ _id: id }, { userId: id }],
      }).populate('userId', 'name email avatar phone');
    }
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    const playerId = profile._id;

    // Fetch Attributes for Radar Chart
    const attributes = await PlayerAttributes.findOne({ playerId });

    // Fetch Match Records for Game Reports & Stats
    const matchRecords = await MatchRecord.find({ playerId }).sort({ matchDate: -1 });

    const totalMatches = matchRecords.length;
    const totalGoals = matchRecords.reduce((sum, match) => sum + (match.goals || 0), 0);
    const totalAssists = matchRecords.reduce((sum, match) => sum + (match.assists || 0), 0);

    // Get the latest 3 game reports for the UI list
    const recentMatches = matchRecords.slice(0, 3).map((match) => ({
      _id: match._id,
      title: match.awayTeam ? `vs ${match.awayTeam}` : 'Match Report',
      rating: match.playerRating || 0,
      date: match.matchDate,
      file: match.reportPdfUrl || null,
    }));

    // Fetch Professional Coach Reports (ParentMatchReport)
    const professionalReports = await ParentMatchReport.find({ childPlayerId: playerId })
      .sort({ matchDate: -1 })
      .limit(10);
    const mappedProfessionalReports = professionalReports.map((report) => ({
      _id: report._id,
      title: `Requested from Coach`,
      rating: report.coachRating || 'N/A',
      amount: report.coachReviewPrice ? `$${report.coachReviewPrice}` : 'FREE',
      date: report.matchDate,
      status:
        report.coachReviewStatus === 'PENDING'
          ? 'Pending'
          : report.coachReviewStatus === 'EVALUATED'
            ? 'Completed'
            : 'N/A',
      action: report.coachReviewStatus === 'PENDING' ? 'Waiting...' : 'View',
    }));

    return {
      ...profile.toObject(),
      attributes,
      performanceStats: {
        matches: totalMatches,
        goals: totalGoals,
        assists: totalAssists,
        reports: mappedProfessionalReports.length, // Professional reports count
      },
      recentMatches,
      professionalReports: mappedProfessionalReports,
    };
  }

  async getProfileByUserId(userId: string) {
    const profile = await PlayerProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      throw new AppError(404, 'Player profile not found for user');
    }
    return profile;
  }

  async getAllProfiles(filter: Record<string, unknown> = {}) {
    return PlayerProfile.find(filter).populate('userId', 'name email avatar');
  }

  async updateProfile(id: string, payload: Partial<IPlayerProfile>) {
    const existing = await PlayerProfile.findOne({ $or: [{ _id: id }, { userId: id }] });
    if (!existing) {
      throw new AppError(404, 'Player profile not found');
    }
    const profile = await PlayerProfile.findOneAndUpdate({ _id: existing._id }, payload, {
      new: true,
      runValidators: true,
    });

    if (profile) {
      const updatedProfile = await this.recalculatePlayerStats(profile._id);
      return updatedProfile || profile;
    }

    return profile;
  }

  async updateAttributes(playerId: string, payload: Partial<IPlayerAttributes>) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });

    if (!profile) {
      throw new AppError(404, 'Player profile not found. Please create a player profile first.');
    }

    const attributes = await PlayerAttributes.findOneAndUpdate({ playerId: profile._id }, payload, {
      new: true,
      upsert: true,
      runValidators: true,
    });

    await this.recalculatePlayerStats(profile._id);

    return attributes;
  }

  async getAttributes(playerId: string) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });

    if (!profile) {
      throw new AppError(404, 'Player profile not found. Please create a player profile first.');
    }

    const attributes = await PlayerAttributes.findOne({ playerId: profile._id });
    if (!attributes) {
      throw new AppError(404, 'Player attributes not found');
    }
    return attributes;
  }

  async addMatchRecord(payload: Partial<IMatchRecord>) {
    let targetProfile = null;
    if (payload.playerId) {
      targetProfile = await PlayerProfile.findOne({
        $or: [{ _id: payload.playerId }, { userId: payload.playerId }],
      });

      if (!targetProfile) {
        throw new AppError(404, 'Player profile not found. Please create a player profile first.');
      }

      payload.playerId = targetProfile._id as unknown as Types.ObjectId;

      if (payload.minutesPlayed && payload.events && payload.events.length > 0) {
        const position = targetProfile.position || 'CM';

        const perfResult = calculateMatchPerformance(
          position,
          payload.minutesPlayed,
          payload.events,
        );

        payload.playerRating = perfResult.overallRating;
        payload.positivePoints = perfResult.positivePoints;
        payload.negativePoints = perfResult.negativePoints;
        payload.netContribution = perfResult.netContribution;
        payload.interpretation = perfResult.interpretation;
        payload.categoryScores = perfResult.categoryAdjustedScores;
      }
    }

    const record = await MatchRecord.create(payload);

    if (targetProfile) {
      await this.recalculatePlayerStats(targetProfile._id);
    }

    return record;
  }

  async getMatchRecordsByPlayerId(playerId: string) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    const targetPlayerId = profile ? profile._id : playerId;

    return MatchRecord.find({ playerId: targetPlayerId }).sort({ matchDate: -1 });
  }

  async uploadHighlightVideo(
    playerId: string,
    mediaUrl?: string,
    _thumbnailUrl?: string,
    _title?: string,
  ) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });

    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    if (mediaUrl) {
      profile.highlightVideo = mediaUrl;
      await profile.save();
      const updated = await this.recalculatePlayerStats(profile._id);
      return updated || profile;
    }

    return profile;
  }

  async uploadMediaGallery(
    playerId: string,
    mediaUrl: string,
    thumbnailUrl?: string,
    title?: string,
  ) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });

    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    const isImage =
      mediaUrl.includes('/image/upload/') || mediaUrl.match(/\.(jpeg|jpg|gif|png)$/i) != null;
    const mediaType = isImage ? 'IMAGE' : 'VIDEO';

    const newMedia = await PlayerMedia.create({
      playerId: profile._id,
      url: mediaUrl,
      title: title || 'Untitled Media',
      mediaType,
      thumbnailUrl,
    });

    return newMedia;
  }

  async getMediaGallery(playerId: string, page = 1, limit = 10) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    const targetId = profile ? profile._id : playerId;

    const skip = (page - 1) * limit;

    const media = await PlayerMedia.find({ playerId: targetId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await PlayerMedia.countDocuments({ playerId: targetId });

    return {
      media,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const playerService = new PlayerService();
