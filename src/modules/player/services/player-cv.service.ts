import { Types } from 'mongoose';
import { redisCache } from '@/utils/redisCache.util';
import { playerCvPipelineService } from './player-cv/player-cv-pipeline.service';
import { playerCvViewTrackerService } from './player-cv/player-cv-view-tracker.service';
import { playerCvTransformerService } from './player-cv/player-cv-transformer.service';

/**
 * PlayerCvService Facade
 * Orchestrates:
 *  - High performance sub-5ms Redis caching
 *  - Single-Pass Aggregation pipeline (player-cv-pipeline.service)
 *  - Asynchronous club view tracking (player-cv-view-tracker.service)
 *  - Excel-based statistics & FIFA card transformers (player-cv-transformer.service)
 *
 * Guarantees 100% backward compatibility with all controllers and frontend clients.
 */
export class PlayerCvService {
  async getProfileById(id: string, viewer?: { userId?: string; role?: string }): Promise<any> {
    const { cacheKey } = playerCvPipelineService.resolveMatchStageAndCacheKey(id, viewer);

    // 1. Try to fetch from Redis Cache (Sub-5ms ultra fast response)
    if (cacheKey) {
      const cached = await redisCache.get<any>(cacheKey);
      if (cached) {
        // Track club viewing asynchronously without blocking response
        playerCvViewTrackerService.trackClubInterest(cached, viewer);
        return this.applySafeguarding(cached, viewer);
      }
    }

    // 2. Fetch single-pass aggregated profile from MongoDB
    const aggregatedProfile = await playerCvPipelineService.fetchAggregatedPlayerProfile(
      id,
      viewer,
    );

    // 3. Track profile view & club interest asynchronously without blocking response
    playerCvViewTrackerService.trackClubInterest(aggregatedProfile, viewer);

    // 4. Transform raw aggregates into structured CV profile
    const finalProfile = playerCvTransformerService.transformAggregatedProfile(aggregatedProfile);

    // 5. Cache profile in Redis for both profileId and userId across PROFILE & CV keys (TTL: 5 minutes = 300s)
    const playerId = aggregatedProfile._id.toString();
    await redisCache.set(`CACHE:PLAYER:PROFILE:${playerId}`, finalProfile, 300);
    await redisCache.set(`CACHE:PLAYER:CV:${playerId}`, finalProfile, 300);
    if (aggregatedProfile.userId) {
      const uId = aggregatedProfile.userId.toString();
      await redisCache.set(`CACHE:PLAYER:PROFILE:${uId}`, finalProfile, 300);
      await redisCache.set(`CACHE:PLAYER:PROFILE:USER:${uId}`, finalProfile, 300);
      await redisCache.set(`CACHE:PLAYER:CV:${uId}`, finalProfile, 300);
      await redisCache.set(`CACHE:PLAYER:CV:USER:${uId}`, finalProfile, 300);
    }

    return this.applySafeguarding(finalProfile, viewer);
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
        return this.applySafeguarding(cached, viewer);
      }
    }

    return this.getProfileById(id, viewer);
  }

  async getProfileByUserId(userId: string) {
    return this.getProfileById(userId);
  }

  async addClubInterest(
    playerId: string,
    data: { clubName?: string; agentName?: string; logoUrl?: string },
  ) {
    return playerCvViewTrackerService.addClubInterest(playerId, data as any);
  }

  /**
   * Applies K10 Child Safeguarding & Data Protection rules
   * Ensures that unapproved viewers, Football Agents, and Clubs cannot access private contact details
   * of minors under 18 years old directly. All recruitment inquiries for minors must go through
   * the platform's authorized communication process or parent/guardian consent.
   */
  applySafeguarding(profile: any, viewer?: { userId?: string; role?: string }): any {
    if (!profile) return profile;

    const viewerUserId = viewer?.userId?.toString();
    const viewerRole = viewer?.role ? String(viewer.role).toUpperCase() : null;
    const playerUserId =
      profile.userId?._id?.toString() ||
      profile.userId?.toString() ||
      profile.user?._id?.toString();
    const profileId = profile._id?.toString() || profile.playerId?.toString();

    // Privileged access: Super Admin, Admin, and the player himself see full details
    const isSelf = Boolean(
      viewerUserId && (viewerUserId === playerUserId || viewerUserId === profileId),
    );
    const isAdmin = viewerRole === 'SUPER_ADMIN' || viewerRole === 'ADMIN';

    if (isSelf || isAdmin) {
      return profile;
    }

    // Determine if player is a minor (< 18)
    let age = profile.age !== undefined && profile.age !== null ? Number(profile.age) : undefined;
    if ((age === undefined || isNaN(age)) && profile.dateOfBirth) {
      const dob = new Date(profile.dateOfBirth);
      if (!isNaN(dob.getTime())) {
        const today = new Date();
        let calcAge = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
          calcAge--;
        }
        age = Math.max(0, calcAge);
      }
    }

    const isMinor = (age !== undefined && age > 0 && age < 18) || Boolean(profile.isMinor);

    // Deep clone shallow properties to avoid mutating cached object in Redis
    const sanitized = { ...profile };

    if (isMinor) {
      sanitized.phone = 'Protected (Minor / Contact via Platform)';
      sanitized.email = 'Protected (Minor / Contact via Platform)';
      if (sanitized.user && typeof sanitized.user === 'object') {
        sanitized.user = {
          ...sanitized.user,
          phone: 'Protected (Minor / Contact via Platform)',
          email: 'Protected (Minor / Contact via Platform)',
        };
      }
      sanitized.safeguarding = {
        isMinor: true,
        isProtected: true,
        guardianConsentRequired: true,
        safeguardingNotice:
          'This athlete is a minor under 18. Personal contact details are protected under K10 child safeguarding policy. Recruitment interest and inquiries must be initiated through the platform authorized communication process.',
        authorizedContactMethod: 'PLATFORM_MESSAGING',
      };
    } else if (viewerRole === 'AGENT' || viewerRole === 'CLUB') {
      sanitized.safeguarding = {
        isMinor: false,
        isProtected: false,
        guardianConsentRequired: false,
        authorizedContactMethod: 'PLATFORM_MESSAGING',
      };
    }

    return sanitized;
  }
}

export const playerCvService = new PlayerCvService();
