import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { User } from '@/modules/user/user.model';
import { ClubProfile } from '../club.model';

export class ClubResolverService {
  formatClubProfileResponse(profile: any, fallbackUser?: any) {
    const p = profile.toObject ? profile.toObject() : profile;
    const user = p.userId && typeof p.userId === 'object' ? p.userId : fallbackUser || {};
    const establishedYear = p.establishedYear || null;
    const contactPhone = p.contactPhone || user.phone || '';
    const contactEmail = p.contactEmail || user.email || '';
    const country = p.country || '';
    const league = p.league || '';
    const clubName = p.name || user.name || '';
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
      dateOfEstablishment: establishedYear ? String(establishedYear) : '',
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
        category: p.clubType || 'Club',
        status: 'ACTIVE CLUB',
        tier: 'ACTIVE CLUB',
        subInfo: `${p.clubType || 'Club'}${establishedYear ? ` • Est. ${establishedYear}` : ''}${country ? ` • ${country}` : ''}`,
        country,
        foundedYear: establishedYear,
        contact: contactPhone,
        email: contactEmail,
      },
      aboutClub: {
        description: p.description || '',
        visionAndMission: p.visionAndMission || '',
      },
      verification: {
        status: p.verificationStatus || 'PENDING',
        officialWebsite: p.officialWebsite || user.officialWebsite || '',
        footballAssociation: p.footballAssociation || user.footballAssociation || '',
        authorizedRepresentativeName:
          p.authorizedRepresentativeName || user.authorizedRepresentativeName || '',
        authorizedRepresentativeJobTitle:
          p.authorizedRepresentativeJobTitle || user.authorizedRepresentativeJobTitle || '',
        authorizationDocument: p.authorizationDocument || user.authorizationDocument || '',
        clubRegistrationDocument: p.clubRegistrationDocument || user.clubRegistrationDocument || '',
        adminReviewNotes: p.adminReviewNotes || '',
        verifiedAt: p.verifiedAt || null,
      },
    };
  }

  async resolveClub(userId: string) {
    let profile = await ClubProfile.findOne({ userId });
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
      profile = await ClubProfile.create({
        userId: user._id,
        name: user.name || '',
        clubType: 'Club',
        establishedYear: new Date().getFullYear(),
        country: user.country || 'International',
        league: (user as any).league || 'General',
        contactPhone: user.phone || '',
        contactEmail: user.email || '',
      });
    }
    return profile;
  }

  formatTimeAgo(date: Date | string): string {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'RECENTLY';
    const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
    if (seconds < 60) return 'JUST NOW';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} MINUTE${minutes > 1 ? 'S' : ''} AGO`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} HOUR${hours > 1 ? 'S' : ''} AGO`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} DAY${days > 1 ? 'S' : ''} AGO`;
    const months = Math.floor(days / 30);
    return `${months} MONTH${months > 1 ? 'S' : ''} AGO`;
  }
}

export const clubResolverService = new ClubResolverService();
