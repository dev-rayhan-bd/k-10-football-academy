import { AppError } from '@/utils/AppError';
import { calculatePositionRating, calculateMatchPerformance } from '@/utils/ratingCalculator';
import { Types } from 'mongoose';
import { IPlayerProfile, IMatchRecord } from './player.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
  MatchRecord,
  PlayerMedia,
} from './player.model';
import { ClubProfile } from '../club/club.model';
import { UserModel } from '../user/user.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { redisCache } from '@/utils/redisCache.util';
import { videoQueue } from '@/jobs/queues/video.queue';

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
  async invalidatePlayerCache(
    profileId?: string | Types.ObjectId,
    userId?: string | Types.ObjectId,
  ) {
    const keys: string[] = [];
    if (profileId) {
      const pId = profileId.toString();
      keys.push(`CACHE:PLAYER:PROFILE:${pId}`);
      keys.push(`CACHE:PLAYER:ATTRIBUTES:${pId}`);
    }
    if (userId) {
      const uId = userId.toString();
      keys.push(`CACHE:PLAYER:PROFILE:${uId}`);
      keys.push(`CACHE:PLAYER:PROFILE:USER:${uId}`);
      keys.push(`CACHE:PLAYER:ATTRIBUTES:${uId}`);
      keys.push(`CACHE:PLAYER:ATTRIBUTES:USER:${uId}`);
    }
    if (keys.length > 0) {
      await redisCache.del(keys);
    }
  }

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

    await this.invalidatePlayerCache(profile._id, profile.userId);

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
    await this.invalidatePlayerCache(profile._id, profile.userId);

    return updatedProfile || profile;
  }

  async getProfileById(id: string, viewer?: { userId?: string; role?: string }) {
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
      // 3. $lookup match records with sorted projection
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

    if (!aggregatedProfile) {
      throw new AppError(404, 'Player profile not found');
    }

    const playerId = aggregatedProfile._id;

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
      ? this.formatCategorizedAttributes(aggregatedProfile.attributesDoc)
      : null;

    // Fast memory aggregation for match metrics
    const matchRecords: any[] = aggregatedProfile.matchRecords || [];
    const totalMatches = matchRecords.length;
    let totalGoals = 0;
    let totalAssists = 0;
    for (let i = 0; i < totalMatches; i++) {
      totalGoals += matchRecords[i].goals || 0;
      totalAssists += matchRecords[i].assists || 0;
    }

    const recentMatches = matchRecords.slice(0, 3).map((match) => {
      let r = match.playerRating ?? 0;
      if (r > 10) {
        r = Math.round((r / 10) * 10) / 10;
      } else {
        r = Math.round(r * 10) / 10;
      }
      return {
        _id: match._id,
        title: match.awayTeam ? `vs ${match.awayTeam}` : 'Match Report',
        rating: r,
        date: match.matchDate,
        file: match.reportPdfUrl || null,
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

    const profileObj = { ...aggregatedProfile };
    delete profileObj.reports;
    delete profileObj.totalReports;
    delete profileObj.user;
    delete profileObj.attributesDoc;
    delete profileObj.matchRecords;
    delete profileObj.professionalReports;

    const finalProfile = {
      ...profileObj,
      phone: userPhone,
      email: userEmail,
      overviewStats: {
        profileViews,
        totalLikes,
        reports: totalReportsCount,
      },
      totalReports: totalReportsCount,
      attributes: formattedAttributes,
      performanceStats: {
        matches: totalMatches,
        goals: totalGoals,
        assists: totalAssists,
        reports: totalReportsCount,
      },
      recentMatches,
      professionalReports: mappedProfessionalReports,
    };

    // Cache profile in Redis for both profileId and userId (TTL: 5 minutes = 300s)
    await redisCache.set(`CACHE:PLAYER:PROFILE:${playerId}`, finalProfile, 300);
    if (aggregatedProfile.userId) {
      await redisCache.set(`CACHE:PLAYER:PROFILE:${aggregatedProfile.userId}`, finalProfile, 300);
      await redisCache.set(
        `CACHE:PLAYER:PROFILE:USER:${aggregatedProfile.userId}`,
        finalProfile,
        300,
      );
    }

    return finalProfile;
  }

  async getProfileByUserId(userId: string) {
    return this.getProfileById(userId);
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    const queryObj = { ...query };

    // Support number conversions for Mongoose matching
    if (queryObj.age !== undefined && queryObj.age !== '') {
      queryObj.age = Number(queryObj.age);
    }
    if (queryObj.minAge || queryObj.maxAge) {
      queryObj.age = {
        ...(queryObj.minAge ? { $gte: Number(queryObj.minAge) } : {}),
        ...(queryObj.maxAge ? { $lte: Number(queryObj.maxAge) } : {}),
      };
      delete queryObj.minAge;
      delete queryObj.maxAge;
    }
    if (queryObj.minRating || queryObj.maxRating) {
      queryObj.overallRating = {
        ...(queryObj.minRating ? { $gte: Number(queryObj.minRating) } : {}),
        ...(queryObj.maxRating ? { $lte: Number(queryObj.maxRating) } : {}),
      };
      delete queryObj.minRating;
      delete queryObj.maxRating;
    }

    const playerQuery = new QueryBuilder(
      PlayerProfile.find().populate('userId', 'name email avatar phone'),
      queryObj,
    )
      .search(['fullName', 'position', 'country', 'currentClub', 'dualNationality', 'cvTier'])
      .filter()
      .sort()
      .paginate()
      .fields();

    const result = await playerQuery.modelQuery;
    const meta = await playerQuery.countTotal();

    return {
      meta,
      result,
    };
  }

  async updateProfile(id: string, payload: any) {
    const existing = await PlayerProfile.findOne({ $or: [{ _id: id }, { userId: id }] });
    if (!existing) {
      throw new AppError(404, 'Player profile not found');
    }

    if (payload.phone) {
      await UserModel.findByIdAndUpdate(existing.userId, { phone: payload.phone });
    }
    if (payload.fullName || payload.name) {
      const nameVal = payload.fullName || payload.name;
      payload.fullName = nameVal;
      await UserModel.findByIdAndUpdate(existing.userId, { name: nameVal });
    }
    if (payload.profileImage) {
      await UserModel.findByIdAndUpdate(existing.userId, { avatar: payload.profileImage });
    }
    if (payload.height !== undefined && payload.height !== '') {
      payload.height = Number(payload.height);
    }
    if (payload.weight !== undefined && payload.weight !== '') {
      payload.weight = Number(payload.weight);
    }
    if (payload.age !== undefined && payload.age !== '') {
      payload.age = Number(payload.age);
    }
    if (payload.marketValue !== undefined && payload.marketValue !== '') {
      payload.marketValue = Number(payload.marketValue);
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

  formatCategorizedAttributes(doc: any) {
    if (!doc) return null;
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };

    const technical = {
      ballControl: raw.ballControl ?? 50,
      dribbling: raw.dribbling ?? 50,
      shortPassing: raw.shortPassing ?? 50,
      longPassing: raw.longPassing ?? 50,
      crossing: raw.crossing ?? 50,
      shooting: raw.shooting ?? 50,
      finishing: raw.finishing ?? 50,
      longShots: raw.longShots ?? 50,
    };

    const tactical = {
      positioning: raw.positioning ?? 50,
      vision: raw.vision ?? 50,
      anticipation: raw.anticipation ?? 50,
      composition: raw.composition ?? raw.composure ?? 50,
      teamwork: raw.teamwork ?? 50,
      workRate: raw.workRate ?? 50,
      decisions: raw.decisions ?? 50,
      attPosition: raw.attPosition ?? 50,
    };

    const physical = {
      acceleration: raw.acceleration ?? 50,
      sprintSpeed: raw.sprintSpeed ?? 50,
      stamina: raw.stamina ?? 50,
      strength: raw.strength ?? 50,
      balance: raw.balance ?? 50,
      agility: raw.agility ?? 50,
      reactions: raw.reactions ?? 50,
      jumping: raw.jumping ?? 50,
    };

    const mental = {
      aggression: raw.aggression ?? 50,
      concentration: raw.concentration ?? 50,
      consistency: raw.consistency ?? 50,
      leadership: raw.leadership ?? 50,
      bravery: raw.bravery ?? 50,
      determination: raw.determination ?? 50,
      heading: raw.heading ?? 50,
      influence: raw.influence ?? 50,
    };

    const attacking = {
      firstTouch: raw.firstTouch ?? 50,
      shotPower: raw.shotPower ?? 50,
      curve: raw.curve ?? 50,
      freeKick: raw.freeKick ?? 50,
      penalties: raw.penalties ?? 50,
      volleys: raw.volleys ?? 50,
      headingAccuracy: raw.headingAccuracy ?? raw.heading ?? 50,
      weakFoot: raw.weakFoot ?? 50,
    };

    const defending = {
      standingTackle: raw.standingTackle ?? raw.tackling ?? 50,
      slidingTackle: raw.slidingTackle ?? 50,
      interception: raw.interception ?? raw.interceptions ?? 50,
      marking: raw.marking ?? 50,
      aerialDuels: raw.aerialDuels ?? 50,
      clearance: raw.clearance ?? 50,
      pressing: raw.pressing ?? 50,
      defensiveAwareness: raw.defensiveAwareness ?? 50,
    };

    return {
      _id: raw._id,
      playerId: raw.playerId,
      categories: {
        technical,
        tactical,
        physical,
        mental,
        attacking,
        defending,
      },
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  async updateAttributes(playerId: string, payload: Record<string, any>) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });

    if (!profile) {
      throw new AppError(404, 'Player profile not found. Please create a player profile first.');
    }

    // Unpack category-wise updates if passed (e.g. { technical: { ballControl: 80 } } or { categories: { ... } })
    const flattenedPayload: Record<string, any> = {};
    const categoryKeys = ['technical', 'tactical', 'physical', 'mental', 'attacking', 'defending'];
    const sourceObj = payload.categories ? { ...payload, ...payload.categories } : payload;

    for (const [key, value] of Object.entries(sourceObj)) {
      if (categoryKeys.includes(key.toLowerCase()) && typeof value === 'object' && value !== null) {
        for (const [subKey, subVal] of Object.entries(value)) {
          flattenedPayload[subKey] = subVal;
        }
      } else if (key !== 'categories') {
        flattenedPayload[key] = value;
      }
    }

    // Keep aliases synced
    if (flattenedPayload.composition !== undefined && flattenedPayload.composure === undefined) {
      flattenedPayload.composure = flattenedPayload.composition;
    }
    if (flattenedPayload.composure !== undefined && flattenedPayload.composition === undefined) {
      flattenedPayload.composition = flattenedPayload.composure;
    }
    if (flattenedPayload.standingTackle !== undefined && flattenedPayload.tackling === undefined) {
      flattenedPayload.tackling = flattenedPayload.standingTackle;
    }
    if (flattenedPayload.tackling !== undefined && flattenedPayload.standingTackle === undefined) {
      flattenedPayload.standingTackle = flattenedPayload.tackling;
    }
    if (flattenedPayload.headingAccuracy !== undefined && flattenedPayload.heading === undefined) {
      flattenedPayload.heading = flattenedPayload.headingAccuracy;
    }
    if (flattenedPayload.heading !== undefined && flattenedPayload.headingAccuracy === undefined) {
      flattenedPayload.headingAccuracy = flattenedPayload.heading;
    }
    if (
      flattenedPayload.interception !== undefined &&
      flattenedPayload.interceptions === undefined
    ) {
      flattenedPayload.interceptions = flattenedPayload.interception;
    }
    if (
      flattenedPayload.interceptions !== undefined &&
      flattenedPayload.interception === undefined
    ) {
      flattenedPayload.interception = flattenedPayload.interceptions;
    }

    const attributes = await PlayerAttributes.findOneAndUpdate(
      { playerId: profile._id },
      flattenedPayload,
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    await this.recalculatePlayerStats(profile._id);

    return this.formatCategorizedAttributes(attributes);
  }

  async getAttributes(playerId: string) {
    let matchStage: any;
    if (playerId === 'me' || playerId === 'my-profile') {
      throw new AppError(400, 'Player ID is required or authenticate as player');
    }
    if (Types.ObjectId.isValid(playerId)) {
      const objId = new Types.ObjectId(playerId);
      matchStage = { $or: [{ _id: objId }, { userId: objId }] };
    } else {
      throw new AppError(404, 'Invalid Player ID');
    }

    // 1. Try to fetch from Redis Cache (Sub-5ms ultra fast response)
    const cacheKey = `CACHE:PLAYER:ATTRIBUTES:${playerId}`;
    const cached = await redisCache.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const [result] = await PlayerProfile.aggregate([
      { $match: matchStage },
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
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          attributes: '$attributesDoc',
        },
      },
    ]);

    if (!result || !result.attributes) {
      const profileExists = await PlayerProfile.exists(matchStage);
      if (!profileExists) {
        throw new AppError(404, 'Player profile not found. Please create a player profile first.');
      }
      throw new AppError(404, 'Player attributes not found');
    }

    const formatted = this.formatCategorizedAttributes(result.attributes);

    // Cache attributes in Redis (TTL: 10 minutes = 600s)
    await redisCache.set(cacheKey, formatted, 600);
    if (result._id) {
      await redisCache.set(`CACHE:PLAYER:ATTRIBUTES:${result._id}`, formatted, 600);
    }
    if (result.userId) {
      await redisCache.set(`CACHE:PLAYER:ATTRIBUTES:USER:${result.userId}`, formatted, 600);
    }

    return formatted;
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

        payload.playerRating = Math.round((perfResult.overallRating / 10) * 10) / 10;
        payload.positivePoints = perfResult.positivePoints;
        payload.negativePoints = perfResult.negativePoints;
        payload.netContribution = perfResult.netContribution;
        payload.interpretation = perfResult.interpretation;
        payload.categoryScores = perfResult.categoryAdjustedScores;
      } else if (payload.playerRating && payload.playerRating > 10) {
        payload.playerRating = Math.round((payload.playerRating / 10) * 10) / 10;
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
      await this.invalidatePlayerCache(profile._id, profile.userId);

      // BullMQ Background Video Processing Queue
      try {
        await videoQueue.add(
          'process-highlight-video',
          {
            videoId: profile._id.toString(),
            videoUrl: mediaUrl,
            playerId: profile._id.toString(),
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        );
      } catch {
        // Safe logging without interrupting HTTP response
      }

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

    await this.invalidatePlayerCache(profile._id, profile.userId);

    // BullMQ Background Video Processing Queue for gallery videos
    if (mediaType === 'VIDEO') {
      try {
        await videoQueue.add(
          'process-media-video',
          {
            videoId: newMedia._id.toString(),
            videoUrl: mediaUrl,
            playerId: profile._id.toString(),
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        );
      } catch {
        // Safe logging without interrupting HTTP response
      }
    }

    return newMedia;
  }

  async getMediaGallery(playerId: string, page = 1, limit = 10, mediaType?: string) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    const targetId = profile ? profile._id : playerId;

    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { playerId: targetId };
    if (mediaType) {
      const normalizedType = mediaType.trim().toUpperCase();
      if (normalizedType === 'IMAGE' || normalizedType === 'VIDEO') {
        filter.mediaType = normalizedType;
      }
    }

    const media = await PlayerMedia.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);

    const total = await PlayerMedia.countDocuments(filter);

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
