import { AppError } from '@/utils/AppError';
import { User } from '@/modules/user/user.model';
import { IClubProfile, IClubAchievement, IClubFavourite } from './club.interface';
import { ClubProfile, ClubAchievement, ClubFavourite } from './club.model';

export class ClubService {
  formatClubProfileResponse(profile: any, fallbackUser?: any) {
    const p = profile.toObject ? profile.toObject() : profile;
    const user = p.userId && typeof p.userId === 'object' ? p.userId : fallbackUser || {};
    const establishedYear = p.establishedYear || 1878;
    const contactPhone = p.contactPhone || user.phone || '+55 11 9999-8888';
    const contactEmail = p.contactEmail || user.email || 'liverpool.fc@gmail.com';
    const country = p.country || 'Brazil';
    const league = p.league || 'Premier League';
    const clubName = p.name || user.name || 'Liverpool FC';
    const achievements = Array.isArray(p.achievements) ? p.achievements : [];

    return {
      ...p,
      id: p._id,
      name: clubName,
      clubName,
      country,
      clubCountry: country,
      league,
      clubLeague: league,
      establishedYear,
      dateOfEstablishment: String(establishedYear),
      contact: contactPhone,
      contactPhone,
      email: contactEmail,
      contactEmail,
      tier: 'ACTIVE CLUB',
      activeStatus: 'ACTIVE CLUB',
      achievements,
      bannerInfo: {
        name: clubName,
        clubName,
        logo: p.logo || user.avatar || null,
        coverPhoto: p.coverPhoto || null,
        category: p.clubType || 'Premium Club',
        status: 'ACTIVE CLUB',
        tier: 'ACTIVE CLUB',
        subInfo: `${p.clubType || 'Premium Club'} • Est. ${establishedYear} • ${country}`,
        country,
        foundedYear: establishedYear,
        contact: contactPhone,
        email: contactEmail,
      },
      aboutClub: {
        description: p.description || '',
        visionAndMission: p.visionAndMission || '',
      },
    };
  }

  async getMyClubProfile(userId: string) {
    let profile = await ClubProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(404, 'User not found');
      profile = await ClubProfile.create({
        userId: user._id,
        name: user.name || 'Liverpool FC',
        clubType: 'Premium Club',
        establishedYear: 1878,
        country: 'Brazil',
        league: 'Premier League',
        contactPhone: user.phone || '+55 11 9999-8888',
        contactEmail: user.email || 'liverpool.fc@gmail.com',
      });
      profile = await ClubProfile.findById(profile._id).populate(
        'userId',
        'name email avatar phone',
      );
    }
    return this.formatClubProfileResponse(profile);
  }

  async updateMyClubProfile(userId: string, payload: any) {
    let profile = await ClubProfile.findOne({ userId });
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(404, 'User not found');
      profile = await ClubProfile.create({
        userId: user._id,
        name: payload.clubName || payload.name || user.name || 'Liverpool FC',
        clubType: payload.clubType || 'Premium Club',
        establishedYear: 1878,
        country: payload.clubCountry || payload.country || 'Brazil',
        league: payload.clubLeague || payload.league || 'Premier League',
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

    await profile.save();

    const updated = await ClubProfile.findById(profile._id).populate(
      'userId',
      'name email avatar phone',
    );
    return this.formatClubProfileResponse(updated);
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
    return this.formatClubProfileResponse(profile);
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

export const clubService = new ClubService();
