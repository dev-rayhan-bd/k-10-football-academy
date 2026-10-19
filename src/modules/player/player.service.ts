import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { IPlayerProfile, IMatchRecord, ALLOWED_PLAYER_STYLES } from './player.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
} from './player.model';
import { UserModel } from '../user/user.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { playerCacheService } from './services/player-cache.service';
import { playerStatsService, computeProfileCompletion } from './services/player-stats.service';
import { playerCvService } from './services/player-cv.service';
import { playerAttributeService } from './services/player-attribute.service';
import { playerMatchService } from './services/player-match.service';
import { playerCareerService } from './services/player-career.service';
import { playerMediaService } from './services/player-media.service';
import { videoQueue } from '@/jobs/queues/video.queue';
import { calculateMetricGrade } from '@/utils/ratingCalculator';

export { computeProfileCompletion };

export class PlayerService {
  // 1. Cache Management
  async invalidatePlayerCache(
    profileId?: string | Types.ObjectId,
    userId?: string | Types.ObjectId,
  ) {
    return playerCacheService.invalidatePlayerCache(profileId, userId);
  }

  // 2. Rating & Stats Recalculation
  async recalculatePlayerStats(profileId: Types.ObjectId | string) {
    return playerStatsService.recalculatePlayerStats(profileId);
  }

  // 3. Core Profile CRUD
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
    return playerCvService.getProfileById(id, viewer);
  }

  async getCVProfile(id: string, viewer?: { userId?: string; role?: string }) {
    return playerCvService.getCVProfile(id, viewer);
  }

  async getProfileByUserId(userId: string) {
    return playerCvService.getProfileByUserId(userId);
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
    let existing = await PlayerProfile.findOne({ $or: [{ _id: id }, { userId: id }] });
    if (!existing) {
      if (Types.ObjectId.isValid(id)) {
        const user = await UserModel.findById(id);
        if (user) {
          existing = await PlayerProfile.create({
            userId: user._id,
            fullName: user.name || payload.fullName || 'New Player',
            position: payload.position || user.position || 'Forward',
            age: payload.age || user.age || 18,
            country: payload.country || user.country || 'Bangladesh',
            profileImage: user.avatar || '',
          });
          await PlayerAttributes.findOneAndUpdate(
            { playerId: existing._id },
            { playerId: existing._id },
            { upsert: true, new: true },
          );
        }
      }
    }
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
    if (payload.dateOfBirth) {
      const dob = new Date(payload.dateOfBirth);
      if (!isNaN(dob.getTime())) {
        payload.dateOfBirth = dob;
        if (payload.age === undefined || payload.age === '') {
          payload.age = new Date().getFullYear() - dob.getFullYear();
        }
      }
    }
    if (payload.academy && !payload.currentClub) {
      payload.currentClub = payload.academy;
    }
    if (payload.coachName || payload.licenseNumber || payload.clubManaged) {
      payload.coachVerification = {
        ...(existing.coachVerification &&
        typeof (existing.coachVerification as any).toObject === 'function'
          ? (existing.coachVerification as any).toObject()
          : existing.coachVerification || {}),
        ...(payload.coachVerification || {}),
        ...(payload.coachName ? { coachName: payload.coachName } : {}),
        ...(payload.licenseNumber ? { licenseNumber: payload.licenseNumber } : {}),
        ...(payload.clubManaged ? { clubManaged: payload.clubManaged } : {}),
      };
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
    if (payload.rightFootDominance !== undefined && payload.rightFootDominance !== '') {
      payload.rightFootDominance = Number(payload.rightFootDominance);
    }
    if (payload.leftFootDominance !== undefined && payload.leftFootDominance !== '') {
      payload.leftFootDominance = Number(payload.leftFootDominance);
    }

    // Safely parse JSON strings for complex CV fields when sent via multipart/form-data
    if (typeof payload.secondaryPositions === 'string') {
      try {
        payload.secondaryPositions = JSON.parse(payload.secondaryPositions);
      } catch {
        payload.secondaryPositions = payload.secondaryPositions
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }
    if (typeof payload.playerStyles === 'string') {
      try {
        payload.playerStyles = JSON.parse(payload.playerStyles);
      } catch {
        payload.playerStyles = payload.playerStyles
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }
    if (Array.isArray(payload.playerStyles)) {
      if (payload.playerStyles.length > 4) {
        throw new AppError(400, 'Maximum 4 player styles can be selected simultaneously');
      }
      for (const style of payload.playerStyles) {
        if (!ALLOWED_PLAYER_STYLES.includes(style as any)) {
          throw new AppError(400, `Invalid player style: ${style}`);
        }
      }
    }
    // Handle clubLogo & club adding / updating directly in updateProfile
    if (payload.clubLogo) {
      existing.clubLogo = payload.clubLogo;
    }

    if (typeof payload.clubHistory === 'string') {
      try {
        payload.clubHistory = JSON.parse(payload.clubHistory);
      } catch {
        // ignore
      }
    }

    // Support adding or updating a single club item directly via payload (e.g. clubName, addClub)
    let newClubItem: any = null;
    if (payload.addClub) {
      newClubItem =
        typeof payload.addClub === 'string' ? JSON.parse(payload.addClub) : payload.addClub;
    } else if (payload.clubName) {
      newClubItem = {
        clubName: payload.clubName,
        period: payload.period || 'Present',
        isCurrent:
          payload.isCurrent !== undefined
            ? typeof payload.isCurrent === 'string'
              ? payload.isCurrent.toLowerCase() === 'true'
              : Boolean(payload.isCurrent)
            : true,
      };
    }

    if (newClubItem) {
      if (payload.clubLogo && !newClubItem.logoUrl) {
        newClubItem.logoUrl = payload.clubLogo;
      }
      if (newClubItem.isCurrent) {
        payload.currentClub = newClubItem.clubName;
        existing.currentClub = newClubItem.clubName;
      }
      const history = Array.isArray(payload.clubHistory)
        ? [...payload.clubHistory]
        : existing.clubHistory && Array.isArray(existing.clubHistory)
          ? [...existing.clubHistory]
          : [];

      const existingIdx = history.findIndex(
        (c: any) => c.clubName && c.clubName.toLowerCase() === newClubItem.clubName.toLowerCase(),
      );
      if (existingIdx !== -1) {
        history[existingIdx] = { ...history[existingIdx], ...newClubItem };
      } else {
        history.push(newClubItem);
      }
      payload.clubHistory = history;
    } else if (
      payload.clubLogo &&
      Array.isArray(payload.clubHistory) &&
      payload.clubHistory.length > 0
    ) {
      const targetClub =
        payload.clubHistory.find((c: any) => c.isCurrent) ||
        payload.clubHistory[payload.clubHistory.length - 1];
      if (targetClub && !targetClub.logoUrl) {
        targetClub.logoUrl = payload.clubLogo;
      }
    } else if (
      payload.clubLogo &&
      existing.currentClub &&
      (!payload.clubHistory || payload.clubHistory.length === 0)
    ) {
      if (Array.isArray(existing.clubHistory)) {
        const cur = existing.clubHistory.find(
          (c: any) =>
            c.isCurrent || c.clubName?.toLowerCase() === existing.currentClub?.toLowerCase(),
        );
        if (cur) {
          cur.logoUrl = payload.clubLogo;
          payload.clubHistory = existing.clubHistory;
        }
      }
    }

    // Map index-based uploaded club logos (e.g. clubLogo_0, clubLogo_1, clubLogo[0])
    if (Array.isArray(payload.clubHistory) && payload.clubLogosByIndex) {
      Object.entries(payload.clubLogosByIndex).forEach(([key, url]) => {
        const idx = Number(key);
        if (payload.clubHistory[idx]) {
          payload.clubHistory[idx].logoUrl = url;
        }
      });
    }

    // Map sequential club logos uploaded in clubLogos field
    if (Array.isArray(payload.clubHistory) && Array.isArray(payload.clubLogosList)) {
      let listIdx = 0;
      payload.clubHistory.forEach((c: any) => {
        if (!c.logoUrl && listIdx < payload.clubLogosList.length) {
          c.logoUrl = payload.clubLogosList[listIdx++];
        }
      });
    }

    if (Array.isArray(payload.clubHistory)) {
      payload.clubHistory = payload.clubHistory.map((item: any) => {
        if (typeof item.isCurrent === 'string') {
          return { ...item, isCurrent: item.isCurrent.toLowerCase() === 'true' };
        }
        return item;
      });
      if (payload.clubHistory.length > 6) {
        throw new AppError(400, 'Maximum 6 clubs allowed in career timeline');
      }
    }
    if (typeof payload.languages === 'string') {
      try {
        payload.languages = JSON.parse(payload.languages);
      } catch {
        // ignore
      }
    }
    if (typeof payload.accomplishments === 'string') {
      try {
        payload.accomplishments = JSON.parse(payload.accomplishments);
      } catch {
        // ignore
      }
    }
    if (typeof payload.positionMap === 'string') {
      try {
        payload.positionMap = JSON.parse(payload.positionMap);
      } catch {
        // ignore
      }
    }
    if (typeof payload.futsalMap === 'string') {
      try {
        payload.futsalMap = JSON.parse(payload.futsalMap);
      } catch {
        // ignore
      }
    }
    if (typeof payload.transferStatus === 'string') {
      try {
        payload.transferStatus = JSON.parse(payload.transferStatus);
      } catch {
        // ignore
      }
    }
    if (typeof payload.coachVerification === 'string') {
      try {
        payload.coachVerification = JSON.parse(payload.coachVerification);
      } catch {
        // ignore
      }
    }
    // Support flat dot-notation keys for metrics if sent via multipart/form-data
    Object.keys(payload).forEach((key) => {
      const pMatch = key.match(/^perceptionMetrics\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
      if (pMatch) {
        const [, subKey, prop] = pMatch;
        payload.perceptionMetrics = payload.perceptionMetrics || {};
        payload.perceptionMetrics[subKey] = payload.perceptionMetrics[subKey] || {};
        payload.perceptionMetrics[subKey][prop] = payload[key];
        delete payload[key];
      }
      const vMatch = key.match(/^visionMetrics\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
      if (vMatch) {
        const [, subKey, prop] = vMatch;
        payload.visionMetrics = payload.visionMetrics || {};
        payload.visionMetrics[subKey] = payload.visionMetrics[subKey] || {};
        payload.visionMetrics[subKey][prop] = payload[key];
        delete payload[key];
      }
    });

    if (typeof payload.perceptionMetrics === 'string') {
      try {
        payload.perceptionMetrics = JSON.parse(payload.perceptionMetrics);
      } catch {
        // ignore
      }
    }
    if (payload.perceptionMetrics && typeof payload.perceptionMetrics === 'object') {
      const existingPerception = (existing.perceptionMetrics as any) || {};
      const mergedPerception: Record<string, any> = { ...existingPerception };

      const perceptionKeys = [
        'spaceAwareness',
        'opponentReading',
        'gameFlowUnderstanding',
        'pressureHandling',
      ];

      for (const key of perceptionKeys) {
        if (payload.perceptionMetrics[key] !== undefined) {
          const currentItem = existingPerception[key] || {
            score: 85,
            trend: 0,
            grade: 'GOOD',
          };
          const inputItem = payload.perceptionMetrics[key];

          const score =
            inputItem.score !== undefined
              ? Math.max(0, Math.min(100, Number(inputItem.score)))
              : currentItem.score;
          const trend =
            inputItem.trend !== undefined ? Number(inputItem.trend) : (currentItem.trend ?? 0);
          const grade = inputItem.grade || calculateMetricGrade(score);

          mergedPerception[key] = {
            score,
            trend,
            grade,
          };
        }
      }
      payload.perceptionMetrics = mergedPerception;
    }

    if (typeof payload.visionMetrics === 'string') {
      try {
        payload.visionMetrics = JSON.parse(payload.visionMetrics);
      } catch {
        // ignore
      }
    }
    if (payload.visionMetrics && typeof payload.visionMetrics === 'object') {
      const existingVision = (existing.visionMetrics as any) || {};
      const mergedVision: Record<string, any> = { ...existingVision };

      const visionKeys = [
        'peripheralVision',
        'focusControl',
        'patternRecognition',
        'decisionSpeed',
        'visualAcuity',
        'visionField',
        'targetFinding',
      ];

      for (const key of visionKeys) {
        if (payload.visionMetrics[key] !== undefined) {
          const currentItem = existingVision[key] || {
            score: 85,
            trend: 0,
            grade: 'GOOD',
          };
          const inputItem = payload.visionMetrics[key];

          const score =
            inputItem.score !== undefined
              ? Math.max(0, Math.min(100, Number(inputItem.score)))
              : currentItem.score;
          const trend =
            inputItem.trend !== undefined ? Number(inputItem.trend) : (currentItem.trend ?? 0);
          const grade = inputItem.grade || calculateMetricGrade(score);

          mergedVision[key] = {
            score,
            trend,
            grade,
          };
        }
      }
      payload.visionMetrics = mergedVision;
    }
    if (typeof payload.playerEvaluation === 'string') {
      try {
        payload.playerEvaluation = JSON.parse(payload.playerEvaluation);
      } catch {
        // ignore
      }
    }

    // Sync player evaluation & representation fields as per client specification
    const evalData = payload.playerEvaluation || {};
    const agentStatus =
      payload.agentStatus || evalData.agentStatus || existing.agentStatus || 'UNREPRESENTED';
    const clubStatus =
      payload.clubStatus || evalData.clubStatus || existing.clubStatus || 'WITHOUT_CLUB';
    const agentName = payload.agentName ?? evalData.agentName ?? existing.agentName ?? '';
    const agencyName = payload.agencyName ?? evalData.agencyName ?? existing.agencyName ?? '';
    const currentClub =
      payload.currentClub !== undefined
        ? payload.currentClub
        : evalData.currentClub !== undefined
          ? evalData.currentClub
          : (existing.currentClub ?? '');
    const contractUntil = payload.contractUntil ?? evalData.contractUntil ?? existing.contractUntil;

    const normAgent = String(agentStatus).toUpperCase();
    const hasAgent = normAgent.includes('REPRESENTED') && !normAgent.includes('UNREPRESENTED');

    const normClub = String(clubStatus).toUpperCase();
    const hasClub =
      (normClub.includes('SIGNED') || Boolean(currentClub && currentClub.trim())) &&
      !normClub.includes('WITHOUT');

    let mv =
      payload.marketValue !== undefined
        ? Number(payload.marketValue)
        : evalData.marketValue !== undefined
          ? Number(evalData.marketValue)
          : existing.marketValue || 0;

    // Business rule: Only players represented by an agent OR belonging to a professional club can specify market value
    if (!hasAgent && !hasClub) {
      mv = 0;
    }

    payload.agentStatus = hasAgent ? 'REPRESENTED' : 'UNREPRESENTED';
    payload.clubStatus = hasClub ? 'SIGNED' : 'WITHOUT_CLUB';
    payload.agentName = agentName;
    payload.agencyName = agencyName;
    payload.currentClub = currentClub;
    payload.marketValue = mv;

    payload.playerEvaluation = {
      agentStatus: payload.agentStatus,
      hasAgent,
      agentName,
      agencyName,
      clubStatus: payload.clubStatus,
      hasClub,
      currentClub,
      contractUntil,
      marketValue: mv,
    };

    const profile = await PlayerProfile.findOneAndUpdate({ _id: existing._id }, payload, {
      new: true,
      runValidators: true,
    });

    if (profile) {
      // Sync attribute updates into PlayerAttributes collection if passed
      const attrsToUpdate =
        payload.attributes || payload.analysisOfPlayerAttributes || payload.categories;
      if (attrsToUpdate) {
        await playerAttributeService.updateAttributes(profile._id.toString(), attrsToUpdate);
      } else {
        const attributeKeys = [
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
          'composition',
          'teamwork',
          'workRate',
          'decisions',
          'attPosition',
          'acceleration',
          'sprintSpeed',
          'stamina',
          'strength',
          'balance',
          'agility',
          'reactions',
          'jumping',
          'aggression',
          'concentration',
          'consistency',
          'interceptions',
          'marking',
          'leadership',
          'bravery',
          'determination',
          'heading',
          'firstTouch',
          'shotPower',
          'curve',
          'freeKick',
          'penalties',
          'volleys',
          'headingAccuracy',
          'weakFoot',
          'standingTackle',
          'slidingTackle',
          'tackling',
          'interception',
          'aerialDuels',
          'clearance',
          'pressing',
          'defensiveAwareness',
        ];
        const hasDirectAttr = attributeKeys.some((k) => payload[k] !== undefined);
        if (hasDirectAttr) {
          const directAttrs: Record<string, any> = {};
          attributeKeys.forEach((k) => {
            if (payload[k] !== undefined && payload[k] !== '') {
              directAttrs[k] = Number(payload[k]);
            }
          });
          await playerAttributeService.updateAttributes(profile._id.toString(), directAttrs);
        }
      }

      if (payload.highlightVideo) {
        try {
          await videoQueue.add(
            'process-highlight-video',
            {
              videoId: profile._id.toString(),
              videoUrl: payload.highlightVideo,
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
      const updatedProfile = await this.recalculatePlayerStats(profile._id);
      return updatedProfile || profile;
    }

    return profile;
  }

  // 4. Player Career & Timeline
  async updatePlayerStyles(playerId: string, styles: string[]) {
    return playerCareerService.updatePlayerStyles(playerId, styles);
  }

  async updateClubHistory(playerId: string, clubHistory: any[]) {
    return playerCareerService.updateClubHistory(playerId, clubHistory);
  }

  async addClubHistoryItem(playerId: string, clubItem: any) {
    return playerCareerService.addClubHistoryItem(playerId, clubItem);
  }

  async updatePitchMap(playerId: string, payload: { positionMap?: any[]; futsalMap?: any[] }) {
    return playerCareerService.updatePitchMap(playerId, payload);
  }

  // 5. Attributes Management
  formatCategorizedAttributes(doc: any) {
    return playerAttributeService.formatCategorizedAttributes(doc);
  }

  async updateAttributes(playerId: string, payload: Record<string, any>) {
    return playerAttributeService.updateAttributes(playerId, payload);
  }

  async getAttributes(playerId: string) {
    return playerAttributeService.getAttributes(playerId);
  }

  // 6. Match Records
  async addMatchRecord(payload: Partial<IMatchRecord>) {
    return playerMatchService.addMatchRecord(payload);
  }

  async getMatchRecordsByPlayerId(playerId: string) {
    return playerMatchService.getMatchRecordsByPlayerId(playerId);
  }

  async addClubInterest(playerId: string, data: { clubName: string; logoUrl?: string }) {
    return playerCvService.addClubInterest(playerId, data);
  }

  // 7. Media Gallery & Highlight Videos
  async uploadHighlightVideo(
    playerId: string,
    mediaUrl?: string,
    _thumbnailUrl?: string,
    _title?: string,
  ) {
    return playerMediaService.uploadHighlightVideo(playerId, mediaUrl, _thumbnailUrl, _title);
  }

  async uploadMediaGallery(
    playerId: string,
    mediaUrl: string,
    thumbnailUrl?: string,
    title?: string,
  ) {
    return playerMediaService.uploadMediaGallery(playerId, mediaUrl, thumbnailUrl, title);
  }

  async getMediaGallery(playerId: string, page = 1, limit = 10, mediaType?: string) {
    return playerMediaService.getMediaGallery(playerId, page, limit, mediaType);
  }
}

export const playerService = new PlayerService();
