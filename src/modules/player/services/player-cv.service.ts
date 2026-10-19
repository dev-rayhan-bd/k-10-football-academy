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
  calculateMetricGrade,
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
      // 3. $lookup fifa card stats
      {
        $lookup: {
          from: 'fifacardstats',
          localField: '_id',
          foreignField: 'playerId',
          as: 'fifaCardDoc',
        },
      },
      {
        $unwind: {
          path: '$fifaCardDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      // 4. $lookup match records in the same pipeline (sorted desc)
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

    // Complete Positional Co-efficients list for UI (screenshots 1 & 2)
    const posAttributeKeySet = new Set<string>();
    const positionalCoefficientsList: Array<{
      key: string;
      label: string;
      value: number;
      score: number;
      grade: string;
      weight?: number;
    }> = [];

    // 1. Add position-weighted coefficients
    sortedCoeffs.forEach(([attrKey, weight]) => {
      let val = rawAttrDoc[attrKey];
      if (val === undefined || val === null) {
        if (attrKey === 'attPosition')
          val = rawAttrDoc.attPosition ?? rawAttrDoc.attackingPositioning;
        else if (attrKey === 'decisions') val = rawAttrDoc.decisions ?? rawAttrDoc.decisionMaking;
        else if (attrKey === 'composure' || attrKey === 'composition')
          val = rawAttrDoc.composition ?? rawAttrDoc.composure;
        else if (attrKey === 'tackling') val = rawAttrDoc.tackling ?? rawAttrDoc.standingTackle;
        else if (attrKey === 'interceptions')
          val = rawAttrDoc.interceptions ?? rawAttrDoc.interception;
        else if (attrKey === 'aerialAbility')
          val = rawAttrDoc.aerialAbility ?? rawAttrDoc.aerialDuels ?? rawAttrDoc.heading;
        else if (attrKey === 'oneOnOne') val = rawAttrDoc.oneOnOne ?? rawAttrDoc.standingTackle;
        else val = 88;
      }
      val = val !== undefined && val !== null ? Number(val) : 88;
      posAttributeKeySet.add(attrKey);
      positionalCoefficientsList.push({
        key: attrKey,
        label: formatAttributeLabel(attrKey),
        value: val,
        score: val,
        grade: calculateMetricGrade(val),
        weight: Math.round(weight * 100),
      });
    });

    // 2. Add base UI categories if not already added to ensure comprehensive list
    const baseScreenshotKeys = [
      'ballControl',
      'dribbling',
      'shortPassing',
      'longPassing',
      'crossing',
      'shooting',
      'finishing',
      'longShots',
      'positioning',
      'vision',
      'anticipation',
      'composure',
    ];

    for (const key of baseScreenshotKeys) {
      if (!posAttributeKeySet.has(key)) {
        let val = rawAttrDoc[key];
        if (val === undefined || val === null) {
          if (key === 'composure') val = rawAttrDoc.composition ?? rawAttrDoc.composure;
          else if (key === 'shooting') val = rawAttrDoc.shooting ?? rawAttrDoc.finishing;
        }
        val = val !== undefined && val !== null ? Number(val) : 88;
        posAttributeKeySet.add(key);
        positionalCoefficientsList.push({
          key,
          label: formatAttributeLabel(key),
          value: val,
          score: val,
          grade: calculateMetricGrade(val),
          weight: Math.round(((posCoefficients[key] as number) || 0.05) * 100),
        });
      }
    }

    // Foot Dominance
    const prefFoot = aggregatedProfile.preferredFoot || 'RIGHT';
    const rightFoot =
      aggregatedProfile.rightFootDominance ??
      (prefFoot === 'LEFT' ? 25 : prefFoot === 'BOTH' ? 50 : 80);
    const leftFoot = aggregatedProfile.leftFootDominance ?? 100 - rightFoot;
    const headingScore = rawAttrDoc.heading ?? rawAttrDoc.headingAccuracy ?? 70;
    const footOverallScore = Math.round((rightFoot + leftFoot + headingScore) / 3);

    const footDonut = {
      overall: footOverallScore,
      percentage: `${footOverallScore}%`,
      right: rightFoot,
      rightFoot,
      left: leftFoot,
      leftFoot,
      heading: headingScore,
      preferredFoot: prefFoot,
    };

    const technicalOverall = categoryAverages.Technical ?? 50;
    const tacticalOverall = categoryAverages.Tactical ?? 50;
    const physicalOverall = categoryAverages.Physical ?? 50;
    const mentalOverall = categoryAverages.Mental ?? 50;
    const attackingOverall = categoryAverages.Attacking ?? 50;
    const defendingOverall = categoryAverages.Defending ?? 50;

    const performanceAnalytics = {
      skills: {
        overall: skillsDonutScore,
        percentage: `${skillsDonutScore}%`,
        categories: {
          technical: technicalOverall,
          tactical: tacticalOverall,
          physical: physicalOverall,
          mental: mentalOverall,
          attacking: attackingOverall,
          defending: defendingOverall,
        },
      },
      foot: {
        overall: footOverallScore,
        percentage: `${footOverallScore}%`,
        rightFoot,
        leftFoot,
        heading: headingScore,
        preferredFoot: prefFoot,
      },
    };

    const techObj: Record<string, any> = formattedAttributes?.categories?.technical || {};
    const tactObj: Record<string, any> = formattedAttributes?.categories?.tactical || {};
    const physObj: Record<string, any> = formattedAttributes?.categories?.physical || {};
    const mentObj: Record<string, any> = formattedAttributes?.categories?.mental || {};
    const attObj: Record<string, any> = formattedAttributes?.categories?.attacking || {};
    const defObj: Record<string, any> = formattedAttributes?.categories?.defending || {};

    const analysisOfPlayerAttributes = {
      technical: {
        overallScore: technicalOverall,
        ballControl: techObj.ballControl ?? 50,
        dribbling: techObj.dribbling ?? 50,
        shortPassing: techObj.shortPassing ?? 50,
        longPassing: techObj.longPassing ?? 50,
      },
      tactical: {
        overallScore: tacticalOverall,
        positioning: tactObj.positioning ?? 50,
        vision: tactObj.vision ?? 50,
        anticipation: tactObj.anticipation ?? 50,
        composition: tactObj.composition ?? tactObj.composure ?? 50,
      },
      physical: {
        overallScore: physicalOverall,
        acceleration: physObj.acceleration ?? 50,
        sprintSpeed: physObj.sprintSpeed ?? 50,
        stamina: physObj.stamina ?? 50,
        strength: physObj.strength ?? 50,
      },
      mental: {
        overallScore: mentalOverall,
        aggression: mentObj.aggression ?? 50,
        interceptions: mentObj.interceptions ?? 50,
        marking: mentObj.marking ?? 50,
        leadership: mentObj.leadership ?? 50,
      },
      attacking: {
        overallScore: attackingOverall,
        firstTouch: attObj.firstTouch ?? 50,
        shotPower: attObj.shotPower ?? 50,
        curve: attObj.curve ?? 50,
        freeKick: attObj.freeKick ?? 50,
      },
      defending: {
        overallScore: defendingOverall,
        standingTackle: defObj.standingTackle ?? 50,
        slidingTackle: defObj.slidingTackle ?? 50,
        interception: defObj.interception ?? 50,
        marking: defObj.marking ?? 50,
      },
    };

    // Fast memory aggregation for match metrics
    const matchRecords: any[] = aggregatedProfile.matchRecords || [];
    const totalMatches = matchRecords.length;
    let totalGoals = 0;
    let totalAssists = 0;
    let totalPasses = 0;
    let totalPassAccSum = 0;
    let totalTackles = 0;
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
      totalTackles += m.tackles || 0;
      if (m.result === 'W') wins++;
      else if (m.result === 'D') draws++;
      else if (m.result === 'L') losses++;
      const r = m.playerRating ?? 6.0;
      sumNormalizedRatings += r <= 10 ? r * 10 : r;
    }

    const avgPassAccuracy = totalMatches > 0 ? Math.round(totalPassAccSum / totalMatches) : 0;
    const avgTackles = totalMatches > 0 ? Math.round((totalTackles / totalMatches) * 10) / 10 : 0;
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
        yellowCards: match.yellowCards ?? 0,
        redCards: match.redCards ?? 0,
        tackles: match.tackles ?? 0,
        weather: match.weather || null,
        temperature: match.temperature || null,
        scoutName: match.scoutName || null,
        reportCompletionType: match.reportCompletionType || 'SELF',
        stats: match.stats || {},
        accurateShots: match.accurateShots || [],
        accurateAssists: match.accurateAssists || [],
        coachReview: match.coachReview || null,
        file: match.reportPdfUrl || null,
        reportPdfUrl: match.reportPdfUrl || null,
        isVerified:
          match.reportCompletionType === 'COACH' ? match.coachReview?.status === 'COMPLETED' : true,
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
    delete profileObj.fifaCardDoc;
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

    // Calculate Strength & FIFA Card Face Stats (screenshots 1 & 3)
    const fifaDoc = aggregatedProfile.fifaCardDoc || {};
    const pacScore =
      fifaDoc.pac ??
      (rawAttrDoc.acceleration !== undefined || rawAttrDoc.sprintSpeed !== undefined
        ? Math.round(
            (Number(rawAttrDoc.acceleration ?? 88) + Number(rawAttrDoc.sprintSpeed ?? 88)) / 2,
          )
        : 93);
    const shoScore =
      fifaDoc.sho ??
      (rawAttrDoc.finishing !== undefined ||
      rawAttrDoc.shotPower !== undefined ||
      rawAttrDoc.longShots !== undefined
        ? Math.round(
            Number(rawAttrDoc.finishing ?? 88) * 0.4 +
              Number(rawAttrDoc.shotPower ?? 88) * 0.3 +
              Number(rawAttrDoc.longShots ?? 88) * 0.3,
          )
        : 85);
    const pasScore =
      fifaDoc.pas ??
      (rawAttrDoc.shortPassing !== undefined || rawAttrDoc.vision !== undefined
        ? Math.round(
            Number(rawAttrDoc.shortPassing ?? 88) * 0.4 +
              Number(rawAttrDoc.vision ?? 88) * 0.3 +
              Number(rawAttrDoc.longPassing ?? 88) * 0.2 +
              Number(rawAttrDoc.crossing ?? 88) * 0.1,
          )
        : 88);
    const driScore =
      fifaDoc.dri ??
      (rawAttrDoc.dribbling !== undefined || rawAttrDoc.ballControl !== undefined
        ? Math.round(
            Number(rawAttrDoc.dribbling ?? 88) * 0.5 +
              Number(rawAttrDoc.ballControl ?? 88) * 0.3 +
              Number(rawAttrDoc.agility ?? 88) * 0.2,
          )
        : 90);
    const defScore =
      fifaDoc.def ??
      (rawAttrDoc.marking !== undefined || rawAttrDoc.standingTackle !== undefined
        ? Math.round(
            Number(rawAttrDoc.marking ?? 88) * 0.35 +
              Number(rawAttrDoc.standingTackle ?? 88) * 0.35 +
              Number(rawAttrDoc.interceptions ?? 88) * 0.3,
          )
        : 83);
    const phyScore =
      fifaDoc.phy ??
      (rawAttrDoc.strength !== undefined || rawAttrDoc.stamina !== undefined
        ? Math.round(
            Number(rawAttrDoc.strength ?? 88) * 0.5 +
              Number(rawAttrDoc.stamina ?? 88) * 0.3 +
              Number(rawAttrDoc.jumping ?? 88) * 0.2,
          )
        : 88);
    const headingScoreVal = headingScore || 88;

    const strength = {
      pace: pacScore,
      shooting: shoScore,
      passing: pasScore,
      dribbling: driScore,
      defending: defScore,
      physical: phyScore,
      heading: headingScoreVal,
      items: [
        { key: 'pace', label: 'PACE', value: pacScore },
        { key: 'shooting', label: 'SHOOTING', value: shoScore },
        { key: 'passing', label: 'PASSING', value: pasScore },
        { key: 'dribbling', label: 'DRIBBLING', value: driScore },
        { key: 'defending', label: 'DEFENDING', value: defScore },
        { key: 'physical', label: 'PHYSICAL', value: phyScore },
        { key: 'heading', label: 'HEADING', value: headingScoreVal },
      ],
    };

    const fifaCardStats = {
      overallRating,
      position: aggregatedProfile.position || 'CDM',
      pac: pacScore,
      sho: shoScore,
      pas: pasScore,
      dri: driScore,
      def: defScore,
      phy: phyScore,
      heading: headingScoreVal,
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
      perceptionMetrics: {
        spaceAwareness: {
          score: aggregatedProfile.perceptionMetrics?.spaceAwareness?.score ?? 92,
          trend: aggregatedProfile.perceptionMetrics?.spaceAwareness?.trend ?? 3,
          grade:
            aggregatedProfile.perceptionMetrics?.spaceAwareness?.grade ||
            calculateMetricGrade(aggregatedProfile.perceptionMetrics?.spaceAwareness?.score ?? 92),
        },
        opponentReading: {
          score: aggregatedProfile.perceptionMetrics?.opponentReading?.score ?? 88,
          trend: aggregatedProfile.perceptionMetrics?.opponentReading?.trend ?? 5,
          grade:
            aggregatedProfile.perceptionMetrics?.opponentReading?.grade ||
            calculateMetricGrade(aggregatedProfile.perceptionMetrics?.opponentReading?.score ?? 88),
        },
        gameFlowUnderstanding: {
          score: aggregatedProfile.perceptionMetrics?.gameFlowUnderstanding?.score ?? 85,
          trend: aggregatedProfile.perceptionMetrics?.gameFlowUnderstanding?.trend ?? 2,
          grade:
            aggregatedProfile.perceptionMetrics?.gameFlowUnderstanding?.grade ||
            calculateMetricGrade(
              aggregatedProfile.perceptionMetrics?.gameFlowUnderstanding?.score ?? 85,
            ),
        },
        pressureHandling: {
          score: aggregatedProfile.perceptionMetrics?.pressureHandling?.score ?? 90,
          trend: aggregatedProfile.perceptionMetrics?.pressureHandling?.trend ?? 4,
          grade:
            aggregatedProfile.perceptionMetrics?.pressureHandling?.grade ||
            calculateMetricGrade(
              aggregatedProfile.perceptionMetrics?.pressureHandling?.score ?? 90,
            ),
        },
      },
      visionMetrics: {
        peripheralVision: {
          score: aggregatedProfile.visionMetrics?.peripheralVision?.score ?? 87,
          trend: aggregatedProfile.visionMetrics?.peripheralVision?.trend ?? 3,
          grade:
            aggregatedProfile.visionMetrics?.peripheralVision?.grade ||
            calculateMetricGrade(aggregatedProfile.visionMetrics?.peripheralVision?.score ?? 87),
        },
        focusControl: {
          score: aggregatedProfile.visionMetrics?.focusControl?.score ?? 85,
          trend: aggregatedProfile.visionMetrics?.focusControl?.trend ?? 2,
          grade:
            aggregatedProfile.visionMetrics?.focusControl?.grade ||
            calculateMetricGrade(aggregatedProfile.visionMetrics?.focusControl?.score ?? 85),
        },
        patternRecognition: {
          score: aggregatedProfile.visionMetrics?.patternRecognition?.score ?? 89,
          trend: aggregatedProfile.visionMetrics?.patternRecognition?.trend ?? 4,
          grade:
            aggregatedProfile.visionMetrics?.patternRecognition?.grade ||
            calculateMetricGrade(aggregatedProfile.visionMetrics?.patternRecognition?.score ?? 89),
        },
        decisionSpeed: {
          score: aggregatedProfile.visionMetrics?.decisionSpeed?.score ?? 91,
          trend: aggregatedProfile.visionMetrics?.decisionSpeed?.trend ?? 5,
          grade:
            aggregatedProfile.visionMetrics?.decisionSpeed?.grade ||
            calculateMetricGrade(aggregatedProfile.visionMetrics?.decisionSpeed?.score ?? 91),
        },
        visualAcuity: {
          score: aggregatedProfile.visionMetrics?.visualAcuity?.score ?? 86,
          trend: aggregatedProfile.visionMetrics?.visualAcuity?.trend ?? 1,
          grade:
            aggregatedProfile.visionMetrics?.visualAcuity?.grade ||
            calculateMetricGrade(aggregatedProfile.visionMetrics?.visualAcuity?.score ?? 86),
        },
        ...(aggregatedProfile.visionMetrics?.visionField
          ? { visionField: aggregatedProfile.visionMetrics.visionField }
          : {}),
        ...(aggregatedProfile.visionMetrics?.targetFinding
          ? { targetFinding: aggregatedProfile.visionMetrics.targetFinding }
          : {}),
      },
      overviewStats: {
        profileViews,
        totalLikes,
        reports: totalReportsCount,
      },
      totalReports: totalReportsCount,
      performanceAnalytics,
      analysisOfPlayerAttributes,
      attributes: formattedAttributes,
      categoryAverages,
      skillsDonutScore,
      keyAttributes,
      positionalCoefficients: positionalCoefficientsList,
      strength,
      fifaCardStats,
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
        avgTackles,
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
