import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { redisCache } from '@/utils/redisCache.util';
import QueryBuilder from '@/builder/QueryBuilder';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerFullPotential,
  PlayerMentalAnalysis,
  FifaCardStats,
  MatchRecord,
} from '@/modules/player/player.model';

export interface IAnalyticsQueryParams {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  searchTerm?: string;
  search?: string;
  [key: string]: unknown;
}

export class PlayerAnalyticsService {
  /**
   * Get Complete Player Analytics matching the UI design exactly:
   * 1. Top 4 summary cards: Overall Rating, Goals, Assists, Improvement
   * 2. Full Potential radar chart & overall score
   * 3. Mental Analysis radar chart & overall score
   * 4. Skills Analysis (6 categories with circular gauge & sub-skills progress bars)
   * 5. Performance Trend (monthly goals, assists, rating list)
   */
  async getPlayerAnalytics(userIdOrPlayerId: string, query: IAnalyticsQueryParams = {}) {
    let profile: any = null;

    if (Types.ObjectId.isValid(userIdOrPlayerId)) {
      const objId = new Types.ObjectId(userIdOrPlayerId);
      profile = await PlayerProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }

    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    // Cache key for sub-5ms ultra fast responses
    const cacheKey = `CACHE:PLAYER:ANALYTICS:${profile._id}:${JSON.stringify(query)}`;
    const cached = await redisCache.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch all related player data in parallel for optimal performance
    const [attributesDoc, potentialDoc, mentalDoc, fifaCardDoc, allMatches] = await Promise.all([
      PlayerAttributes.findOne({ playerId: profile._id }).lean(),
      PlayerFullPotential.findOne({ playerId: profile._id }).lean(),
      PlayerMentalAnalysis.findOne({ playerId: profile._id }).lean(),
      FifaCardStats.findOne({ playerId: profile._id }).lean(),
      MatchRecord.find({ playerId: profile._id }).sort({ matchDate: -1, createdAt: -1 }).lean(),
    ]);

    const getScoreColor = (score: number): string => {
      if (score >= 80) return '#00FF66';
      if (score >= 60) return '#F59E0B';
      return '#FF2222';
    };

    // Returns the first defined/non-null value. Does NOT skip 50 — 50 is a valid attribute score.
    // Falls back through the list only when a value is undefined or null (i.e., truly absent).
    const pickVal = (primary: any, ...fallbacks: any[]): number => {
      if (primary !== undefined && primary !== null) return Number(primary);
      for (const fb of fallbacks) {
        if (fb !== undefined && fb !== null) return Number(fb);
      }
      return 50;
    };

    // 1. PERFORMANCE TREND (100% Real Monthly Aggregation from MatchRecord — Zero Fake Fallbacks)
    const monthNames = [
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
    const monthFullNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const monthlyMap = new Map<
      string,
      { month: string; monthFull: string; goals: number; assists: number; ratings: number[] }
    >();

    const getEvaluatedMatchRating = (m: any): number => {
      // A review is "pending" only when a coach has actually been assigned and hasn't finished yet.
      // Checking Boolean(m.coachReview) is wrong: the subdocument exists with status 'UNREQUESTED'
      // on every stored document, which would cause all self-reported matches to return 0.
      const hasCoachAssigned = Boolean(m.coachReview?.coachId);
      const coachCompleted = m.coachReview?.status === 'COMPLETED';
      if (hasCoachAssigned && !coachCompleted) {
        return 0;
      }
      const rawR = Number(
        coachCompleted
          ? (m.coachReview?.coachRating ?? m.playerRating ?? 0)
          : (m.playerRating ?? 0),
      );
      return rawR > 10 ? rawR / 10 : rawR;
    };

    allMatches.forEach((m: any) => {
      const dateVal = m.matchDate || m.gameDate || m.createdAt;
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const mShort = monthNames[d.getMonth()];
          const mFull = monthFullNames[d.getMonth()];
          const g = Number(m.goals ?? m.stats?.goalScored ?? 0) || 0;
          const a = Number(m.assists ?? m.stats?.assists ?? 0) || 0;
          const r = getEvaluatedMatchRating(m);

          if (!monthlyMap.has(mKey)) {
            monthlyMap.set(mKey, {
              month: mShort,
              monthFull: mFull,
              goals: 0,
              assists: 0,
              ratings: [],
            });
          }
          const curr = monthlyMap.get(mKey)!;
          curr.goals += g;
          curr.assists += a;
          if (r > 0) curr.ratings.push(r);
        }
      }
    });

    const sortedMonthKeys = Array.from(monthlyMap.keys()).sort();
    const performanceTrend: Array<{
      month: string;
      monthFull: string;
      goals: number;
      assists: number;
      rating: number;
    }> = sortedMonthKeys.slice(-6).map((key) => {
      const item = monthlyMap.get(key)!;
      const avgR =
        item.ratings.length > 0
          ? Math.round((item.ratings.reduce((acc, v) => acc + v, 0) / item.ratings.length) * 10) /
            10
          : 0;
      return {
        month: item.month,
        monthFull: item.monthFull,
        goals: item.goals,
        assists: item.assists,
        rating: avgR,
      };
    });

    // 2. TOP 4 SUMMARY CARDS (100% Real Data — Zero Fake Fallbacks)
    // profile.overallRating always exists (schema default: 50); fall back to FifaCard if 50.
    const overallRating =
      profile.overallRating !== 50
        ? Number(profile.overallRating)
        : Number(fifaCardDoc?.overallRating ?? profile.overallRating);

    const totalGoals = allMatches.reduce(
      (acc: number, m: any) => acc + (Number(m.goals ?? m.stats?.goalScored ?? 0) || 0),
      0,
    );

    const totalAssists = allMatches.reduce(
      (acc: number, m: any) => acc + (Number(m.assists ?? m.stats?.assists ?? 0) || 0),
      0,
    );

    // Real dynamic Improvement calculation:
    // 1) Month-over-month rating change if >= 2 rated months exist
    // 2) Latest vs previous rated match if >= 2 rated matches exist
    // 3) Average of saved monthlyGrowth on potential/mental docs
    // 4) Otherwise 0%
    let improvementPct = 0;
    const ratedMonths = performanceTrend.filter((m) => m.rating > 0);
    if (ratedMonths.length >= 2) {
      const prev = ratedMonths[ratedMonths.length - 2].rating;
      const curr = ratedMonths[ratedMonths.length - 1].rating;
      if (prev > 0) {
        improvementPct = Math.round(((curr - prev) / prev) * 100);
      }
    } else {
      const ratedMatchesAsc = [...allMatches]
        .reverse()
        .map((m: any) => getEvaluatedMatchRating(m))
        .filter((r) => r > 0);

      if (ratedMatchesAsc.length >= 2) {
        const prev = ratedMatchesAsc[ratedMatchesAsc.length - 2];
        const curr = ratedMatchesAsc[ratedMatchesAsc.length - 1];
        if (prev > 0) {
          improvementPct = Math.round(((curr - prev) / prev) * 100);
        }
      } else if (potentialDoc?.monthlyGrowth || mentalDoc?.monthlyGrowth) {
        improvementPct = Math.round(
          ((potentialDoc?.monthlyGrowth ?? 0) + (mentalDoc?.monthlyGrowth ?? 0)) / 2,
        );
      }
    }
    const improvement = improvementPct > 0 ? `+${improvementPct}%` : `${improvementPct}%`;

    const summary = {
      overallRating: {
        value: overallRating,
        label: 'OVERALL RATING',
        icon: 'star',
      },
      goals: {
        value: totalGoals,
        label: 'GOALS',
        icon: 'target',
      },
      assists: {
        value: totalAssists,
        label: 'ASSISTS',
        icon: 'check',
      },
      improvement: {
        value: improvement,
        label: 'IMPROVEMENT',
        icon: 'trend',
      },
    };

    const rawAttrs = (attributesDoc || {}) as Record<string, any>;

    // 3. SKILLS ANALYSIS CORE SCORES (Synced directly with FifaCardStats & PlayerAttributes)
    const pacVal =
      fifaCardDoc?.pac ??
      Math.round((pickVal(rawAttrs.acceleration) + pickVal(rawAttrs.sprintSpeed)) / 2);
    const pasVal =
      fifaCardDoc?.pas ??
      Math.round(
        pickVal(rawAttrs.shortPassing) * 0.4 +
          pickVal(rawAttrs.vision, rawAttrs.shortPassing) * 0.3 +
          pickVal(rawAttrs.longPassing, rawAttrs.shortPassing) * 0.2 +
          pickVal(rawAttrs.crossing, rawAttrs.shortPassing) * 0.1,
      );
    const shoVal =
      fifaCardDoc?.sho ??
      Math.round(
        pickVal(rawAttrs.finishing, rawAttrs.shooting) * 0.4 +
          pickVal(rawAttrs.shotPower, rawAttrs.shooting, rawAttrs.finishing) * 0.3 +
          pickVal(rawAttrs.longShots, rawAttrs.shooting, rawAttrs.finishing) * 0.3,
      );
    const phyVal =
      fifaCardDoc?.phy ??
      Math.round(
        pickVal(rawAttrs.strength, rawAttrs.stamina) * 0.5 +
          pickVal(rawAttrs.stamina, rawAttrs.strength) * 0.3 +
          pickVal(rawAttrs.jumping, rawAttrs.aerialDuels, rawAttrs.aerialAbility) * 0.2,
      );
    const defVal =
      fifaCardDoc?.def ??
      Math.round(
        pickVal(rawAttrs.marking, rawAttrs.oneOnOne, rawAttrs.positioning) * 0.35 +
          pickVal(rawAttrs.standingTackle, rawAttrs.tackling, rawAttrs.oneOnOne) * 0.35 +
          pickVal(rawAttrs.interceptions, rawAttrs.interception, rawAttrs.positioning) * 0.3,
      );
    const driVal =
      fifaCardDoc?.dri ??
      Math.round(
        pickVal(rawAttrs.dribbling, rawAttrs.ballControl) * 0.5 +
          pickVal(rawAttrs.ballControl, rawAttrs.dribbling) * 0.3 +
          pickVal(rawAttrs.agility, rawAttrs.dribbling, rawAttrs.ballControl) * 0.2,
      );

    // 4. FULL POTENTIAL (Physical & Technical Attributes — Synced with Real Attributes)
    const potVision = pickVal(potentialDoc?.vision, rawAttrs.vision, pasVal, rawAttrs.shortPassing);
    const potStrength = pickVal(potentialDoc?.strength, rawAttrs.strength, phyVal);
    const potPace = pickVal(
      potentialDoc?.pace,
      pacVal,
      rawAttrs.sprintSpeed,
      rawAttrs.acceleration,
    );
    const potStamina = pickVal(potentialDoc?.stamina, rawAttrs.stamina, phyVal);
    const potShooting = pickVal(
      potentialDoc?.shooting,
      shoVal,
      rawAttrs.shooting,
      rawAttrs.finishing,
    );
    const potPassing = pickVal(potentialDoc?.passing, pasVal, rawAttrs.shortPassing);

    const calculatedPotentialScore = Math.round(
      (potVision + potStrength + potPace + potStamina + potShooting + potPassing) / 6,
    );
    const potentialScore =
      potentialDoc?.overallPotentialScore !== undefined &&
      potentialDoc?.overallPotentialScore !== null &&
      Number(potentialDoc.overallPotentialScore) !== 50
        ? Number(potentialDoc.overallPotentialScore)
        : calculatedPotentialScore;
    const potentialGrowth = potentialDoc?.monthlyGrowth ?? 0;

    const fullPotential = {
      title: 'FULL POTENTIAL',
      subtitle: 'Physical & Technical Attributes',
      overallScore: potentialScore,
      overallScoreDisplay: `${potentialScore}/100`,
      scoreColor: getScoreColor(potentialScore),
      growth: potentialGrowth,
      growthDisplay: `${potentialGrowth >= 0 ? '↑' : '↓'} ${Math.abs(potentialGrowth)}%`,
      growthDirection: potentialGrowth >= 0 ? 'up' : 'down',
      growthText: 'Growth vs last month',
      radarColor: getScoreColor(potentialScore),
      radarData: [
        { attribute: 'Vision', value: potVision, fullMark: 100 },
        { attribute: 'Strength', value: potStrength, fullMark: 100 },
        { attribute: 'Pace', value: potPace, fullMark: 100 },
        { attribute: 'Stamina', value: potStamina, fullMark: 100 },
        { attribute: 'Shooting', value: potShooting, fullMark: 100 },
        { attribute: 'Passing', value: potPassing, fullMark: 100 },
      ],
      attributes: {
        vision: potVision,
        strength: potStrength,
        pace: potPace,
        stamina: potStamina,
        shooting: potShooting,
        passing: potPassing,
      },
    };

    // 5. MENTAL ANALYSIS (Psychological Performance Metrics — Synced with Real Attributes)
    const mentCreativity = pickVal(
      mentalDoc?.creativity,
      rawAttrs.creativity,
      rawAttrs.vision,
      rawAttrs.decisions,
    );
    const mentLeadership = pickVal(
      mentalDoc?.leadership,
      rawAttrs.leadership,
      rawAttrs.communication,
      rawAttrs.teamwork,
      rawAttrs.decisions,
    );
    const mentConfidence = pickVal(
      mentalDoc?.confidence,
      rawAttrs.composure,
      rawAttrs.composition,
      rawAttrs.decisions,
      rawAttrs.determination,
    );
    const mentComposure = pickVal(
      mentalDoc?.composure,
      rawAttrs.composure,
      rawAttrs.composition,
      rawAttrs.decisions,
    );
    const mentMotivation = pickVal(
      mentalDoc?.motivation,
      rawAttrs.determination,
      rawAttrs.workRate,
      rawAttrs.stamina,
      rawAttrs.decisions,
    );
    const mentFocus = pickVal(
      mentalDoc?.focus,
      rawAttrs.concentration,
      rawAttrs.anticipation,
      rawAttrs.decisions,
    );

    const calculatedMentalScore = Math.round(
      (mentCreativity +
        mentLeadership +
        mentConfidence +
        mentComposure +
        mentMotivation +
        mentFocus) /
        6,
    );
    const mentalScore =
      mentalDoc?.overallMentalScore !== undefined &&
      mentalDoc?.overallMentalScore !== null &&
      Number(mentalDoc.overallMentalScore) !== 50
        ? Number(mentalDoc.overallMentalScore)
        : calculatedMentalScore;
    const mentalGrowth = mentalDoc?.monthlyGrowth ?? 0;

    const mentalAnalysis = {
      title: 'MENTAL ANALYSIS',
      subtitle: 'Psychological Performance Metrics',
      overallScore: mentalScore,
      overallScoreDisplay: `${mentalScore}/100`,
      scoreColor: getScoreColor(mentalScore),
      growth: mentalGrowth,
      growthDisplay: `${mentalGrowth >= 0 ? '↑' : '↓'} ${Math.abs(mentalGrowth)}%`,
      growthDirection: mentalGrowth >= 0 ? 'up' : 'down',
      growthText: 'Growth vs last month',
      radarColor: getScoreColor(mentalScore),
      radarData: [
        { attribute: 'Creativity', value: mentCreativity, fullMark: 100 },
        { attribute: 'Leadership', value: mentLeadership, fullMark: 100 },
        { attribute: 'Confidence', value: mentConfidence, fullMark: 100 },
        { attribute: 'Composure', value: mentComposure, fullMark: 100 },
        { attribute: 'Motivation', value: mentMotivation, fullMark: 100 },
        { attribute: 'Focus', value: mentFocus, fullMark: 100 },
      ],
      attributes: {
        creativity: mentCreativity,
        leadership: mentLeadership,
        confidence: mentConfidence,
        composure: mentComposure,
        motivation: mentMotivation,
        focus: mentFocus,
      },
    };

    // 6. SKILLS ANALYSIS CARDS (Dynamic Colors & Consistent Sub-Skills)
    const subAccel = pickVal(rawAttrs.acceleration, pacVal);
    const subSprint = pickVal(rawAttrs.sprintSpeed, pacVal);
    const subVision = pickVal(rawAttrs.vision, pasVal);
    const subShortPass = pickVal(rawAttrs.shortPassing, pasVal);
    const subLongPass = pickVal(rawAttrs.longPassing, pasVal);
    const subFinishing = pickVal(rawAttrs.finishing, shoVal);
    const subLongShots = pickVal(rawAttrs.longShots, shoVal);
    const subPenalties = pickVal(rawAttrs.penalties, rawAttrs.finishing, shoVal);
    const subStrength = pickVal(rawAttrs.strength, phyVal);
    const subStamina = pickVal(rawAttrs.stamina, phyVal);
    const subJumping = pickVal(
      rawAttrs.jumping,
      rawAttrs.aerialDuels,
      rawAttrs.aerialAbility,
      phyVal,
    );
    const subMarking = pickVal(
      rawAttrs.marking,
      rawAttrs.defensiveAwareness,
      rawAttrs.oneOnOne,
      rawAttrs.positioning,
      defVal,
    );
    const subInterception = pickVal(
      rawAttrs.interceptions,
      rawAttrs.interception,
      rawAttrs.anticipation,
      rawAttrs.positioning,
      defVal,
    );
    const subTackle = pickVal(
      rawAttrs.standingTackle,
      rawAttrs.tackling,
      rawAttrs.oneOnOne,
      defVal,
    );
    const subBalance = pickVal(rawAttrs.balance, rawAttrs.agility, rawAttrs.dribbling, driVal);
    const subAgility = pickVal(rawAttrs.agility, rawAttrs.dribbling, driVal);
    const subBallControl = pickVal(rawAttrs.ballControl, driVal);

    const makeSub = (key: string, name: string, value: number) => ({
      key,
      name,
      value,
      percentage: `${value}%`,
      color: getScoreColor(value),
    });

    const skillsAnalysis = [
      {
        id: 'pace',
        title: 'PACE',
        score: pacVal,
        percentage: `${pacVal}%`,
        color: getScoreColor(pacVal),
        subSkills: [
          makeSub('acceleration', 'ACCELERATION', subAccel),
          makeSub('sprintSpeed', 'SPRINT SPEED', subSprint),
        ],
      },
      {
        id: 'passing',
        title: 'PASSING',
        score: pasVal,
        percentage: `${pasVal}%`,
        color: getScoreColor(pasVal),
        subSkills: [
          makeSub('vision', 'VISION', subVision),
          makeSub('shortPassing', 'SHORT PASS', subShortPass),
          makeSub('longPassing', 'LONG PASS', subLongPass),
        ],
      },
      {
        id: 'shooting',
        title: 'SHOOTING',
        score: shoVal,
        percentage: `${shoVal}%`,
        color: getScoreColor(shoVal),
        subSkills: [
          makeSub('finishing', 'FINISHING', subFinishing),
          makeSub('longShots', 'LONG SHOTS', subLongShots),
          makeSub('penalties', 'PENALTIES', subPenalties),
        ],
      },
      {
        id: 'physical',
        title: 'PHYSICAL',
        score: phyVal,
        percentage: `${phyVal}%`,
        color: getScoreColor(phyVal),
        subSkills: [
          makeSub('strength', 'STRENGTH', subStrength),
          makeSub('stamina', 'STAMINA', subStamina),
          makeSub('jumping', 'JUMPING', subJumping),
        ],
      },
      {
        id: 'defending',
        title: 'DEFENDING',
        score: defVal,
        percentage: `${defVal}%`,
        color: getScoreColor(defVal),
        subSkills: [
          makeSub('marking', 'MARKING', subMarking),
          makeSub('interception', 'INTERCEPTION', subInterception),
          makeSub('tackle', 'TACKLE', subTackle),
        ],
      },
      {
        id: 'dribbling',
        title: 'DRIBBLING',
        score: driVal,
        percentage: `${driVal}%`,
        color: getScoreColor(driVal),
        subSkills: [
          makeSub('balance', 'BALANCE', subBalance),
          makeSub('agility', 'AGILITY', subAgility),
          makeSub('ballControl', 'BALL CONTROL', subBallControl),
        ],
      },
    ];

    // 6. Optional: Paginated & Filtered Match Records using QueryBuilder
    let matchPagination = null;
    let paginatedMatchesList = null;

    if (query.page || query.limit || query.searchTerm || query.search) {
      const matchQuery = new QueryBuilder(
        MatchRecord.find({ playerId: profile._id }),
        query as Record<string, unknown>,
      )
        .search(['awayTeam', 'homeTeam', 'gameType', 'leagueType', 'scoutName'])
        .filter()
        .sort()
        .paginate();

      paginatedMatchesList = await matchQuery.modelQuery.lean();
      matchPagination = await matchQuery.countTotal();
    }

    const result = {
      playerId: profile._id,
      playerInfo: {
        fullName: profile.fullName,
        position: profile.position,
        currentClub: profile.currentClub,
        profileImage: profile.profileImage || null,
        tier: profile.cvTier || 'BRONZE',
      },
      summary,
      fullPotential,
      mentalAnalysis,
      skillsAnalysis,
      performanceTrend,
      ...(matchPagination
        ? {
            matches: paginatedMatchesList,
            meta: {
              page: matchPagination.page,
              limit: matchPagination.limit,
              total: matchPagination.total,
              totalPages: matchPagination.totalPage,
            },
          }
        : {}),
    };

    // Cache result in Redis for 5 minutes (300 seconds)
    await redisCache.set(cacheKey, result, 300);

    return result;
  }

  /**
   * Update Full Potential
   */
  async updateFullPotential(userIdOrPlayerId: string, payload: Record<string, any>) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: userIdOrPlayerId }, { userId: userIdOrPlayerId }],
    });
    if (!profile) throw new AppError(404, 'Player profile not found');

    const existing = await PlayerFullPotential.findOne({ playerId: profile._id }).lean();
    const merged = {
      vision: payload.vision ?? existing?.vision ?? 50,
      strength: payload.strength ?? existing?.strength ?? 50,
      pace: payload.pace ?? existing?.pace ?? 50,
      stamina: payload.stamina ?? existing?.stamina ?? 50,
      shooting: payload.shooting ?? existing?.shooting ?? 50,
      passing: payload.passing ?? existing?.passing ?? 50,
    };
    const updateDoc = { ...payload };
    if (updateDoc.overallPotentialScore === undefined) {
      updateDoc.overallPotentialScore = Math.round(
        (Number(merged.vision) +
          Number(merged.strength) +
          Number(merged.pace) +
          Number(merged.stamina) +
          Number(merged.shooting) +
          Number(merged.passing)) /
          6,
      );
    }

    const updated = await PlayerFullPotential.findOneAndUpdate(
      { playerId: profile._id },
      { $set: updateDoc },
      { new: true, upsert: true },
    );

    await redisCache.delByPattern(`CACHE:PLAYER:ANALYTICS:${profile._id}:*`);
    return updated;
  }

  /**
   * Update Mental Analysis
   */
  async updateMentalAnalysis(userIdOrPlayerId: string, payload: Record<string, any>) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: userIdOrPlayerId }, { userId: userIdOrPlayerId }],
    });
    if (!profile) throw new AppError(404, 'Player profile not found');

    const existing = await PlayerMentalAnalysis.findOne({ playerId: profile._id }).lean();
    const merged = {
      creativity: payload.creativity ?? existing?.creativity ?? 50,
      leadership: payload.leadership ?? existing?.leadership ?? 50,
      confidence: payload.confidence ?? existing?.confidence ?? 50,
      composure: payload.composure ?? existing?.composure ?? 50,
      motivation: payload.motivation ?? existing?.motivation ?? 50,
      focus: payload.focus ?? existing?.focus ?? 50,
    };
    const updateDoc = { ...payload };
    if (updateDoc.overallMentalScore === undefined) {
      updateDoc.overallMentalScore = Math.round(
        (Number(merged.creativity) +
          Number(merged.leadership) +
          Number(merged.confidence) +
          Number(merged.composure) +
          Number(merged.motivation) +
          Number(merged.focus)) /
          6,
      );
    }

    const updated = await PlayerMentalAnalysis.findOneAndUpdate(
      { playerId: profile._id },
      { $set: updateDoc },
      { new: true, upsert: true },
    );

    await redisCache.delByPattern(`CACHE:PLAYER:ANALYTICS:${profile._id}:*`);
    return updated;
  }
}

export const playerAnalyticsService = new PlayerAnalyticsService();
