import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { User } from '@/modules/user/user.model';
import { notificationService } from '@/modules/notification/notification.service';
import { IClubProfile, IClubAchievement, IClubFavourite } from '../club.interface';
import { ClubProfile, ClubAchievement, ClubFavourite } from '../club.model';
import { clubResolverService } from './club-resolver.service';

export class ClubProfileService {
  async getMyClubProfile(userId: string) {
    let profile = await ClubProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
      profile = await ClubProfile.create({
        userId: user._id,
        name: user.name || '',
        clubType: 'Club',
        establishedYear: new Date().getFullYear(),
        country: '',
        league: '',
        contactPhone: user.phone || '',
        contactEmail: user.email || '',
      });
      profile = await ClubProfile.findById(profile._id).populate(
        'userId',
        'name email avatar phone',
      );
    }
    return clubResolverService.formatClubProfileResponse(profile);
  }

  async updateMyClubProfile(userId: string, payload: any) {
    let profile = await ClubProfile.findOne({ userId });
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
      profile = await ClubProfile.create({
        userId: user._id,
        name: payload.clubName || payload.name || user.name || '',
        clubType: payload.clubType || 'Club',
        establishedYear: new Date().getFullYear(),
        country: payload.clubCountry || payload.country || '',
        league: payload.clubLeague || payload.league || '',
      });
    }

    if (payload.clubName || payload.name) {
      profile.name = payload.clubName || payload.name;
    }
    if (payload.clubCountry || payload.country) {
      profile.country = payload.clubCountry || payload.country;
    }
    if (payload.clubLeague || payload.league) {
      profile.league = payload.clubLeague || payload.league;
    }
    if (payload.clubType) {
      profile.clubType = payload.clubType;
    }
    if (payload.establishedYear || payload.dateOfEstablishment) {
      const yr = Number(payload.establishedYear || payload.dateOfEstablishment);
      if (!isNaN(yr) && yr > 1800) {
        profile.establishedYear = yr;
      }
    }
    if (payload.contact || payload.contactPhone || payload.phone) {
      profile.contactPhone = payload.contact || payload.contactPhone || payload.phone;
    }
    if (payload.email || payload.contactEmail) {
      profile.contactEmail = payload.email || payload.contactEmail;
    }
    if (payload.coverPhoto || payload.coverImage) {
      profile.coverPhoto = payload.coverPhoto || payload.coverImage;
    }
    if (payload.logo || payload.avatar) {
      profile.logo = payload.logo || payload.avatar;
    }
    if (payload.description !== undefined) {
      profile.description = payload.description;
    }
    if (payload.visionAndMission !== undefined || payload.visionMission !== undefined) {
      profile.visionAndMission = payload.visionAndMission ?? payload.visionMission;
    }
    if (payload.achievements !== undefined) {
      if (typeof payload.achievements === 'string') {
        try {
          profile.achievements = JSON.parse(payload.achievements);
        } catch {
          // ignore
        }
      } else if (Array.isArray(payload.achievements)) {
        profile.achievements = payload.achievements;
      }
    }
    if (payload.authorizationDocument) {
      profile.authorizationDocument = payload.authorizationDocument;
    }
    if (payload.clubRegistrationDocument) {
      profile.clubRegistrationDocument = payload.clubRegistrationDocument;
    }
    if (payload.officialWebsite) {
      profile.officialWebsite = payload.officialWebsite;
    }
    if (payload.footballAssociation) {
      profile.footballAssociation = payload.footballAssociation;
    }
    if (payload.authorizedRepresentativeName) {
      profile.authorizedRepresentativeName = payload.authorizedRepresentativeName;
    }
    if (payload.authorizedRepresentativeJobTitle) {
      profile.authorizedRepresentativeJobTitle = payload.authorizedRepresentativeJobTitle;
    }

    await profile.save();

    const userUpdates: Record<string, unknown> = {};
    if (payload.authorizationDocument)
      userUpdates.authorizationDocument = payload.authorizationDocument;
    if (payload.clubRegistrationDocument)
      userUpdates.clubRegistrationDocument = payload.clubRegistrationDocument;
    if (payload.officialWebsite) userUpdates.officialWebsite = payload.officialWebsite;
    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(userId, { $set: userUpdates });
    }

    if (payload.authorizationDocument || payload.clubRegistrationDocument) {
      const user = await User.findById(userId);
      await notificationService.notifyAdmins({
        settingKey: 'verificationAlerts',
        title: 'New Club Verification Request',
        message: `${profile.name || user?.name || 'A Football Club'} has submitted verification documents for review.`,
        type: 'VERIFICATION',
        data: { userId, role: 'CLUB' },
      });
    }

    const updated = await ClubProfile.findById(profile._id).populate(
      'userId',
      'name email avatar phone',
    );
    return clubResolverService.formatClubProfileResponse(updated);
  }

  async createProfile(payload: Partial<IClubProfile>) {
    const existing = await ClubProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Club profile already exists');
    }
    return ClubProfile.create(payload);
  }

  async getProfileById(id: string) {
    const profile = await ClubProfile.findById(id).populate('userId', 'name email avatar phone');
    if (!profile) {
      throw new AppError(404, 'Club profile not found');
    }
    return clubResolverService.formatClubProfileResponse(profile);
  }

  async getAllProfiles(filter: Record<string, unknown> = {}) {
    return ClubProfile.find(filter).populate('userId', 'name email avatar');
  }

  async addAchievement(clubId: string, payload: Partial<IClubAchievement>) {
    return ClubAchievement.create({ ...payload, clubId });
  }

  async getAchievements(clubId: string) {
    return ClubAchievement.find({ clubId }).sort({ year: -1 });
  }

  async addFavourite(clubId: string, payload: Partial<IClubFavourite>) {
    return ClubFavourite.create({ ...payload, clubId });
  }

  async getFavourites(clubId: string) {
    return ClubFavourite.find({ clubId }).populate('targetPlayerId').populate('targetCoachId');
  }
}

export const clubProfileService = new ClubProfileService();
