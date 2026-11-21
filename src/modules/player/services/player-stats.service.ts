import { Types } from 'mongoose';
import {
  calculatePositionRating,
  formatCardPosition,
  normalizePositionKey,
  PositionKey,
  resolvePositionAttributeValue,
} from '@/utils/ratingCalculator';
import { IPlayerProfile } from '../player.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  MatchRecord,
  FifaCardStats,
  PlayerMedia,
} from '../player.model';
import { UserModel } from '@/modules/user/user.model';
import { Media } from '@/modules/media/media.model';
import { playerCacheService } from './player-cache.service';

export const computeProfileCompletion = (
  profile: Partial<IPlayerProfile>,
  hasAttributes = false,
  hasMediaVideo = false,
): number => {
  const fields = [
    profile.fullName,
    profile.position,
    profile.age,
    profile.dateOfBirth,
    profile.country,
    profile.preferredFoot,
    profile.profileImage,
    profile.highlightVideo || (hasMediaVideo ? true : undefined),
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
  async recalculatePlayerStats(
    profileId: Types.ObjectId | string,
    options?: { preserveMarketValue?: boolean },
  ) {
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

    // 2. Get match records (for career totals & card tier checklist)
    const matches = await MatchRecord.find({ playerId: profile._id });
    const matchCount = matches.length;
    let totalGoals = 0;
    let totalAssists = 0;

    if (matchCount > 0) {
      totalGoals = matches.reduce((acc, m) => acc + (m.goals || 0), 0);
      totalAssists = matches.reduce((acc, m) => acc + (m.assists || 0), 0);
    }

    // 3. Overall rating strictly equals the Excel Position Overall (keeps Dashboard, Public CV, and Cards 100% consistent)
    profile.overallRating = Math.min(100, Math.max(0, positionRating));

    // 4. Query media counts (both PlayerMedia & general Media) for completion & Tier calculation
    const [playerVideoCount, playerPhotoCount, generalVideoCount, generalPhotoCount] =
      await Promise.all([
        PlayerMedia.countDocuments({ playerId: profile._id, mediaType: 'VIDEO' }).catch(() => 0),
        PlayerMedia.countDocuments({ playerId: profile._id, mediaType: 'IMAGE' }).catch(() => 0),
        Media.countDocuments({
          $or: [{ playerId: profile._id }, { userId: profile.userId }],
          mediaType: 'VIDEO',
        }).catch(() => 0),
        Media.countDocuments({
          $or: [{ playerId: profile._id }, { userId: profile.userId }],
          mediaType: 'IMAGE',
        }).catch(() => 0),
      ]);
    const totalVideos =
      Math.max(playerVideoCount, generalVideoCount) + (profile.highlightVideo ? 1 : 0);
    const totalPhotos =
      Math.max(playerPhotoCount, generalPhotoCount) + (profile.profileImage ? 1 : 0);

    // 5. Compute profileCompletion (any uploaded Media video satisfies the highlightVideo requirement)
    const rawProfile = typeof profile.toObject === 'function' ? profile.toObject() : profile;
    const completion = computeProfileCompletion(rawProfile, hasAttributes, totalVideos > 0);
    profile.profileCompletion = completion;

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

    // 6. Compute marketValue only if not manually specified
    if (!options?.preserveMarketValue && (!profile.marketValue || profile.marketValue <= 0)) {
      const hasAgent =
        String(profile.agentStatus || '')
          .toUpperCase()
          .includes('REPRESENTED') &&
        !String(profile.agentStatus || '')
          .toUpperCase()
          .includes('UNREPRESENTED');
      const hasClub =
        (String(profile.clubStatus || '')
          .toUpperCase()
          .includes('SIGNED') ||
          Boolean(profile.currentClub && profile.currentClub.trim())) &&
        !String(profile.clubStatus || '')
          .toUpperCase()
          .includes('WITHOUT');

      if (hasAgent || hasClub) {
        const ageBonus = Math.max(0, (30 - (profile.age || 20)) * 1000);
        profile.marketValue = Math.round(
          profile.overallRating * 2000 + totalGoals * 5000 + totalAssists * 3000 + ageBonus,
        );
      } else {
        profile.marketValue = 0;
      }
    }

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

    const normPos: PositionKey = normalizePositionKey(profile.position || 'CM');
    const attrMap = attributes
      ? ((typeof attributes.toObject === 'function' ? attributes.toObject() : attributes) as Record<
          string,
          any
        >)
      : null;

    const POSITION_CARD_STAT_KEYS: Record<
      PositionKey,
      { pac: string[]; sho: string[]; pas: string[]; dri: string[]; def: string[]; phy: string[] }
    > = {
      GK: {
        pac: ['reflexes', 'shotStopping'],
        sho: ['handling', 'crossClaiming'],
        pas: ['distribution', 'footwork'],
        dri: ['reflexes', 'oneOnOne'],
        def: ['footwork', 'aerialAbility'],
        phy: ['positioning', 'decisions', 'composure'],
      },
      CB: {
        pac: [],
        sho: [],
        pas: ['shortPassing'],
        dri: ['ballControl'],
        def: ['positioning', 'marking', 'tackling', 'interceptions', 'defensiveAwareness'],
        phy: ['strength', 'aerialDuels'],
      },
      'RB-LB': {
        pac: ['acceleration', 'sprintSpeed'],
        sho: [],
        pas: ['crossing', 'shortPassing'],
        dri: ['ballControl'],
        def: ['positioning', 'oneOnOne', 'tackling', 'interceptions'],
        phy: ['stamina'],
      },
      'RWB-LWB': {
        pac: ['acceleration', 'sprintSpeed'],
        sho: [],
        pas: ['crossing', 'shortPassing'],
        dri: ['dribbling', 'ballControl'],
        def: ['oneOnOne', 'positioning'],
        phy: ['stamina'],
      },
      CDM: {
        pac: [],
        sho: [],
        pas: ['shortPassing', 'longPassing', 'vision'],
        dri: ['ballControl'],
        def: ['positioning', 'interceptions', 'tackling', 'defensiveAwareness'],
        phy: ['stamina'],
      },
      CM: {
        pac: [],
        sho: [],
        pas: ['shortPassing', 'longPassing', 'vision'],
        dri: ['firstTouch', 'ballControl'],
        def: ['interceptions'],
        phy: ['stamina'],
      },
      CAM: {
        pac: [],
        sho: ['finishing'],
        pas: ['shortPassing', 'throughPassing', 'vision', 'creativity'],
        dri: ['firstTouch', 'ballControl', 'dribbling'],
        def: [],
        phy: [],
      },
      'RW-LW': {
        pac: ['acceleration', 'sprintSpeed'],
        sho: ['finishing'],
        pas: ['crossing', 'chanceCreation'],
        dri: ['dribbling', 'ballControl', 'agility', 'firstTouch', 'oneOnOneAttacking'],
        def: [],
        phy: [],
      },
      CF: {
        pac: [],
        sho: ['finishing', 'shooting'],
        pas: ['shortPassing', 'linkUpPlay'],
        dri: ['firstTouch', 'ballControl', 'dribbling'],
        def: [],
        phy: ['strength'],
      },
      ST: {
        pac: ['acceleration'],
        sho: ['finishing', 'shotAccuracy', 'oneOnOneFinishing'],
        pas: [],
        dri: ['firstTouch'],
        def: [],
        phy: ['strength', 'aerialAbility'],
      },
    };

    const computeCardCategoryStat = (primaryKeys: string[], fallbackKeys: string[]): number => {
      if (!attrMap) return profile.overallRating || 50;
      const activeVals: number[] = [];
      const usedKeys = new Set<string>();

      for (const k of primaryKeys) {
        activeVals.push(resolvePositionAttributeValue(k, attrMap));
        usedKeys.add(k);
      }

      for (const k of fallbackKeys) {
        if (usedKeys.has(k)) continue;
        const rawV = attrMap[k];
        if (rawV !== undefined && rawV !== null && Number(rawV) !== 50) {
          activeVals.push(Number(rawV));
          usedKeys.add(k);
        }
      }

      if (activeVals.length === 0) {
        const baseVals = fallbackKeys
          .map((k) => attrMap[k])
          .filter((v) => v !== undefined && v !== null)
          .map(Number);
        if (baseVals.length === 0) return 50;
        return Math.round(baseVals.reduce((a, b) => a + b, 0) / baseVals.length);
      }

      return Math.round(activeVals.reduce((a, b) => a + b, 0) / activeVals.length);
    };

    const posCardKeys = POSITION_CARD_STAT_KEYS[normPos];
    const isGK = normPos === 'GK';

    const pacVal = computeCardCategoryStat(
      posCardKeys.pac,
      isGK ? ['reflexes', 'shotStopping'] : ['acceleration', 'sprintSpeed'],
    );
    const shoVal = computeCardCategoryStat(
      posCardKeys.sho,
      isGK ? ['handling', 'crossClaiming'] : ['finishing', 'shotPower', 'longShots'],
    );
    const pasVal = computeCardCategoryStat(
      posCardKeys.pas,
      isGK ? ['distribution', 'footwork'] : ['shortPassing', 'vision', 'longPassing', 'crossing'],
    );
    const driVal = computeCardCategoryStat(
      posCardKeys.dri,
      isGK ? ['reflexes', 'oneOnOne'] : ['dribbling', 'ballControl', 'agility'],
    );
    const defVal = computeCardCategoryStat(
      posCardKeys.def,
      isGK ? ['footwork', 'aerialAbility'] : ['marking', 'standingTackle', 'interceptions'],
    );
    const phyVal = computeCardCategoryStat(
      posCardKeys.phy,
      isGK ? ['positioning', 'decisions'] : ['strength', 'stamina', 'jumping'],
    );

    await FifaCardStats.findOneAndUpdate(
      { playerId: profile._id },
      {
        overallRating: profile.overallRating,
        position: formatCardPosition(profile.position),
        pac: pacVal,
        sho: shoVal,
        pas: pasVal,
        dri: driVal,
        def: defVal,
        phy: phyVal,
        cardImage: profile.cardImage || profile.cardPhoto || profile.profileImage || '',
        cardPhoto: profile.cardPhoto || profile.cardImage || profile.profileImage || '',
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

    // Exclude non-player roles from pitch position counts
    const nonPlayerUsers = await UserModel.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'COACH', 'AGENT', 'ACADEMY', 'PARENT', 'GUARDIAN'] },
    })
      .select('_id')
      .lean();
    const excludedUserIds = nonPlayerUsers.map((u) => u._id);
    filter.userId = { $nin: excludedUserIds };

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
