/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserModel } from '@/modules/user/user.model';
import { AcademyProfile } from '@/modules/academy/academy.model';
import { ClubProfile } from '@/modules/club/club.model';

const RETIRED_IMAGE_HOSTS = ['da1uxchgo'];
const isValidImageUrl = (url?: string | null): boolean =>
  Boolean(url) && !RETIRED_IMAGE_HOSTS.some((h) => url!.includes(h));

/**
 * One-time (and idempotent) utilities to fix data inconsistencies.
 */
export class AdminMaintenanceService {
  /**
   * Syncs AcademyProfile.logo and ClubProfile.logo → User.avatar
   * for all existing users whose User.avatar is empty but have a valid logo on their profile.
   * Safe to run multiple times (only updates where User.avatar is falsy).
   */
  async syncProfileAvatars() {
    let academiesSynced = 0;
    let clubsSynced = 0;

    // 1. Academy logos
    const academies = await AcademyProfile.find({ logo: { $exists: true, $nin: [null, ''] } })
      .select('userId logo')
      .lean();

    for (const ac of academies) {
      if (!ac.userId || !isValidImageUrl(ac.logo)) continue;
      const user = await UserModel.findById(ac.userId).select('avatar').lean();
      if (!user || user.avatar) continue; // already has avatar, skip
      await UserModel.findByIdAndUpdate(ac.userId, { avatar: ac.logo });
      academiesSynced++;
    }

    // 2. Club logos
    const clubs = await ClubProfile.find({ logo: { $exists: true, $nin: [null, ''] } })
      .select('userId logo')
      .lean();

    for (const cl of clubs) {
      if (!cl.userId || !isValidImageUrl((cl as any).logo)) continue;
      const user = await UserModel.findById(cl.userId).select('avatar').lean();
      if (!user || user.avatar) continue;
      await UserModel.findByIdAndUpdate(cl.userId, { avatar: (cl as any).logo });
      clubsSynced++;
    }

    return {
      academiesSynced,
      clubsSynced,
      totalSynced: academiesSynced + clubsSynced,
      message: `Synced ${academiesSynced} academy logos and ${clubsSynced} club logos to User.avatar`,
    };
  }
}

export const adminMaintenanceService = new AdminMaintenanceService();
