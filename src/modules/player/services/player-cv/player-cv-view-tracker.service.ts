import { AppError } from '@/utils/AppError';
import { PlayerProfile } from '@/modules/player/player.model';
import { ClubProfile } from '@/modules/club/club.model';

export class PlayerCvViewTrackerService {
  /**
   * Track club viewing asynchronously without blocking response
   */
  trackClubInterest(profileOrCached: any, viewer?: { userId?: string; role?: string }): void {
    if (viewer && viewer.role === 'CLUB' && viewer.userId && profileOrCached?._id) {
      ClubProfile.findOne({ userId: viewer.userId })
        .lean()
        .then((club) => {
          if (club) {
            const alreadyListed = profileOrCached.clubsInterested?.some(
              (c: any) => c.clubName?.toLowerCase() === club.name?.toLowerCase(),
            );
            if (!alreadyListed) {
              PlayerProfile.updateOne(
                { _id: profileOrCached._id },
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
