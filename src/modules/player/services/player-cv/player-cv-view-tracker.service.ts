import { AppError } from '@/utils/AppError';
import { PlayerProfile } from '@/modules/player/player.model';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { playerCacheService } from '../player-cache.service';

export class PlayerCvViewTrackerService {
  /**
   * Track profile view and club/agent interest for non-owner viewers.
   * Atomically increments profileViews in MongoDB, updates the in-memory response,
   * and invalidates Redis cache (unless caller is about to repopulate cache immediately).
   */
  async trackClubInterest(
    profileOrCached: any,
    viewer?: { userId?: string; role?: string },
    options?: { skipCacheInvalidation?: boolean },
  ): Promise<void> {
    if (!profileOrCached?._id) return;

    const playerId = profileOrCached._id;
    const rawUserId = profileOrCached.userId;
    const targetUserId =
      rawUserId?._id?.toString() ||
      (rawUserId && typeof rawUserId === 'object' && typeof rawUserId.toString === 'function'
        ? rawUserId.toString()
        : rawUserId
          ? String(rawUserId)
          : null) ||
      profileOrCached.user?._id?.toString() ||
      null;
    const viewerUserId = viewer?.userId ? String(viewer.userId) : null;

    // 1. If viewer is the player themselves, do not count as a profile view
    if (
      viewerUserId &&
      ((targetUserId && viewerUserId === targetUserId) || viewerUserId === String(playerId))
    ) {
      return;
    }

    // 2. Atomically increment profileViews in MongoDB for any external viewer
    try {
      const updated = await PlayerProfile.findOneAndUpdate(
        { _id: playerId },
        { $inc: { profileViews: 1 } },
        { new: true, projection: { profileViews: 1 } },
      ).lean();

      const nextViews =
        typeof updated?.profileViews === 'number'
          ? updated.profileViews
          : (profileOrCached.profileViews || 0) + 1;

      profileOrCached.profileViews = nextViews;
      if (profileOrCached.overviewStats) {
        profileOrCached.overviewStats.profileViews = nextViews;
      }

      // Invalidate Redis cache so player dashboard & subsequent reads immediately see updated views
      if (!options?.skipCacheInvalidation) {
        await playerCacheService.invalidatePlayerCache(playerId, targetUserId || undefined);
      }
    } catch {
      // Non-fatal: still reflect increment in memory if DB update momentarily fails
      profileOrCached.profileViews = (profileOrCached.profileViews || 0) + 1;
      if (profileOrCached.overviewStats) {
        profileOrCached.overviewStats.profileViews = profileOrCached.profileViews;
      }
    }

    // 3. Track Club Interest if viewer is a Club
    if (viewer && viewer.role === 'CLUB' && viewer.userId) {
      ClubProfile.findOne({ userId: viewer.userId })
        .lean()
        .then(async (club) => {
          if (club) {
            const clubName = club.name || 'Football Club';
            const clubLogo = club.logo || '';
            const alreadyListedIndex = (profileOrCached.clubsInterested || []).findIndex(
              (c: any) => c.clubName?.toLowerCase() === clubName.toLowerCase(),
            );

            if (alreadyListedIndex >= 0) {
              await PlayerProfile.updateOne(
                { _id: playerId, 'clubsInterested.clubName': clubName },
                {
                  $set: {
                    'clubsInterested.$.viewedAt': new Date(),
                    'clubsInterested.$.logoUrl': clubLogo,
                  },
                },
              );
            } else {
              await PlayerProfile.updateOne(
                { _id: playerId },
                {
                  $push: {
                    clubsInterested: {
                      $each: [{ clubName, logoUrl: clubLogo, viewedAt: new Date() }],
                      $position: 0,
                    },
                  },
                },
              );

              profileOrCached.clubsInterested = profileOrCached.clubsInterested || [];
              profileOrCached.clubsInterested.unshift({
                clubName,
                logoUrl: clubLogo,
                viewedAt: new Date(),
              });
            }
            await playerCacheService.invalidatePlayerCache(playerId, targetUserId || undefined);
          }
        })
        .catch(() => {});
    }

    // 4. Track Agent Interest if viewer is an Agent
    if (viewer && viewer.role === 'AGENT' && viewer.userId) {
      AgentProfile.findOne({ userId: viewer.userId })
        .lean()
        .then(async (agent) => {
          if (agent) {
            const agencyName =
              agent.agencyName || agent.fullName || agent.name || 'Scouting Agency';
            const agencyLogo = (agent as any).agencyLogo || agent.avatar || '';
            const alreadyListedIndex = (profileOrCached.clubsInterested || []).findIndex(
              (c: any) => c.clubName?.toLowerCase() === agencyName.toLowerCase(),
            );

            if (alreadyListedIndex >= 0) {
              await PlayerProfile.updateOne(
                { _id: playerId, 'clubsInterested.clubName': agencyName },
                {
                  $set: {
                    'clubsInterested.$.viewedAt': new Date(),
                    'clubsInterested.$.logoUrl': agencyLogo,
                  },
                },
              );
            } else {
              await PlayerProfile.updateOne(
                { _id: playerId },
                {
                  $push: {
                    clubsInterested: {
                      $each: [{ clubName: agencyName, logoUrl: agencyLogo, viewedAt: new Date() }],
                      $position: 0,
                    },
                  },
                },
              );

              profileOrCached.clubsInterested = profileOrCached.clubsInterested || [];
              profileOrCached.clubsInterested.unshift({
                clubName: agencyName,
                logoUrl: agencyLogo,
                viewedAt: new Date(),
              });
            }
            await playerCacheService.invalidatePlayerCache(playerId, targetUserId || undefined);
          }
        })
        .catch(() => {});
    }
  }

  /**
   * Manually record club interest
   */
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
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return profile.clubsInterested;
  }
}

export const playerCvViewTrackerService = new PlayerCvViewTrackerService();
