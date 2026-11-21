import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { redisCache } from '@/utils/redisCache.util';
import { PlayerProfile, PlayerAttributes, FifaCardStats } from '../player.model';
import { playerStatsService } from './player-stats.service';
import {
  calculatePositionRating,
  formatAttributeLabel,
  normalizePositionKey,
  POSITION_ATTRIBUTE_COEFFICIENTS,
  resolvePositionAttributeValue,
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

    const pick = (primary: any, ...fallbacks: any[]): number => {
      if (primary !== undefined && primary !== null && Number(primary) !== 50) {
        return Number(primary);
      }
      for (const fb of fallbacks) {
        if (fb !== undefined && fb !== null && Number(fb) !== 50) {
          return Number(fb);
        }
      }
      return primary !== undefined && primary !== null ? Number(primary) : 50;
    };

    const mental = {
      aggression: pick(raw.aggression, raw.oneOnOne, raw.tackling, raw.strength),
      concentration: pick(raw.concentration, raw.decisions, raw.composure, raw.anticipation),
      consistency: pick(raw.consistency, raw.decisions, raw.stamina, raw.composure),
      leadership: pick(raw.leadership, raw.communication, raw.teamwork, raw.decisions),
      bravery: pick(raw.bravery, raw.oneOnOne, raw.aerialDuels, raw.aerialAbility),
      determination: pick(raw.determination, raw.stamina, raw.decisions, raw.composure),
      heading: pick(raw.heading, raw.headingAccuracy, raw.aerialDuels, raw.aerialAbility),
      influence: pick(raw.influence, raw.creativity, raw.vision, raw.decisions),
    };

    const attacking = {
      firstTouch: pick(raw.firstTouch, raw.ballControl),
      shotPower: pick(raw.shotPower, raw.shooting, raw.finishing, raw.shotAccuracy),
      curve: pick(raw.curve, raw.crossing, raw.longPassing, raw.shortPassing),
      freeKick: pick(raw.freeKick, raw.crossing, raw.shotAccuracy, raw.shortPassing),
      penalties: pick(raw.penalties, raw.finishing, raw.composure),
      volleys: pick(raw.volleys, raw.finishing, raw.attPosition),
      headingAccuracy: pick(raw.headingAccuracy, raw.heading, raw.aerialDuels, raw.aerialAbility),
      weakFoot: pick(raw.weakFoot, raw.ballControl, raw.shortPassing),
    };

    const defending = {
      standingTackle: pick(raw.standingTackle, raw.tackling, raw.oneOnOne),
      slidingTackle: pick(raw.slidingTackle, raw.tackling, raw.oneOnOne),
      interception: pick(raw.interception, raw.interceptions, raw.positioning, raw.anticipation),
      marking: pick(raw.marking, raw.oneOnOne, raw.positioning),
      aerialDuels: pick(raw.aerialDuels, raw.aerialAbility, raw.heading),
      clearance: pick(raw.clearance, raw.positioning, raw.tackling, raw.oneOnOne),
      pressing: pick(raw.pressing, raw.stamina, raw.oneOnOne, raw.offTheBall),
      defensiveAwareness: pick(
        raw.defensiveAwareness,
        raw.positioning,
        raw.awareness,
        raw.oneOnOne,
      ),
    };

    const normPos = normalizePositionKey(position || 'CM');
    const coefficients = POSITION_ATTRIBUTE_COEFFICIENTS[normPos] || {};
    const positionAttributes = Object.entries(coefficients).map(([attrKey, weight]) => {
      const val = resolvePositionAttributeValue(attrKey, raw);
      return {
        key: attrKey,
        label: formatAttributeLabel(attrKey, normPos),
        weight: Math.round(weight * 100),
        percentage: `${Math.round(weight * 100)}%`,
        value: val,
        weightedScore: Math.round(val * weight * 100) / 100,
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

  /**
   * Reset all attributes (including dynamic strict:false positional fields) to baseline 50
   * whenever a player switches to a different canonical position group.
   */
  async resetAttributesForPositionChange(playerId: Types.ObjectId | string) {
    const objId = typeof playerId === 'string' ? new Types.ObjectId(playerId) : playerId;
    await PlayerAttributes.deleteOne({ playerId: objId });
    return await PlayerAttributes.create({ playerId: objId });
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
    if (
      (flattenedPayload.defensivePositioning !== undefined ||
        flattenedPayload.gkPositioning !== undefined) &&
      flattenedPayload.positioning === undefined
    ) {
      flattenedPayload.positioning =
        flattenedPayload.defensivePositioning ?? flattenedPayload.gkPositioning;
    }
    if (
      flattenedPayload.attackingPositioning !== undefined &&
      flattenedPayload.attPosition === undefined
    ) {
      flattenedPayload.attPosition = flattenedPayload.attackingPositioning;
    }
    if (flattenedPayload.decisionMaking !== undefined && flattenedPayload.decisions === undefined) {
      flattenedPayload.decisions = flattenedPayload.decisionMaking;
    }
    if (
      flattenedPayload.offTheBallMovement !== undefined &&
      flattenedPayload.offTheBall === undefined
    ) {
      flattenedPayload.offTheBall = flattenedPayload.offTheBallMovement;
    }
    if (
      flattenedPayload.oneOnOneDefending !== undefined &&
      flattenedPayload.oneOnOne === undefined
    ) {
      flattenedPayload.oneOnOne = flattenedPayload.oneOnOneDefending;
    }

    // Support high-level Strength / FIFA card stat aliases sent from frontend
    if (flattenedPayload.pace !== undefined) {
      const paceVal = Number(flattenedPayload.pace);
      if (flattenedPayload.acceleration === undefined) flattenedPayload.acceleration = paceVal;
      if (flattenedPayload.sprintSpeed === undefined) flattenedPayload.sprintSpeed = paceVal;
    }
    if (flattenedPayload.shooting !== undefined) {
      const shoVal = Number(flattenedPayload.shooting);
      if (flattenedPayload.finishing === undefined) flattenedPayload.finishing = shoVal;
      if (flattenedPayload.shotPower === undefined) flattenedPayload.shotPower = shoVal;
      if (flattenedPayload.longShots === undefined) flattenedPayload.longShots = shoVal;
    }
    if (flattenedPayload.passing !== undefined) {
      const pasVal = Number(flattenedPayload.passing);
      if (flattenedPayload.shortPassing === undefined) flattenedPayload.shortPassing = pasVal;
      if (flattenedPayload.vision === undefined) flattenedPayload.vision = pasVal;
      if (flattenedPayload.longPassing === undefined) flattenedPayload.longPassing = pasVal;
      if (flattenedPayload.crossing === undefined) flattenedPayload.crossing = pasVal;
    }
    if (flattenedPayload.dribbling !== undefined) {
      const driVal = Number(flattenedPayload.dribbling);
      if (flattenedPayload.ballControl === undefined) flattenedPayload.ballControl = driVal;
      if (flattenedPayload.agility === undefined) flattenedPayload.agility = driVal;
    }
    if (flattenedPayload.defending !== undefined) {
      const defVal = Number(flattenedPayload.defending);
      if (flattenedPayload.marking === undefined) flattenedPayload.marking = defVal;
      if (flattenedPayload.standingTackle === undefined) flattenedPayload.standingTackle = defVal;
      if (flattenedPayload.tackling === undefined) flattenedPayload.tackling = defVal;
      if (flattenedPayload.interceptions === undefined) flattenedPayload.interceptions = defVal;
      if (flattenedPayload.interception === undefined) flattenedPayload.interception = defVal;
    }
    if (flattenedPayload.physical !== undefined) {
      const phyVal = Number(flattenedPayload.physical);
      if (flattenedPayload.strength === undefined) flattenedPayload.strength = phyVal;
      if (flattenedPayload.stamina === undefined) flattenedPayload.stamina = phyVal;
      if (flattenedPayload.jumping === undefined) flattenedPayload.jumping = phyVal;
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

    // Also update direct FifaCardStats face stats if passed
    const fifaUpdates: Record<string, number> = {};
    if (flattenedPayload.pace !== undefined) fifaUpdates.pac = Number(flattenedPayload.pace);
    if (flattenedPayload.shooting !== undefined)
      fifaUpdates.sho = Number(flattenedPayload.shooting);
    if (flattenedPayload.passing !== undefined) fifaUpdates.pas = Number(flattenedPayload.passing);
    if (flattenedPayload.dribbling !== undefined)
      fifaUpdates.dri = Number(flattenedPayload.dribbling);
    if (flattenedPayload.defending !== undefined)
      fifaUpdates.def = Number(flattenedPayload.defending);
    if (flattenedPayload.physical !== undefined)
      fifaUpdates.phy = Number(flattenedPayload.physical);
    if (Object.keys(fifaUpdates).length > 0) {
      await FifaCardStats.findOneAndUpdate({ playerId: profile._id }, fifaUpdates, {
        upsert: true,
      });
    }

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
