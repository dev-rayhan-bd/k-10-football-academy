import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { redisCache } from '@/utils/redisCache.util';
import { PlayerProfile, PlayerAttributes } from '../player.model';
import { playerStatsService } from './player-stats.service';
import {
  calculatePositionRating,
  formatAttributeLabel,
  normalizePositionKey,
  POSITION_ATTRIBUTE_COEFFICIENTS,
} from '@/utils/ratingCalculator';

export class PlayerAttributeService {
  formatCategorizedAttributes(doc: any, position?: string) {
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

    const normPos = normalizePositionKey(position || 'CM');
    const coefficients = POSITION_ATTRIBUTE_COEFFICIENTS[normPos] || {};
    const positionAttributes = Object.entries(coefficients)
      .sort((a, b) => b[1] - a[1])
      .map(([attrKey, weight]) => {
        let val = raw[attrKey];
        if (val === undefined || val === null) {
          if (attrKey === 'attPosition') val = raw.attPosition ?? raw.attackingPositioning;
          else if (attrKey === 'decisions') val = raw.decisions ?? raw.decisionMaking;
          else if (attrKey === 'composure' || attrKey === 'composition')
            val = raw.composition ?? raw.composure;
          else if (attrKey === 'tackling') val = raw.tackling ?? raw.standingTackle;
          else if (attrKey === 'interceptions') val = raw.interceptions ?? raw.interception;
          else if (attrKey === 'aerialAbility')
            val = raw.aerialAbility ?? raw.aerialDuels ?? raw.heading;
          else if (attrKey === 'oneOnOne') val = raw.oneOnOne ?? raw.standingTackle;
          else val = 50;
        }
        val = val !== undefined && val !== null ? Number(val) : 50;
        return {
          key: attrKey,
          label: formatAttributeLabel(attrKey),
          weight: Math.round(weight * 100),
          percentage: `${Math.round(weight * 100)}%`,
          value: val,
        };
      });

    const calculatedPositionRating = calculatePositionRating(normPos, raw);

    return {
      _id: raw._id,
      playerId: raw.playerId,
      position: normPos,
      calculatedPositionRating,
      positionAttributes,
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
    const sourceObj =
      payload.attributes && typeof payload.attributes === 'object'
        ? { ...payload, ...payload.attributes }
        : payload.categories && typeof payload.categories === 'object'
          ? { ...payload, ...payload.categories }
          : payload;

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

    await playerStatsService.recalculatePlayerStats(profile._id);

    return this.formatCategorizedAttributes(attributes, profile.position);
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
          position: 1,
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

    const formatted = this.formatCategorizedAttributes(result.attributes, result.position);

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
}

export const playerAttributeService = new PlayerAttributeService();
