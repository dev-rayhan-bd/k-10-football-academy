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
    if (profile.dateOfBirth) {
      const birthDate = new Date(profile.dateOfBirth);
      if (!isNaN(birthDate.getTime())) {
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        profile.age = Math.max(0, calculatedAge);
      }
    }

    await profile.save({ validateModifiedOnly: true });

    await FifaCardStats.findOneAndUpdate(
      { playerId: profile._id },
      {
        overallRating: profile.overallRating,
        position: profile.position,
        pac: attributes
          ? Math.round(
              (Number((attributes as any).acceleration ?? (profile.overallRating || 50)) +
                Number((attributes as any).sprintSpeed ?? (profile.overallRating || 50))) /
                2,
            )
          : profile.overallRating || 50,
        sho: attributes
          ? Math.round(
              Number((attributes as any).finishing ?? (profile.overallRating || 50)) * 0.4 +
                Number((attributes as any).shotPower ?? (profile.overallRating || 50)) * 0.3 +
                Number((attributes as any).longShots ?? (profile.overallRating || 50)) * 0.3,
            )
          : profile.overallRating || 50,
        pas: attributes
          ? Math.round(
              Number((attributes as any).shortPassing ?? (profile.overallRating || 50)) * 0.4 +
                Number((attributes as any).vision ?? (profile.overallRating || 50)) * 0.3 +
                Number((attributes as any).longPassing ?? (profile.overallRating || 50)) * 0.2 +
                Number((attributes as any).crossing ?? (profile.overallRating || 50)) * 0.1,
            )
          : profile.overallRating || 50,
        dri: attributes
          ? Math.round(
              Number((attributes as any).dribbling ?? (profile.overallRating || 50)) * 0.5 +
                Number((attributes as any).ballControl ?? (profile.overallRating || 50)) * 0.3 +
                Number((attributes as any).agility ?? (profile.overallRating || 50)) * 0.2,
            )
          : profile.overallRating || 50,
        def: attributes
          ? Math.round(
              Number((attributes as any).marking ?? (profile.overallRating || 50)) * 0.35 +
                Number(
                  (attributes as any).standingTackle ??
                    (attributes as any).tackling ??
                    (profile.overallRating || 50),
                ) *
                  0.35 +
                Number((attributes as any).interceptions ?? (profile.overallRating || 50)) * 0.3,
            )
          : profile.overallRating || 50,
        phy: attributes
          ? Math.round(
              Number((attributes as any).strength ?? (profile.overallRating || 50)) * 0.5 +
                Number((attributes as any).stamina ?? (profile.overallRating || 50)) * 0.3 +
                Number((attributes as any).jumping ?? (profile.overallRating || 50)) * 0.2,
            )
          : profile.overallRating || 50,
      },
      { upsert: true },
    );

    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return profile;
  }

  /**
   * 3. Platform Public Overview Stats (Powers Home Page & Services Page)
   */
  async getPlatformPublicStats() {
    const [realPlayers, realCoaches, realClubs, realAgents, realCountries, realMatches] =
      await Promise.all([
        UserModel.countDocuments({ role: 'PLAYER' }),
        UserModel.countDocuments({ role: 'COACH' }),
        UserModel.countDocuments({ role: 'CLUB' }),
        UserModel.countDocuments({ role: 'AGENT' }),
        PlayerProfile.distinct('country'),
        MatchRecord.countDocuments(),
      ]);

    const formatCount = (n: number, defaultDisplay: string): string => {
      if (!n || n < 10) return defaultDisplay;
      if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M+`;
      if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K+`;
      return `${n}+`;
    };

    return {
      homeStats: {
        players: {
          count: realPlayers,
          display: formatCount(realPlayers, '50K+'),
          label: 'Players',
        },
        coaches: {
          count: realCoaches,
          display: formatCount(realCoaches, '2.5K+'),
          label: 'Coaches',
        },
        clubs: {
          count: realClubs,
          display: formatCount(realClubs, '850+'),
          label: 'Clubs',
        },
        scouts: {
          count: realAgents,
          display: formatCount(realAgents, '12K+'),
          label: 'Scouts',
        },
      },
      servicesStats: {
        activePlayers: {
          count: realPlayers,
          display: formatCount(realPlayers, '50K+'),
          label: 'Active Players',
        },
        professionalScouts: {
          count: realAgents,
          display: formatCount(realAgents, '2,000+'),
          label: 'Professional Scouts',
        },
        countries: {
          count: realCountries.length,
          display: formatCount(realCountries.length, '150+'),
          label: 'Countries',
        },
        matchReports: {
          count: realMatches,
          display: formatCount(realMatches, '1M+'),
          label: 'Match Reports',
        },
      },
    };
  }

  /**
   * 4. CVs Page Analytics & Formation Pitch Breakdown (Powers Analysis CVs Page)
   */
  async getCvAnalysisStats(query: Record<string, any> = {}) {
    const filter: Record<string, any> = {};

    if (query.cvTier || query.category) {
      filter.cvTier = query.cvTier || query.category;
    }
    if (query.country) {
      filter.country = { $regex: String(query.country).trim(), $options: 'i' };
    }
    if (query.search || query.searchTerm) {
      const regex = { $regex: String(query.search || query.searchTerm).trim(), $options: 'i' };
      filter.$or = [
        { fullName: regex },
        { position: regex },
        { country: regex },
        { currentClub: regex },
      ];
    }

    const ageRange = query.ageRange || query.ageGroup;
    if (ageRange && typeof ageRange === 'string') {
      const parts = ageRange.split('-');
      if (parts.length === 2) {
        const min = Number(parts[0].trim());
        const max = Number(parts[1].trim());
        if (!isNaN(min) && !isNaN(max)) {
          filter.age = { $gte: min, $lte: max };
        }
      } else if (ageRange.includes('+')) {
        const min = Number(ageRange.replace('+', '').trim());
        if (!isNaN(min)) {
          filter.age = { $gte: min };
        }
      }
    }

    const allProfiles = await PlayerProfile.find(filter)
      .select('fullName position age country overallRating cvTier')
      .lean();

    const byPosition: Record<string, number> = {};
    ALL_PITCH_POSITIONS.forEach((pos) => {
      byPosition[pos] = 0;
    });

    const countryMap = new Map();
    const ageBuckets = {
      under18: 0,
      age18to21: 0,
      age22to25: 0,
      age26plus: 0,
    };

    allProfiles.forEach((p) => {
      const pitchPos = mapToPitchPosition(p.position);
      byPosition[pitchPos] = (byPosition[pitchPos] || 0) + 1;

      const c = (p.country || 'Unknown').trim();
      countryMap.set(c, (countryMap.get(c) || 0) + 1);

      const a = p.age ?? 18;
      if (a < 18) ageBuckets.under18++;
      else if (a <= 21) ageBuckets.age18to21++;
      else if (a <= 25) ageBuckets.age22to25++;
      else ageBuckets.age26plus++;
    });

    const total = allProfiles.length;

    const byNationality = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    const byAge = [
      {
        label: 'Under 18',
        min: 0,
        max: 17,
        count: ageBuckets.under18,
        percentage: total > 0 ? Math.round((ageBuckets.under18 / total) * 100) : 0,
      },
      {
        label: '18-21',
        min: 18,
        max: 21,
        count: ageBuckets.age18to21,
        percentage: total > 0 ? Math.round((ageBuckets.age18to21 / total) * 100) : 0,
      },
      {
        label: '22-25',
        min: 22,
        max: 25,
        count: ageBuckets.age22to25,
        percentage: total > 0 ? Math.round((ageBuckets.age22to25 / total) * 100) : 0,
      },
      {
        label: '26+',
        min: 26,
        max: 99,
        count: ageBuckets.age26plus,
        percentage: total > 0 ? Math.round((ageBuckets.age26plus / total) * 100) : 0,
      },
    ];

    return {
      totalPlayers: total,
      byPosition,
      byNationality,
      byAge,
    };
  }
}

export const ALL_PITCH_POSITIONS = [
  'GK',
  'LWB',
  'LB',
  'CB',
  'RB',
  'RWB',
  'CDM',
  'CM',
  'CAM',
  'LM',
  'RM',
  'LW',
  'RW',
  'LF',
  'CF',
  'RF',
  'ST',
];

export const mapToPitchPosition = (pos?: string): string => {
  if (!pos) return 'CM';
  const clean = pos.toUpperCase().trim();
  if (clean === 'GK' || clean.includes('GOAL') || clean.includes('KEEPER')) return 'GK';
  if (clean === 'LWB') return 'LWB';
  if (clean === 'RWB') return 'RWB';
  if (clean === 'LB' || clean.includes('LEFT BACK') || clean.includes('LEFT-BACK')) return 'LB';
  if (clean === 'RB' || clean.includes('RIGHT BACK') || clean.includes('RIGHT-BACK')) return 'RB';
  if (
    clean === 'CB' ||
    clean.includes('CENTER BACK') ||
    clean.includes('CENTRE BACK') ||
    clean === 'DEF' ||
    clean.includes('DEFEND')
  )
    return 'CB';
  if (clean === 'CDM' || clean.includes('DEFENSIVE MID')) return 'CDM';
  if (clean === 'CAM' || clean.includes('ATTACKING MID')) return 'CAM';
  if (clean === 'LM' || clean.includes('LEFT MID')) return 'LM';
  if (clean === 'RM' || clean.includes('RIGHT MID')) return 'RM';
  if (clean === 'CM' || clean.includes('MID')) return 'CM';
  if (clean === 'LW' || clean.includes('LEFT WING')) return 'LW';
  if (clean === 'RW' || clean.includes('RIGHT WING')) return 'RW';
  if (clean === 'LF' || clean.includes('LEFT FORWARD')) return 'LF';
  if (clean === 'RF' || clean.includes('RIGHT FORWARD')) return 'RF';
  if (clean === 'CF' || clean.includes('CENTER FORWARD') || clean.includes('CENTRE FORWARD'))
    return 'CF';
  if (clean === 'ST' || clean.includes('STRIKER') || clean === 'FWD' || clean.includes('FORWARD'))
    return 'ST';
  return 'CM';
};

export const playerStatsService = new PlayerStatsService();
