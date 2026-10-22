import { Types } from 'mongoose';
import { calculatePositionRating } from '@/utils/ratingCalculator';
import { IPlayerProfile } from '../player.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  MatchRecord,
  FifaCardStats,
  PlayerMedia,
} from '../player.model';
import { UserModel } from '@/modules/user/user.model';
import { playerCacheService } from './player-cache.service';

export const computeProfileCompletion = (
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

export const computePlayerCardTier = (params: {
  completion: number;
  overallRating: number;
  matchCount: number;
  videoCount: number;
  photoCount: number;
  isUpdatedRecently: boolean;
  isCoachValidated: boolean;
}): {
  cvTier: 'GOLD' | 'SILVER' | 'BRONZE';
  tierChecklist: {
    is100Complete: boolean;
    videoCount: number;
    matchCount: number;
    photoCount: number;
    isUpdatedRecently: boolean;
    isCoachValidated: boolean;
    overallRating: number;
    unlockedTier: 'GOLD' | 'SILVER' | 'BRONZE';
  };
} => {
  const {
    completion,
    overallRating,
    matchCount,
    videoCount,
    photoCount,
    isUpdatedRecently,
    isCoachValidated,
  } = params;

  const is100 = completion >= 100;

  // 🥇 GOLD: 100% complete, >=10 videos, >=10 match reports, >=10 photos, updated in 3 months, coach validated, score 81-99
  if (
    is100 &&
    videoCount >= 10 &&
    matchCount >= 10 &&
    photoCount >= 10 &&
    isUpdatedRecently &&
    isCoachValidated &&
    overallRating >= 81 &&
    overallRating <= 99
  ) {
    return {
      cvTier: 'GOLD',
      tierChecklist: { ...params, is100Complete: is100, unlockedTier: 'GOLD' },
    };
  }

  // 🥈 SILVER: 100% complete, >=5 videos, >=5 match reports, >=5 photos, updated in 3 months, coach validated, score 71-80
  if (
    is100 &&
    videoCount >= 5 &&
    matchCount >= 5 &&
    photoCount >= 5 &&
    isUpdatedRecently &&
    isCoachValidated &&
    overallRating >= 71 &&
    overallRating <= 80
  ) {
    return {
      cvTier: 'SILVER',
      tierChecklist: { ...params, is100Complete: is100, unlockedTier: 'SILVER' },
    };
  }

  // 🥉 BRONZE: 100% complete, >=3 videos, >=3 match reports, >=3 photos, updated in 3 months, coach validated, score 50-70
  if (
    is100 &&
    videoCount >= 3 &&
    matchCount >= 3 &&
    photoCount >= 3 &&
    isUpdatedRecently &&
    isCoachValidated &&
    overallRating >= 50 &&
    overallRating <= 70
  ) {
    return {
      cvTier: 'BRONZE',
      tierChecklist: { ...params, is100Complete: is100, unlockedTier: 'BRONZE' },
    };
  }

  // Base tier is strictly BRONZE if conditions are not fulfilled
  return {
    cvTier: 'BRONZE',
    tierChecklist: { ...params, is100Complete: is100, unlockedTier: 'BRONZE' },
  };
};

export class PlayerStatsService {
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
      const sumRating = matches.reduce((acc, m) => {
        const r = m.playerRating ?? 5.0;
        const normalized100 = r <= 10 ? r * 10 : r;
        return acc + normalized100;
      }, 0);
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

    // 4. Compute profileCompletion
    const rawProfile = typeof profile.toObject === 'function' ? profile.toObject() : profile;
    const completion = computeProfileCompletion(rawProfile, hasAttributes);
    profile.profileCompletion = completion;

    // 5. Query media counts & verification for Tier calculation
    const [videoCount, photoCount] = await Promise.all([
      PlayerMedia.countDocuments({ playerId: profile._id, mediaType: 'VIDEO' }).catch(() => 0),
      PlayerMedia.countDocuments({ playerId: profile._id, mediaType: 'IMAGE' }).catch(() => 0),
    ]);
    const totalVideos = videoCount + (profile.highlightVideo ? 1 : 0);
    const totalPhotos = photoCount + (profile.profileImage ? 1 : 0);

    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const isUpdatedRecently = !profile.updatedAt || new Date(profile.updatedAt) >= threeMonthsAgo;
    const isCoachValidated = Boolean(
      profile.isVerifiedByCoach || profile.coachVerification?.isVerified,
    );

    const { cvTier } = computePlayerCardTier({
      completion,
      overallRating: profile.overallRating,
      matchCount,
      videoCount: totalVideos,
      photoCount: totalPhotos,
      isUpdatedRecently,
      isCoachValidated,
    });
    profile.cvTier = cvTier;

    // 6. Compute marketValue
    const ageBonus = Math.max(0, (30 - (profile.age || 20)) * 1000);
    profile.marketValue = Math.round(
      profile.overallRating * 2000 + totalGoals * 5000 + totalAssists * 3000 + ageBonus,
    );

    if (!profile.dateOfBirth) {
      const userDoc = await UserModel.findById(profile.userId).select('dateOfBirth');
      if (userDoc?.dateOfBirth) {
        profile.dateOfBirth = userDoc.dateOfBirth;
      }
    }
    if (!profile.age && profile.dateOfBirth) {
      const birthYear = new Date(profile.dateOfBirth).getFullYear();
      profile.age = new Date().getFullYear() - birthYear;
    }

    await profile.save({ validateModifiedOnly: true });

    await FifaCardStats.findOneAndUpdate(
      { playerId: profile._id },
      { overallRating: profile.overallRating, position: profile.position },
      { upsert: true },
    );

    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return profile;
  }
}

export const playerStatsService = new PlayerStatsService();
