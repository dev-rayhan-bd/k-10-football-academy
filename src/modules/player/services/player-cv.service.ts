import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { redisCache } from '@/utils/redisCache.util';
import { PlayerProfile, PlayerAttributes } from '../player.model';
import { ClubProfile } from '@/modules/club/club.model';
import { UserModel } from '@/modules/user/user.model';
import {
  normalizePositionKey,
  POSITION_ATTRIBUTE_COEFFICIENTS,
  getInterpretationScore,
  formatAttributeLabel,
  formatMarketValue,
} from '@/utils/ratingCalculator';
import { playerAttributeService } from './player-attribute.service';

export class PlayerCvService {
  async getProfileById(id: string, viewer?: { userId?: string; role?: string }): Promise<any> {
    let matchStage: any;
    let cacheKey: string | null;

    if ((id === 'me' || id === 'my-profile') && viewer?.userId) {
      matchStage = { userId: new Types.ObjectId(viewer.userId) };
      cacheKey = `CACHE:PLAYER:PROFILE:USER:${viewer.userId}`;
    } else if (Types.ObjectId.isValid(id)) {
      const objId = new Types.ObjectId(id);
      matchStage = { $or: [{ _id: objId }, { userId: objId }] };
      cacheKey = `CACHE:PLAYER:PROFILE:${id}`;
    } else {
      throw new AppError(404, 'Player profile not found');
    }

    // 1. Try to fetch from Redis Cache (Sub-5ms ultra fast response)
    if (cacheKey) {
      const cached = await redisCache.get<any>(cacheKey);
      if (cached) {
        // Track club viewing asynchronously without blocking response
        if (viewer && viewer.role === 'CLUB' && viewer.userId && cached._id) {
          ClubProfile.findOne({ userId: viewer.userId })
            .lean()
            .then((club) => {
              if (club) {
                const alreadyListed = cached.clubsInterested?.some(
                  (c: any) => c.clubName.toLowerCase() === club.name.toLowerCase(),
                );
                if (!alreadyListed) {
                  PlayerProfile.updateOne(
                    { _id: cached._id },
                    {
                      $push: {
                        clubsInterested: {
                          $each: [
                            { clubName: club.name, logoUrl: club.logo || '', viewedAt: new Date() },
                          ],
                          $position: 0,
                        },
                      },
                      $inc: { profileViews: 1 },
                    },
                  )
                    .exec()
                    .catch(() => {});
                }
              }
            })
            .catch(() => {});
        }
        return cached;
      }
    }

    // High performance Single-Pass Aggregation pipeline replacing populate & multiple queries
    const [aggregatedProfile] = await PlayerProfile.aggregate([
      { $match: matchStage },
      // 1. $lookup user info (fast, non-blocking lookup)
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, email: 1, avatar: 1, phone: 1 } }],
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
      // 2. $lookup player attributes in the same query
      {
        $lookup: {
          from: 'playerattributes',
          localField: '_id',
          foreignField: 'playerId',
          as: 'attributesDoc',
        },
      },
      {
        $unwind: {
          path: '$attributesDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      // 3. $lookup match records in the same pipeline (sorted desc)
      {
        $lookup: {
          from: 'matchrecords',
          let: { pId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$playerId', '$$pId'] } } },
            { $sort: { matchDate: -1 } },
          ],
          as: 'matchRecords',
        },
      },
      // 4. $lookup professional coach reports (limit 10)
      {
        $lookup: {
          from: 'parentmatchreports',
          let: { pId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$childPlayerId', '$$pId'] } } },
            { $sort: { matchDate: -1 } },
            { $limit: 10 },
          ],
          as: 'professionalReports',
        },
      },
    ]);

    const currentAggregated = aggregatedProfile;
    if (!currentAggregated) {
      const searchUserId =
        (id === 'me' || id === 'my-profile') && viewer?.userId
          ? viewer.userId
          : Types.ObjectId.isValid(id)
            ? id
            : null;

      if (searchUserId) {
        const user = await UserModel.findById(searchUserId);
        if (user) {
          const newProfile = await PlayerProfile.create({
            userId: user._id,
            fullName: user.name || 'New Player',
            position: user.position || 'Forward',
            age: user.age || 18,
            country: user.country || 'Bangladesh',
            profileImage: user.avatar || '',
          });
          await PlayerAttributes.findOneAndUpdate(
            { playerId: newProfile._id },
            { playerId: newProfile._id },
            { upsert: true, new: true },
          );
          return this.getProfileById(newProfile._id.toString(), viewer);
        }
      }
      throw new AppError(404, 'Player profile not found');
    }

    const aggregatedProfileToUse = currentAggregated;
    const playerId = aggregatedProfileToUse._id;

    // Track profile view & club interest asynchronously without blocking the response
    if (viewer && viewer.role === 'CLUB' && viewer.userId) {
      ClubProfile.findOne({ userId: viewer.userId })
        .lean()
        .then((club) => {
          if (club) {
            const alreadyListed = aggregatedProfile.clubsInterested?.some(
              (c: any) => c.clubName.toLowerCase() === club.name.toLowerCase(),
            );
            if (!alreadyListed) {
              PlayerProfile.updateOne(
                { _id: playerId },
                {
                  $push: {
                    clubsInterested: {
                      $each: [
                        { clubName: club.name, logoUrl: club.logo || '', viewedAt: new Date() },
                      ],
                      $position: 0,
                    },
                  },
                  $inc: { profileViews: 1 },
                },
              )
                .exec()
                .catch(() => {});
            }
          }
        })
        .catch(() => {});
    }

    // Format Attributes
    const formattedAttributes = aggregatedProfile.attributesDoc
      ? playerAttributeService.formatCategorizedAttributes(aggregatedProfile.attributesDoc)
      : null;

    // Calculate 6 Category Averages for Radar & Skills Donut
    let categoryAverages = {
      Technical: 50,
      Tactical: 50,
      Physical: 50,
      Mental: 50,
      Attacking: 50,
      Defending: 50,
    };
    let skillsDonutScore = 50;

    if (formattedAttributes && formattedAttributes.categories) {
      const calcAvg = (cat: Record<string, number>) => {
        const vals = Object.values(cat).filter((v) => typeof v === 'number');
        if (vals.length === 0) return 50;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      };

      categoryAverages = {
        Technical: calcAvg(formattedAttributes.categories.technical),
        Tactical: calcAvg(formattedAttributes.categories.tactical),
        Physical: calcAvg(formattedAttributes.categories.physical),
        Mental: calcAvg(formattedAttributes.categories.mental),
        Attacking: calcAvg(formattedAttributes.categories.attacking),
        Defending: calcAvg(formattedAttributes.categories.defending),
      };

      const avgVals = Object.values(categoryAverages);
      skillsDonutScore = Math.round(avgVals.reduce((a, b) => a + b, 0) / avgVals.length);
    }

    // Top Key Positional Attributes based on client's Excel weights
    const normPos = normalizePositionKey(aggregatedProfile.position || 'CM');
    const posCoefficients = POSITION_ATTRIBUTE_COEFFICIENTS[normPos] || {};
    const sortedCoeffs = Object.entries(posCoefficients).sort((a, b) => b[1] - a[1]);

    const rawAttrDoc = aggregatedProfile.attributesDoc || {};
    const keyAttributes = sortedCoeffs.slice(0, 5).map(([attrKey, weight]) => {
      let val = rawAttrDoc[attrKey];
      if (val === undefined) {
        if (attrKey === 'attPosition')
          val = rawAttrDoc.attPosition ?? rawAttrDoc.attackingPositioning;
        else if (attrKey === 'decisions') val = rawAttrDoc.decisions ?? rawAttrDoc.decisionMaking;
        else if (attrKey === 'composure') val = rawAttrDoc.composure ?? rawAttrDoc.composition;
        else if (attrKey === 'tackling') val = rawAttrDoc.tackling ?? rawAttrDoc.standingTackle;
        else if (attrKey === 'interceptions')
          val = rawAttrDoc.interceptions ?? rawAttrDoc.interception;
        else if (attrKey === 'aerialAbility')
          val = rawAttrDoc.aerialAbility ?? rawAttrDoc.aerialDuels ?? rawAttrDoc.heading;
        else if (attrKey === 'oneOnOne') val = rawAttrDoc.oneOnOne ?? rawAttrDoc.standingTackle;
        else val = 50;
      }
      val = val ?? 50;
      return {
        key: attrKey,
        label: formatAttributeLabel(attrKey),
        value: val,
        weight: Math.round(weight * 100),
      };
    });

    // Foot Dominance
    const prefFoot = aggregatedProfile.preferredFoot || 'RIGHT';
    const rightFoot =
      aggregatedProfile.rightFootDominance ??
      (prefFoot === 'LEFT' ? 25 : prefFoot === 'BOTH' ? 50 : 80);
    const leftFoot = aggregatedProfile.leftFootDominance ?? 100 - rightFoot;
    const footDonut = {
      right: rightFoot,
      left: leftFoot,
      preferredFoot: prefFoot,
    };

    // Fast memory aggregation for match metrics
    const matchRecords: any[] = aggregatedProfile.matchRecords || [];
    const totalMatches = matchRecords.length;
    let totalGoals = 0;
    let totalAssists = 0;
    let totalPasses = 0;
    let totalPassAccSum = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let sumNormalizedRatings = 0;

    for (let i = 0; i < totalMatches; i++) {
      const m = matchRecords[i];
      totalGoals += m.goals || 0;
      totalAssists += m.assists || 0;
      totalPasses += m.passes || 0;
      totalPassAccSum += m.passAccuracy || 0;
      if (m.result === 'W') wins++;
      else if (m.result === 'D') draws++;
      else if (m.result === 'L') losses++;
      const r = m.playerRating ?? 6.0;
      sumNormalizedRatings += r <= 10 ? r * 10 : r;
    }

    const avgPassAccuracy = totalMatches > 0 ? Math.round(totalPassAccSum / totalMatches) : 0;
    const avgMatchRating =
      totalMatches > 0 ? Math.round((sumNormalizedRatings / totalMatches) * 10) / 100 : 6.0;
    const formGuide = matchRecords
      .slice(0, 5)
      .map((m) => m.result)
      .reverse();

    const recentMatches = matchRecords.slice(0, 4).map((match) => {
      const r = match.playerRating ?? 6.0;
      const r10 = r > 10 ? Math.round((r / 10) * 10) / 10 : Math.round(r * 10) / 10;
      const r100 = r <= 10 ? Math.round(r * 10) : Math.round(r);

      let catRatings = match.categoryRatings;
      if (catRatings instanceof Map) {
        catRatings = Object.fromEntries(catRatings);
      } else if (!catRatings && match.categoryScores) {
        const scores =
          match.categoryScores instanceof Map
            ? Object.fromEntries(match.categoryScores)
            : match.categoryScores;
        catRatings = {};
        for (const [k, v] of Object.entries(scores)) {
          catRatings[k] = Math.min(100, Math.max(0, Math.round(50 + (Number(v) || 0))));
        }
      }

      return {
        _id: match._id,
        title: match.awayTeam ? `vs ${match.awayTeam}` : 'Match Report',
        matchDate: match.matchDate,
        date: match.matchDate,
        leagueType: match.leagueType,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        result: match.result,
        location: match.location || 'Home Ground',
        playerRating: r10,
        rating: r10,
        rating10: r10,
        rating100: r100,
        interpretation: match.interpretation || getInterpretationScore(r100),
        categoryRatings: catRatings || {
          Attack: 50,
          Passing: 50,
          Possession: 50,
          Defending: 50,
          Discipline: 50,
          Goalkeeping: 50,
        },
        goals: match.goals ?? 0,
        assists: match.assists ?? 0,
        passes: match.passes ?? 0,
        passAccuracy: match.passAccuracy ?? 0,
        minutesPlayed: match.minutesPlayed ?? 0,
        file: match.reportPdfUrl || null,
        reportPdfUrl: match.reportPdfUrl || null,
        isVerified: true,
      };
    });

    const professionalReports: any[] = aggregatedProfile.professionalReports || [];
    const mappedProfessionalReports = professionalReports.map((report) => ({
      _id: report._id,
      title: 'Requested from Coach',
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

    const userObj = aggregatedProfile.user || {};
    const userPhone = userObj.phone || '';
    const userEmail = userObj.email || '';
    const profileViews = aggregatedProfile.profileViews ?? 0;
    const totalLikes = aggregatedProfile.totalLikes ?? 0;
    const calculatedReports = totalMatches + mappedProfessionalReports.length;
    const totalReportsCount =
      aggregatedProfile.reports !== undefined &&
      aggregatedProfile.reports !== null &&
      aggregatedProfile.reports > 0
        ? aggregatedProfile.reports
        : calculatedReports;

    const overallRating = aggregatedProfile.overallRating ?? 50;
    const overallInterpretation = getInterpretationScore(overallRating);

    const profileObj = { ...aggregatedProfile };
    delete profileObj.reports;
    delete profileObj.totalReports;
    delete profileObj.user;
    delete profileObj.attributesDoc;
    delete profileObj.matchRecords;
    delete profileObj.professionalReports;

    const rawAgentStatus =
      aggregatedProfile.agentStatus ||
      aggregatedProfile.playerEvaluation?.agentStatus ||
      'UNREPRESENTED';
    const normAgent = String(rawAgentStatus).toUpperCase();
    const hasAgent = normAgent.includes('REPRESENTED') && !normAgent.includes('UNREPRESENTED');

    const rawClubStatus =
      aggregatedProfile.clubStatus ||
      aggregatedProfile.playerEvaluation?.clubStatus ||
      'WITHOUT_CLUB';
    const normClub = String(rawClubStatus).toUpperCase();
    const hasClub =
      (normClub.includes('SIGNED') ||
        Boolean(aggregatedProfile.currentClub && aggregatedProfile.currentClub.trim())) &&
      !normClub.includes('WITHOUT');

    const canSpecifyMarketValue = hasAgent || hasClub;
    const marketValNumber = canSpecifyMarketValue ? Number(aggregatedProfile.marketValue ?? 0) : 0;
    const mvObj = formatMarketValue(marketValNumber);

    const playerEvaluation = {
      agentStatus: hasAgent ? 'REPRESENTED' : 'UNREPRESENTED',
      agentStatusLabel: hasAgent ? 'Represented by an agent' : 'Unrepresented (no agent)',
      hasAgent,
      agentName: aggregatedProfile.agentName || aggregatedProfile.playerEvaluation?.agentName || '',
      agencyName:
        aggregatedProfile.agencyName || aggregatedProfile.playerEvaluation?.agencyName || '',
      clubStatus: hasClub ? 'SIGNED' : 'WITHOUT_CLUB',
      clubStatusLabel: hasClub ? 'Signed to a club' : 'Without a club',
      hasClub,
      currentClub: aggregatedProfile.currentClub || '',
      contractUntil: aggregatedProfile.contractUntil || null,
      marketValue: marketValNumber,
      marketValueFormatted: mvObj.formatted,
      canSpecifyMarketValue,
    };

    const finalProfile = {
      ...profileObj,
      playerId: aggregatedProfile._id,
      agentStatus: playerEvaluation.agentStatus,
      clubStatus: playerEvaluation.clubStatus,
      playerEvaluation,
      marketValue: marketValNumber,
      marketValueFormatted: mvObj.formatted,
      phone: userPhone,
      email: userEmail,
      overallRating,
      interpretation: overallInterpretation,
      preferredFoot: prefFoot,
      rightFootDominance: rightFoot,
      leftFootDominance: leftFoot,
      footDonut,
      website: aggregatedProfile.website || '',
      playerStyles: aggregatedProfile.playerStyles || [],
      languages: aggregatedProfile.languages || [],
      accomplishments: aggregatedProfile.accomplishments || [],
      clubLogo:
        aggregatedProfile.clubLogo ||
        aggregatedProfile.clubHistory?.find((c: any) => c.isCurrent)?.logoUrl ||
        '',
      clubHistory: aggregatedProfile.clubHistory || [],
      positionMap: aggregatedProfile.positionMap || [],
      futsalMap: aggregatedProfile.futsalMap || [],
      transferStatus: aggregatedProfile.transferStatus || {
        status: 'Active',
        contractUntil: aggregatedProfile.contractUntil || null,
        agentName: '',
        agencyName: '',
      },
      coachVerification: aggregatedProfile.coachVerification || {
        isVerified: aggregatedProfile.isVerifiedByCoach || false,
        coachName: '',
        licenseNumber: '',
        clubManaged: '',
        verifiedAt: null,
      },
      perceptionMetrics: aggregatedProfile.perceptionMetrics || {
        spaceAwareness: { score: 85, trend: 0, grade: 'GOOD' },
        opponentReading: { score: 85, trend: 0, grade: 'GOOD' },
        gameFlowUnderstanding: { score: 85, trend: 0, grade: 'GOOD' },
        pressureHandling: { score: 85, trend: 0, grade: 'GOOD' },
      },
      visionMetrics: aggregatedProfile.visionMetrics || {
        visionField: { score: 85, trend: 0, grade: 'GOOD' },
        targetFinding: { score: 85, trend: 0, grade: 'GOOD' },
      },
      overviewStats: {
        profileViews,
        totalLikes,
        reports: totalReportsCount,
      },
      totalReports: totalReportsCount,
      attributes: formattedAttributes,
      categoryAverages,
      skillsDonutScore,
      keyAttributes,
      performanceStats: {
        matches: totalMatches,
        goals: totalGoals,
        assists: totalAssists,
        reports: totalReportsCount,
      },
      matchSummary: {
        totalMatches,
        totalGoals,
        totalAssists,
        totalPasses,
        avgPassAccuracy,
        wins,
        draws,
        losses,
        formGuide,
        avgMatchRating,
      },
      recentMatches,
      professionalReports: mappedProfessionalReports,
    };

    // Cache profile in Redis for both profileId and userId across PROFILE & CV keys (TTL: 5 minutes = 300s)
    await redisCache.set(`CACHE:PLAYER:PROFILE:${playerId}`, finalProfile, 300);
    await redisCache.set(`CACHE:PLAYER:CV:${playerId}`, finalProfile, 300);
    if (aggregatedProfile.userId) {
      const uId = aggregatedProfile.userId.toString();
      await redisCache.set(`CACHE:PLAYER:PROFILE:${uId}`, finalProfile, 300);
      await redisCache.set(`CACHE:PLAYER:PROFILE:USER:${uId}`, finalProfile, 300);
      await redisCache.set(`CACHE:PLAYER:CV:${uId}`, finalProfile, 300);
      await redisCache.set(`CACHE:PLAYER:CV:USER:${uId}`, finalProfile, 300);
    }

    return finalProfile;
  }

  async getCVProfile(id: string, viewer?: { userId?: string; role?: string }) {
    let cacheKey: string | null = null;
    if ((id === 'me' || id === 'my-cv' || id === 'my-profile') && viewer?.userId) {
      cacheKey = `CACHE:PLAYER:CV:USER:${viewer.userId}`;
    } else if (Types.ObjectId.isValid(id)) {
      cacheKey = `CACHE:PLAYER:CV:${id}`;
    }

    if (cacheKey) {
      const cached = await redisCache.get<any>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    return this.getProfileById(id, viewer);
  }

  async getProfileByUserId(userId: string) {
    return this.getProfileById(userId);
  }

  async addClubInterest(playerId: string, data: { clubName: string; logoUrl?: string }) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    profile.clubsInterested = profile.clubsInterested || [];
    profile.clubsInterested.unshift({
      clubName: data.clubName,
      logoUrl: data.logoUrl,
      viewedAt: new Date(),
    });
    profile.profileViews = (profile.profileViews || 0) + 1;
    await profile.save();

    return profile.clubsInterested;
  }
}

export const playerCvService = new PlayerCvService();
