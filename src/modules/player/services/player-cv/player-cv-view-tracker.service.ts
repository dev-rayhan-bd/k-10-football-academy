import { AppError } from '@/utils/AppError';
import { PlayerProfile } from '@/modules/player/player.model';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';

export class PlayerCvViewTrackerService {
  /**
   * Track profile view and club/agent interest asynchronously without blocking response
   */
  trackClubInterest(profileOrCached: any, viewer?: { userId?: string; role?: string }): void {
    if (!profileOrCached?._id) return;

    const playerId = profileOrCached._id;
    const targetUserId = profileOrCached.userId ? String(profileOrCached.userId) : null;
    const viewerUserId = viewer?.userId ? String(viewer?.userId) : null;

    // 1. If viewer is the player themselves, do not count as a profile view
    if (viewerUserId && targetUserId && viewerUserId === targetUserId) {
      return;
    }

    // 2. Increment profileViews for any external viewer (Club, Agent, Coach, Scout, Super Admin, Parent, or Anonymous Visitor)
    PlayerProfile.updateOne({ _id: playerId }, { $inc: { profileViews: 1 } })
      .exec()
      .catch(() => {});

    // Update in-memory object so immediate response reflects the new view count
    profileOrCached.profileViews = (profileOrCached.profileViews || 0) + 1;
    if (profileOrCached.overviewStats) {
      profileOrCached.overviewStats.profileViews = profileOrCached.profileViews;
    }

    // 3. Track Club Interest if viewer is a Club
    if (viewer && viewer.role === 'CLUB' && viewer.userId) {
      ClubProfile.findOne({ userId: viewer.userId })
        .lean()
        .then((club) => {
          if (club) {
            const clubName = club.name || 'Football Club';
            const clubLogo = club.logo || '';
            const alreadyListedIndex = (profileOrCached.clubsInterested || []).findIndex(
              (c: any) => c.clubName?.toLowerCase() === clubName.toLowerCase(),
            );

            if (alreadyListedIndex >= 0) {
              PlayerProfile.updateOne(
                { _id: playerId, 'clubsInterested.clubName': clubName },
                {
                  $set: {
                    'clubsInterested.$.viewedAt': new Date(),
                    'clubsInterested.$.logoUrl': clubLogo,
                  },
                },
              )
                .exec()
                .catch(() => {});
            } else {
              PlayerProfile.updateOne(
                { _id: playerId },
                {
                  $push: {
                    clubsInterested: {
                      $each: [{ clubName, logoUrl: clubLogo, viewedAt: new Date() }],
                      $position: 0,
                    },
                  },
                },
              )
                .exec()
                .catch(() => {});

              profileOrCached.clubsInterested = profileOrCached.clubsInterested || [];
              profileOrCached.clubsInterested.unshift({
                clubName,
                logoUrl: clubLogo,
                viewedAt: new Date(),
              });
            }
          }
        })
        .catch(() => {});
    }

    // 4. Track Agent Interest if viewer is an Agent
    if (viewer && viewer.role === 'AGENT' && viewer.userId) {
      AgentProfile.findOne({ userId: viewer.userId })
        .lean()
        .then((agent) => {
          if (agent) {
            const agencyName =
              agent.agencyName || agent.fullName || agent.name || 'Scouting Agency';
            const agencyLogo = (agent as any).agencyLogo || agent.avatar || '';
            const alreadyListedIndex = (profileOrCached.clubsInterested || []).findIndex(
              (c: any) => c.clubName?.toLowerCase() === agencyName.toLowerCase(),
            );

            if (alreadyListedIndex >= 0) {
              PlayerProfile.updateOne(
                { _id: playerId, 'clubsInterested.clubName': agencyName },
                {
                  $set: {
                    'clubsInterested.$.viewedAt': new Date(),
                    'clubsInterested.$.logoUrl': agencyLogo,
                  },
                },
              )
                .exec()
                .catch(() => {});
            } else {
              PlayerProfile.updateOne(
                { _id: playerId },
                {
                  $push: {
                    clubsInterested: {
                      $each: [{ clubName: agencyName, logoUrl: agencyLogo, viewedAt: new Date() }],
                      $position: 0,
                    },
                  },
                },
              )
                .exec()
                .catch(() => {});

              profileOrCached.clubsInterested = profileOrCached.clubsInterested || [];
              profileOrCached.clubsInterested.unshift({
                clubName: agencyName,
                logoUrl: agencyLogo,
                viewedAt: new Date(),
              });
            }
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

    return profile.clubsInterested;
  }
}

export const playerCvViewTrackerService = new PlayerCvViewTrackerService();
