import { Types } from 'mongoose';
import { calculatePositionRating } from '@/utils/ratingCalculator';
import { IPlayerProfile } from '../player.interface';
import { PlayerProfile, PlayerAttributes, MatchRecord, FifaCardStats } from '../player.model';
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

    // Fallback for legacy records missing DOB or age
    if (!profile.dateOfBirth) {
      const userDoc = await UserModel.findById(profile.userId).select('dateOfBirth');
      profile.dateOfBirth = userDoc?.dateOfBirth || new Date('2006-01-01');
    }
    if (!profile.age) {
      const birthYear = profile.dateOfBirth ? new Date(profile.dateOfBirth).getFullYear() : 2006;
      profile.age = new Date().getFullYear() - birthYear || 18;
    }
    if (!profile.country) {
      profile.country = 'Bangladesh';
    }

    // 6. Compute profileCompletion
    const rawProfile = typeof profile.toObject === 'function' ? profile.toObject() : profile;
    profile.profileCompletion = computeProfileCompletion(rawProfile, hasAttributes);

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
