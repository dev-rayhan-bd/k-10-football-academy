import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IAcademyProfile } from '../academy.interface';
import {
  AcademyProfile,
  Team,
  AcademyCoach,
  ExtraEvent,
  AcademyNews,
  AcademyMatch,
  AcademySponsor,
  AcademySuccessStory,
} from '../academy.model';
import { TrainingSession } from '@/modules/training/training.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { ParentProfile, ParentChild } from '@/modules/parent/parent.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { NotificationService } from '@/modules/notification/notification.service';
import { User } from '@/modules/user/user.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { academyResolverService } from './academy-resolver.service';

const notificationService = new NotificationService();

export class AcademyProfileService {
  async createProfile(payload: Partial<IAcademyProfile>) {
    const existing = await AcademyProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Academy profile already exists');
    }
    return AcademyProfile.create(payload);
  }

  formatAcademyProfileResponse(profile: any) {
    const p = profile.toObject ? profile.toObject() : profile;
    const establishedDate = p.establishedDate
      ? new Date(p.establishedDate)
      : new Date('2018-01-01');
    const foundedYear = establishedDate.getFullYear();
    const formattedEstablishmentDate = establishedDate.toISOString().split('T')[0];

    const day = String(establishedDate.getDate()).padStart(2, '0');
    const month = String(establishedDate.getMonth() + 1).padStart(2, '0');
    const dateOfEstablishmentFormatted = `${day}/${month}/${foundedYear}`;

    const userPhone = (p.userId as any)?.phone || '';
    const userEmail = (p.userId as any)?.email || '';
    const contactPhone = p.contactPhone || userPhone || '+55 11 9999-8888';
    const contactEmail = p.contactEmail || userEmail || 'contact@santosfc.academy';
    const nationality =
      p.nationality ||
      p.location ||
      (p.city && p.country ? `${p.city}, ${p.country}` : p.country || 'São Paulo, Brazil');

    const league = p.league || 'Premier League';
    const achievements = Array.isArray(p.achievements) ? p.achievements : [];
    const clubName = p.name || 'Liverpool FC';
    const country = p.country || 'Brazil';

    return {
      ...p,
      name: clubName,
      clubName,
      academyName: clubName,
      country,
      clubCountry: country,
      league,
      clubLeague: league,
      achievements,
      nationality,
      academyCategory: p.category || 'Premium Club',
      dateOfEstablishment: formattedEstablishmentDate,
      dateOfEstablishmentFormatted,
      contact: contactPhone,
      contactPhone,
      email: contactEmail,
      contactEmail,
      activeStatus: 'ACTIVE CLUB',
      tier: 'ACTIVE CLUB',
      isActive: true,
      foundedYear,
      foundedText: `Founded ${foundedYear}`,
      locationText: nationality,
      bannerInfo: {
        name: clubName,
        clubName,
        logo: p.logo || null,
        coverPhoto: p.coverPhoto || null,
        category: p.category || 'Premium Club',
        status: 'ACTIVE CLUB',
        tier: 'ACTIVE CLUB',
        subInfo: `${p.category || 'Premium Club'} • Est. ${foundedYear} • ${country}`,
        foundedYear,
        foundedText: `Founded ${foundedYear}`,
        locationText: nationality,
        country,
        contact: contactPhone,
        email: contactEmail,
      },
      aboutAcademy: {
        description:
          p.description ||
          'Santos FC Academy is committed to developing world-class football talent through excellence in coaching, state-of-the-art facilities, and a holistic approach to player development.',
        visionAndMission:
          p.visionAndMission ||
          'To nurture the next generation of football stars by combining technical excellence with character development.',
        trainingPhilosophy:
          p.trainingPhilosophy ||
          'Player-centered development focusing on technical skills, tactical awareness, physical conditioning, and mental resilience.',
      },
    };
  }

  async getAcademyFeatureAccess(academyId: Types.ObjectId | string, currentPlan: string = 'FREE') {
    const isElite = currentPlan === 'ELITE' || currentPlan === 'PREMIUM';

    // Count teams, coaches, players
    const [teamsCount, teams] = await Promise.all([
      Team.countDocuments({ academyId }),
      Team.find({ academyId }).select('coachIds playerIds').lean(),
    ]);

    const coachSet = new Set<string>();
    const playerSet = new Set<string>();
    teams.forEach((t: any) => {
      (t.coachIds || []).forEach((id: any) => coachSet.add(id.toString()));
      (t.playerIds || []).forEach((id: any) => playerSet.add(id.toString()));
    });

    const currentCoaches = coachSet.size;
    const currentPlayers = playerSet.size;

    const maxTeams = isElite ? 9999 : 1;
    const maxCoaches = isElite ? 9999 : 1;
    const maxPlayers = isElite ? 9999 : 16;

    const upgradeMessage =
      'Upgrade to the K10 Elite Plan to unlock this feature. The Elite Plan gives your Academy access to advanced team management, tournament and event creation, online store management, game report commissions, player profile transfers, and additional exclusive benefits.';

    return {
      tier: isElite ? 'ELITE' : 'FREE',
      currentPlan: isElite ? 'ELITE' : 'FREE',
      isElite,
      limits: {
        teams: {
          allowed: maxTeams,
          current: teamsCount,
          canCreate: isElite || teamsCount < 1,
        },
        coaches: {
          allowed: maxCoaches,
          current: currentCoaches,
          canAdd: isElite || currentCoaches < 1,
        },
        players: {
          allowed: maxPlayers,
          current: currentPlayers,
          canAdd: isElite || currentPlayers < 16,
        },
      },
      features: {
        additionalTeams: {
          isLocked: !isElite && teamsCount >= 1,
          message: upgradeMessage,
        },
        tournamentsAndEvents: {
          isLocked: !isElite,
          message: upgradeMessage,
        },
        onlineStore: {
          isLocked: !isElite,
          message: upgradeMessage,
        },
        gameReportCommissions: {
          isLocked: !isElite,
          message: upgradeMessage,
        },
        playerTransfers: {
          isLocked: !isElite,
          message: upgradeMessage,
        },
      },
    };
  }

  async getProfileById(id: string) {
    let profile = null;
    if (Types.ObjectId.isValid(id)) {
      profile = await AcademyProfile.findOne({
        $or: [{ _id: id }, { userId: id }],
      }).populate('userId', 'name email avatar phone');
    }
    if (!profile) {
      throw new AppError(404, 'Academy profile not found');
    }
    const formatted = this.formatAcademyProfileResponse(profile);
    const featureAccess = await this.getAcademyFeatureAccess(profile._id, profile.currentPlan);
    return {
      ...formatted,
      plan: featureAccess,
    };
  }

  async getMyProfile(userId: string) {
    let profile = await AcademyProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      const user = await User.findById(userId);
      if (user) {
        profile = await AcademyProfile.create({
          userId: user._id,
          name: user.name || 'Santos FC Academy',
          category: 'Premier League Academy',
          country: 'Brazil',
          city: 'São Paulo',
          location: 'São Paulo, Brazil',
          nationality: 'São Paulo, Brazil',
          establishedDate: new Date('2018-01-01'),
          contactPhone: user.phone || '+55 11 9999-8888',
          contactEmail: user.email || 'contact@santosfc.academy',
          description:
            'Santos FC Academy is committed to developing world-class football talent through excellence in coaching, state-of-the-art facilities, and a holistic approach to player development.',
          visionAndMission:
            'To nurture the next generation of football stars by combining technical excellence with character development.',
          trainingPhilosophy:
            'Player-centered development focusing on technical skills, tactical awareness, physical conditioning, and mental resilience.',
        });
        profile = await AcademyProfile.findById(profile._id).populate(
          'userId',
          'name email avatar phone',
        );
      } else {
        throw new AppError(404, 'Academy profile not found for this user');
      }
    }
    const safeProfile = profile as any;
    const formatted = this.formatAcademyProfileResponse(safeProfile);
    const featureAccess = await this.getAcademyFeatureAccess(
      safeProfile._id,
      safeProfile.currentPlan,
    );
    return {
      ...formatted,
      plan: featureAccess,
    };
  }

  async getAcademyHomepage(identifier: string) {
    let profile = null;
    if (Types.ObjectId.isValid(identifier)) {
      profile = await AcademyProfile.findOne({
        $or: [{ _id: identifier }, { userId: identifier }],
      }).populate('userId', 'name email avatar phone');

      // 1. If identifier belongs to a Player, resolve their associated AcademyProfile
      if (!profile) {
        const player = await PlayerProfile.findOne({
          $or: [{ _id: identifier }, { userId: identifier }],
        })
          .select('_id academyId')
          .lean();
        if (player) {
          let resolvedAcademyId = player.academyId;
          if (!resolvedAcademyId) {
            const playerTeam = await Team.findOne({ playerIds: player._id })
              .select('academyId')
              .lean();
            resolvedAcademyId = playerTeam?.academyId;
          }
          if (resolvedAcademyId) {
            profile = await AcademyProfile.findById(resolvedAcademyId).populate(
              'userId',
              'name email avatar phone',
            );
          }
        }
      }

      // 2. If identifier belongs to a Coach, resolve their associated AcademyProfile
      if (!profile) {
        const coach = await CoachProfile.findOne({
          $or: [{ _id: identifier }, { userId: identifier }],
        })
          .select('_id userId academyId')
          .lean();
        let resolvedAcademyId = (coach as any)?.academyId;
        if (!resolvedAcademyId) {
          const targetCoachIds: any[] = [new Types.ObjectId(identifier)];
          if (coach?._id) targetCoachIds.push(coach._id);
          if (coach?.userId) targetCoachIds.push(coach.userId);

          const affiliation = await AcademyCoach.findOne({
            $or: [{ coachId: { $in: targetCoachIds } }, { coachUserId: { $in: targetCoachIds } }],
            status: 'APPROVED',
          })
            .select('academyId')
            .lean();
          resolvedAcademyId = affiliation?.academyId;

          if (!resolvedAcademyId && coach?._id) {
            const coachTeam = await Team.findOne({ coachIds: coach._id })
              .select('academyId')
              .lean();
            resolvedAcademyId = coachTeam?.academyId;
          }
        }
        if (resolvedAcademyId) {
          profile = await AcademyProfile.findById(resolvedAcademyId).populate(
            'userId',
            'name email avatar phone',
          );
        }
      }

      // 3. If identifier belongs to a Parent, resolve their child's associated AcademyProfile
      if (!profile) {
        const targetParentIds: any[] = [new Types.ObjectId(identifier)];
        const parentProf = await ParentProfile.findOne({
          $or: [{ _id: identifier }, { userId: identifier }],
        })
          .select('_id userId')
          .lean();
        if (parentProf) {
          targetParentIds.push(parentProf._id);
          if (parentProf.userId) targetParentIds.push(parentProf.userId);
        }
        const childLinks = await ParentChild.find({ parentId: { $in: targetParentIds } }).lean();
        for (const link of childLinks) {
          if (!link.childPlayerId) continue;
          const childPlayer = await PlayerProfile.findById(link.childPlayerId)
            .select('_id academyId')
            .lean();
          let resolvedAcademyId = childPlayer?.academyId;
          if (!resolvedAcademyId && childPlayer?._id) {
            const childTeam = await Team.findOne({ playerIds: childPlayer._id })
              .select('academyId')
              .lean();
            resolvedAcademyId = childTeam?.academyId;
          }
          if (resolvedAcademyId) {
            profile = await AcademyProfile.findById(resolvedAcademyId).populate(
              'userId',
              'name email avatar phone',
            );
            if (profile) break;
          }
        }
      }
    }

    if (!profile) {
      profile = await AcademyProfile.findOne({
        name: { $regex: new RegExp(`^${identifier.trim()}$`, 'i') },
      }).populate('userId', 'name email avatar phone');
    }

    if (!profile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found');
    }

    const academyId = profile._id;

    // Fetch all implemented Academy resources in parallel
    const [teams, trainingSessions, matches, coaches, events, news, sponsors, successStories] =
      await Promise.all([
        Team.find({ academyId })
          .select('teamName ageGroup playersCount coachesCount totalMembers status')
          .lean(),
        TrainingSession.find({ academyId })
          .populate('teamId', 'teamName ageGroup')
          .populate('coachId', 'fullName title')
          .sort({ sessionDate: -1 })
          .limit(30)
          .lean(),
        AcademyMatch.find({ academyId })
          .populate('ourTeamId', 'teamName ageGroup')
          .sort({ matchDate: -1 })
          .limit(30)
          .lean(),
        AcademyCoach.find({ academyId, status: { $in: ['APPROVED', 'PENDING'] } })
          .populate('coachId', 'fullName title profileImage licenseStatus yearsExperience')
          .lean(),
        ExtraEvent.find({ academyId }).sort({ eventDate: -1 }).limit(30).lean(),
        AcademyNews.find({
          academyId,
          isDeleted: { $ne: true },
          status: { $ne: 'BIN' },
        })
          .sort({ publishDate: -1 })
          .limit(20)
          .lean(),
        AcademySponsor.find({ academyId }).sort({ createdAt: -1 }).lean(),
        AcademySuccessStory.find({
          academyId,
          isDeleted: { $ne: true },
          status: { $ne: 'REJECTED' },
        })
          .sort({ date: -1 })
          .limit(20)
          .lean(),
      ]);

    const mappedTeams = teams.map((t: any) => ({
      _id: t._id,
      teamName: t.teamName,
      ageGroup: t.ageGroup,
      playersCount: t.playersCount || 0,
      coachesCount: t.coachesCount || 0,
      totalMembers: t.totalMembers || (t.playersCount || 0) + (t.coachesCount || 0),
      status: t.status || 'ACTIVE',
    }));

    const mappedTrainingSessions = trainingSessions.map((s: any) => ({
      _id: s._id,
      sessionName: s.sessionName,
      sessionTitle: s.sessionTitle || s.sessionName,
      sessionDate: s.sessionDate,
      startTime: s.startTime,
      endTime: s.endTime,
      trainingLocation: s.trainingLocation,
      locationField: s.locationField || '',
      sessionType: s.sessionType,
      focusArea: s.focusArea,
      teamName: (s.teamId as any)?.teamName || '',
      ageGroup: (s.teamId as any)?.ageGroup || '',
      coachName: (s.coachId as any)?.fullName || '',
    }));

    const mappedMatches = matches.map((m: any) => ({
      _id: m._id,
      matchTitle: m.matchTitle,
      ourTeamName: (m.ourTeamId as any)?.teamName || '',
      ageGroup: (m.ourTeamId as any)?.ageGroup || '',
      opponentTeam: m.opponentTeam,
      matchType: m.matchType,
      competitionName: m.competitionName || '',
      homeOrAway: m.homeOrAway,
      venueName: m.venueName,
      venueAddress: m.venueAddress,
      matchDate: m.matchDate,
      kickOffTime: m.kickOffTime,
      status: m.status,
    }));

    const mappedCoaches = coaches.map((c: any) => {
      const coachProfile = c.coachId || {};
      return {
        _id: c._id,
        coachId: coachProfile._id || null,
        name: coachProfile.fullName || c.role || 'Academy Coach',
        title: coachProfile.title || c.role || 'Academy Coach',
        role: c.role || 'Academy Coach',
        status: c.status,
        profileImage: coachProfile.profileImage || '',
        licenseStatus: coachProfile.licenseStatus || 'UEFA / AFC Licensed',
        yearsExperience: coachProfile.yearsExperience || 0,
      };
    });

    const mappedExtraEvents = events.map((e: any) => ({
      _id: e._id,
      eventName: e.eventName,
      eventType: e.eventType,
      group: e.group,
      ageGroup: e.ageGroup,
      targetAttendees: e.targetAttendees,
      eventDate: e.eventDate,
      eventEndDate: e.eventEndDate,
      formattedDateRange: e.formattedDateRange || '',
      startTime: e.startTime,
      endTime: e.endTime,
      registrationDeadline: e.registrationDeadline,
      venueName: e.venueName,
      venueAddress: e.venueAddress,
      registrationFee: e.registrationFee ?? 0,
      currency: e.currency || '$',
      maxCapacity: e.maxCapacity,
      currentAttendees: e.currentAttendees ?? 0,
      status: e.status,
      tournamentStatus: e.tournamentStatus,
      bannerImage: e.bannerImage || '',
      description: e.description || '',
    }));

    const mappedNews = news.map((n: any) => ({
      _id: n._id,
      articleTitle: n.articleTitle || 'Announcement',
      category: n.category || 'General News',
      author: n.author || 'Admin',
      publishDate: n.publishDate,
      formattedPublishDate: n.formattedPublishDate || '',
      featuredImage: n.featuredImage || '',
      excerpt: n.excerpt || '',
      fullArticle: n.fullArticle || n.excerpt || '',
      priority: n.priority || 'MEDIUM',
      status: n.status || 'PUBLISHED',
    }));

    const mappedSponsors = sponsors.map((s: any) => ({
      _id: s._id,
      companyName: s.companyName,
      contactPerson: s.contactPerson || '',
      sponsorshipType: s.sponsorshipType,
      sponsorshipStatus: s.sponsorshipStatus,
      formattedContractPeriod: s.formattedContractPeriod || '',
      description: s.sponsorshipDescription || '',
      logo: s.logo || '',
    }));

    const mappedSuccessStories = successStories.map((st: any) => ({
      _id: st._id,
      storyTitle: st.storyTitle,
      playerName: st.playerName || '',
      position: st.position || '',
      currentAcademy: st.currentAcademy || '',
      category: st.category,
      date: st.date,
      formattedDate: st.formattedDate || '',
      photo: st.photo || '',
      storyContent: st.storyContent || '',
      status: st.status,
    }));

    return {
      academyId: profile._id,
      // 1. Academy Profile & Info (AcademyProfile)
      academyInfo: {
        _id: profile._id,
        name: profile.name,
        logo: profile.logo || '',
        coverPhoto: profile.coverPhoto || '',
        location:
          profile.location || `${profile.city || 'Dhaka'}, ${profile.country || 'Bangladesh'}`,
        country: profile.country || 'Bangladesh',
        city: profile.city || 'Dhaka',
        contactPhone: profile.contactPhone || (profile.userId as any)?.phone || '',
        contactEmail: profile.contactEmail || (profile.userId as any)?.email || '',
        description: profile.description || '',
        establishedDate: profile.establishedDate,
        category: profile.category || 'General Academy',
        registrationId: profile.registrationId || '',
        estimatedAcademySize: profile.estimatedAcademySize || '',
        league: profile.league || '',
        achievements: profile.achievements || [],
      },
      academyIntroduction: {
        mission:
          profile.visionAndMission ||
          'To nurture the next generation of football stars by combining technical excellence with character development.',
        philosophy:
          profile.trainingPhilosophy ||
          'Player-centered development focusing on technical skills, tactical awareness, physical conditioning, and mental resilience.',
        objectives:
          'Developing world-class football talent through technical, physical, and character development.',
        playerDevelopmentApproach:
          profile.trainingPhilosophy ||
          'Holistic player development combining professional coaching with modern analytics.',
      },
      // 2. Teams / Age Groups (Team)
      teams: mappedTeams,
      // 3. Coaches (AcademyCoach)
      coaches: mappedCoaches,
      coachingStaff: mappedCoaches,
      // 4. Training Sessions Schedule (TrainingSession)
      trainingSessions: mappedTrainingSessions,
      // 5. Academy Matches Schedule (AcademyMatch)
      matches: mappedMatches,
      trainingInformation: {
        totalTeams: mappedTeams.length,
        trainingFacilities: profile.location || 'Official Training Ground',
        ageGroups: mappedTeams,
        trainingSchedule: mappedTrainingSessions,
        matchSchedule: mappedMatches,
      },
      // 6. Extra Events & Event Registration Fee (ExtraEvent)
      extraEvents: mappedExtraEvents,
      // 7. News, Sponsors & Success Stories (AcademyNews, AcademySponsor, AcademySuccessStory)
      news: mappedNews,
      sponsors: mappedSponsors,
      successStories: mappedSuccessStories,
      eventsAndAnnouncements: [
        ...mappedExtraEvents.map((e: any) => ({
          _id: e._id,
          title: e.eventName || 'Academy Event',
          type: 'EVENT',
          eventType: e.eventType,
          date: e.eventDate,
          formattedDateRange: e.formattedDateRange || '',
          location: e.venueName || e.venueAddress || 'Training Ground',
          registrationFee: e.registrationFee ?? 0,
          currency: e.currency || '$',
          status: e.status,
          bannerImage: e.bannerImage || '',
          description: e.description || '',
        })),
        ...mappedNews.map((n: any) => ({
          _id: n._id,
          title: n.articleTitle || 'Announcement',
          type: 'ANNOUNCEMENT',
          category: n.category || 'General News',
          date: n.publishDate,
          formattedPublishDate: n.formattedPublishDate || '',
          featuredImage: n.featuredImage || '',
          excerpt: n.excerpt || '',
          content: n.fullArticle || n.excerpt || '',
        })),
      ],
      meta: {
        teamsCount: mappedTeams.length,
        coachesCount: mappedCoaches.length,
        trainingSessionsCount: mappedTrainingSessions.length,
        matchesCount: mappedMatches.length,
        eventsCount: mappedExtraEvents.length,
        newsCount: mappedNews.length,
        sponsorsCount: mappedSponsors.length,
        successStoriesCount: mappedSuccessStories.length,
      },
    };
  }

  async updateMyProfile(userId: string, payload: any) {
    let profile = await AcademyProfile.findOne({ userId });
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) throw new AppError(404, 'User not found');
      profile = await AcademyProfile.create({
        userId: user._id,
        name: payload.name || payload.academyName || user.name || 'Santos FC Academy',
        category: payload.category || payload.academyCategory || 'Premier League Academy',
        country: 'Brazil',
        city: 'São Paulo',
        location: payload.nationality || payload.location || 'São Paulo, Brazil',
        nationality: payload.nationality || 'São Paulo, Brazil',
      });
    }
    return this.updateProfileById(profile._id.toString(), payload, userId);
  }

  async updateProfileById(id: string, payload: any, _updatingUserId?: string) {
    let profile = null;
    if (Types.ObjectId.isValid(id)) {
      profile = await AcademyProfile.findOne({
        $or: [{ _id: id }, { userId: id }],
      });
    }
    if (!profile) {
      throw new AppError(404, 'Academy profile not found');
    }

    if (payload.clubName || payload.name || payload.academyName) {
      profile.name = payload.clubName || payload.name || payload.academyName;
    }
    if (payload.category || payload.academyCategory) {
      profile.category = payload.category || payload.academyCategory;
    }
    if (payload.clubLeague || payload.league) {
      profile.league = payload.clubLeague || payload.league;
    }
    if (payload.nationality || payload.location) {
      const loc = payload.nationality || payload.location;
      profile.location = loc;
      profile.nationality = loc;
      if (loc.includes(',')) {
        const parts = loc.split(',').map((s: string) => s.trim());
        if (parts.length >= 2) {
          profile.city = parts[0];
          profile.country = parts[1];
        }
      } else {
        profile.country = loc;
      }
    }
    if (payload.clubCountry || payload.country) {
      profile.country = payload.clubCountry || payload.country;
    }
    if (payload.city) profile.city = payload.city;

    if (payload.establishedDate || payload.dateOfEstablishment || payload.yearOfEstablishment) {
      const rawDate =
        payload.establishedDate || payload.dateOfEstablishment || payload.yearOfEstablishment;
      if (typeof rawDate === 'string' && /^\d{4}$/.test(rawDate.trim())) {
        profile.establishedDate = new Date(`${rawDate.trim()}-01-01`);
      } else if (typeof rawDate === 'string' && rawDate.includes('/')) {
        const [d, m, y] = rawDate.split('/').map(Number);
        profile.establishedDate = new Date(y, m - 1, d);
      } else {
        profile.establishedDate = new Date(rawDate);
      }
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
    if (payload.trainingPhilosophy !== undefined) {
      profile.trainingPhilosophy = payload.trainingPhilosophy;
    }
    if (payload.monthlyTrainingFee !== undefined) {
      const fee = Number(payload.monthlyTrainingFee);
      if (!isNaN(fee) && fee >= 0) {
        profile.monthlyTrainingFee = fee;
      }
    }
    if (payload.monthlyFeeTitle !== undefined) {
      profile.monthlyFeeTitle = String(payload.monthlyFeeTitle).trim() || 'Monthly Training Fee';
    }
    if (payload.registrationId) profile.registrationId = payload.registrationId;
    if (payload.estimatedAcademySize) profile.estimatedAcademySize = payload.estimatedAcademySize;

    await profile.save();

    if (profile.userId) {
      const userUpdate: any = {};
      if (payload.contact || payload.contactPhone || payload.phone) {
        userUpdate.phone = payload.contact || payload.contactPhone || payload.phone;
      }
      if (payload.name || payload.academyName) {
        userUpdate.name = payload.name || payload.academyName;
      }
      if (Object.keys(userUpdate).length > 0) {
        await User.findByIdAndUpdate(profile.userId, userUpdate);
      }
    }

    const updated = await AcademyProfile.findById(profile._id).populate(
      'userId',
      'name email avatar phone',
    );
    return this.formatAcademyProfileResponse(updated);
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    const academyQuery = new QueryBuilder(
      AcademyProfile.find().populate('userId', 'name email avatar phone'),
      query,
    )
      .search([
        'name',
        'category',
        'country',
        'city',
        'location',
        'registrationId',
        'estimatedAcademySize',
      ])
      .filter()
      .sort()
      .paginate()
      .fields();

    const result = await academyQuery.modelQuery;
    const meta = await academyQuery.countTotal();
    return { meta, result };
  }

  async upgradePlan(
    academyIdentifier: string,
    plan: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM',
    customMaxTeams?: number,
  ) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);
    const isPremium = plan === 'PREMIUM';
    const planLimits: Record<string, number> = {
      FREE: 1,
      BASIC: 3,
      PRO: 5,
      PREMIUM: 999999,
    };
    const newMaxTeams = isPremium
      ? 999999
      : customMaxTeams && customMaxTeams > 0
        ? customMaxTeams
        : planLimits[plan] || 1;

    academy.currentPlan = plan;
    academy.maxTeams = newMaxTeams;
    await academy.save();

    const usedTeams = await Team.countDocuments({ academyId: academy._id });

    return {
      message: `Plan updated successfully to ${plan}`,
      currentPlan: academy.currentPlan,
      isUnlimited: isPremium,
      usedTeams,
      maxTeams: isPremium ? null : academy.maxTeams,
      capacityDisplay: isPremium ? `${usedTeams}/∞` : `${usedTeams}/${academy.maxTeams}`,
    };
  }

  async activateAcademyPremiumPlan(academyId: string, transactionId?: string) {
    const academy = await AcademyProfile.findById(academyId);
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found');
    }

    academy.currentPlan = 'PREMIUM';
    academy.maxTeams = 999999;
    await academy.save();

    const usedTeams = await Team.countDocuments({ academyId: academy._id });

    // Upsert subscription
    await UserSubscription.findOneAndUpdate(
      { userId: academy.userId },
      {
        userId: academy.userId,
        status: 'ACTIVE',
        nextBillingDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true },
    );

    // Send in-app notification
    try {
      await notificationService.createNotification({
        recipientId: academy.userId,
        recipientRole: 'ACADEMY',
        title: 'Premium Plan Activated! 🎉',
        message:
          'Your payment was successful. Unlimited team creation and roster features are now unlocked!',
        type: 'PAYMENT_SUCCESS',
        data: { transactionId, plan: 'PREMIUM' },
      });
    } catch {
      // non-blocking
    }

    return {
      message: 'Premium Plan purchased and activated successfully. Unlimited team slots unlocked!',
      currentPlan: 'PREMIUM',
      isUnlimited: true,
      maxTeams: null,
      usedTeams,
      capacityDisplay: `${usedTeams}/∞`,
      status: 'ACTIVE',
      transactionId,
      planDetails: {
        plan: 'PREMIUM',
        price: 49,
        billingCycle: 'YEARLY',
        unlimitedTeams: true,
      },
    };
  }

  async purchasePremiumPlan(
    academyIdentifier: string,
    _payload?: { plan?: string; paymentMethod?: string; price?: number },
  ) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);
    return this.activateAcademyPremiumPlan(academy._id.toString(), 'DIRECT_PURCHASE');
  }

  async createPlanCheckoutSession(
    academyIdentifier: string,
    payload?: { successUrl?: string; cancelUrl?: string; price?: number },
  ) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);
    const stripe = getStripeClient();

    const price = payload?.price || 49;
    const clientBaseUrl = env.CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:3000';

    const successUrl =
      payload?.successUrl ||
      `${clientBaseUrl}/academy/plan/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = payload?.cancelUrl || `${clientBaseUrl}/academy/plan/cancel`;

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'K10 Football Academy - Premium Plan',
              description: 'Unlock unlimited teams, full squad management, and advanced features.',
            },
            unit_amount: Math.round(price * 100), // cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: (academy.userId as any)?.email,
      metadata: {
        paymentType: 'ACADEMY_PREMIUM_PLAN',
        type: 'ACADEMY_PREMIUM_PLAN',
        academyId: academy._id.toString(),
        userId: academy.userId.toString(),
        plan: 'PREMIUM',
        price: price.toString(),
      },
    });

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
      plan: 'PREMIUM',
      amount: price,
      currency: 'USD',
      status: 'AWAITING_PAYMENT',
    };
  }

  async verifyStripePayment(sessionId: string) {
    if (!sessionId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Stripe session ID is required');
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Stripe checkout session not found');
    }

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const academyId = session.metadata?.academyId;
      if (!academyId) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'Session metadata missing academyId');
      }

      const result = await this.activateAcademyPremiumPlan(academyId, session.id);
      return {
        success: true,
        isPaid: true,
        message: 'Payment verified and Premium Plan activated successfully!',
        data: result,
      };
    }

    return {
      success: false,
      isPaid: false,
      message: `Payment is not completed. Current status: ${session.payment_status}`,
      status: session.payment_status,
    };
  }

  async handleAcademyPlanStripeWebhook(eventObject: any) {
    const academyId = eventObject?.metadata?.academyId;
    if (!academyId) return;
    await this.activateAcademyPremiumPlan(academyId, eventObject?.id);
  }
}

export const academyProfileService = new AcademyProfileService();
