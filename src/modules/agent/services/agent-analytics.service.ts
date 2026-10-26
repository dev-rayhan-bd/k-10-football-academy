import { calculateAge, calculateProfileCompletion } from './agent-helpers';
import { env } from '@/config/env';
import { Types } from 'mongoose';
import { AgentProfile } from '../agent.model';
import { UserModel } from '@/modules/user/user.model';
import { Notification } from '@/modules/notification/notification.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { clubService } from '@/modules/club/club.service';
import { ClubFavourite } from '@/modules/club/club.model';
import { Media } from '@/modules/media/media.model';

export class AgentAnalyticsService {
  private formatTimeAgo(dateInput: any): string {
    if (!dateInput) return 'Recently';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'Recently';
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return `Yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async getAgentDashboard(userId: string, query: any = {}) {
    const club = await clubService.resolveClub(userId);
    const agentProfile = await AgentProfile.findOne({ userId }).lean();
    const user = await UserModel.findById(userId).lean();

    const playerShareBase =
      env.SCOUTING_BOARD_SHARE_PLAYER || 'https://k-10-football-academy.onrender.com/players/share';

    // 1. Agent Profile Details (Screenshot 1: 74% PROFILE, ACTIVE AGENT, JOHN DOE, Badges)
    const rawDob = (agentProfile as any)?.dateOfBirth || user?.dateOfBirth;
    const computedAge = calculateAge(rawDob) ?? (agentProfile as any)?.age ?? 58;
    const profileCompletion =
      (agentProfile as any)?.profileCompletion ?? calculateProfileCompletion(agentProfile, user);

    const subscription = await UserSubscription.findOne({ userId, status: 'ACTIVE' })
      .populate('planId')
      .lean();

    const isApproved =
      (agentProfile as any)?.verificationStatus === 'APPROVED' ||
      user?.verificationStatus === 'APPROVED' ||
      Boolean(user?.isVerified);

    const agentInfo = {
      id: agentProfile?._id || club._id,
      name:
        (agentProfile as any)?.fullName || (agentProfile as any)?.name || user?.name || 'JOHN DOE',
      role: 'PREMIUM AGENT',
      tier: 'ACTIVE AGENT',
      age: computedAge,
      country: (agentProfile as any)?.country || user?.country || 'Brazil',
      avatar: user?.avatar || (agentProfile as any)?.avatar || '',
      profileCompletion,
      licenseId:
        (agentProfile as any)?.licenseId ||
        (agentProfile as any)?.fifaLicenseNumber ||
        'UK-AG-2024-001',
      certifications: (agentProfile as any)?.certifications || 'FIFA Licensed Agent',
      contact: user?.phone || (agentProfile as any)?.contact || '+55 11 9999-8888',
      email: user?.email || 'john.doe@example.com',
      agencyName: (agentProfile as any)?.agencyName || user?.agencyName || '',
      verificationStatus:
        (agentProfile as any)?.verificationStatus || user?.verificationStatus || 'APPROVED',
      isApproved,
    };

    // 2. Metrics Cards (Screenshot 1: PLAYERS VIEWED, LIKED CVS, SHARED PROFILES, PROFILE VIEWS)
    const viewedList = club.viewedPlayerProfiles || [];
    const sharedList = club.sharedPlayerProfiles || [];

    const totalLikedCvsCount = await ClubFavourite.countDocuments({
      clubId: club._id,
      targetType: 'PLAYER',
    });

    const totalSharedCount = sharedList.reduce(
      (sum: number, s: any) => sum + (s.shareCount || 1),
      0,
    );

    const metrics = {
      playersViewed: viewedList.length,
      likedCvs: totalLikedCvsCount,
      sharedProfiles: totalSharedCount,
      profileViews: club.profileViews || (agentProfile as any)?.profileViews || 0,
    };

    // 3. Recent Activity (Screenshot 1 top right)
    const [notifications, recentFavs] = await Promise.all([
      Notification.find({ recipientId: userId }).sort({ createdAt: -1 }).limit(10).lean(),
      ClubFavourite.find({
        $or: [{ clubId: club._id }, ...(userId ? [{ clubId: userId }] : [])],
        targetType: 'PLAYER',
      })
        .populate({ path: 'targetPlayerId', select: 'fullName' })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const activityList: any[] = [];

    notifications.forEach((n: any) => {
      activityList.push({
        id: n._id,
        title: n.title,
        description: n.message,
        type: n.type || 'NOTIFICATION',
        timeAgo: this.formatTimeAgo(n.createdAt),
        createdAt: n.createdAt,
      });
    });

    recentFavs.forEach((fav: any) => {
      if (fav.targetPlayerId) {
        activityList.push({
          id: fav._id,
          title: `You liked CV ${(fav.targetPlayerId as any).fullName || 'player'}'s`,
          description: `Added to scouting favourites`,
          type: 'LIKE',
          timeAgo: this.formatTimeAgo(fav.createdAt),
          createdAt: fav.createdAt,
        });
      }
    });

    sharedList.slice(0, 5).forEach((s: any, idx: number) => {
      activityList.push({
        id: `act-share-${idx}`,
        title: `You shared profile ${s.playerName || 'player'}'s`,
        description: `Shared player CV profile`,
        type: 'SHARE',
        timeAgo: this.formatTimeAgo(s.sharedAt || new Date()),
        createdAt: s.sharedAt || new Date(),
      });
    });

    activityList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const recentActivity = activityList.slice(0, 5);

    // 4. Analytics For Players Monitored with Year Filtering (Screenshot 2)
    const selectedYear = query.year ? Number(query.year) : new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0));
    const endOfYear = new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59, 999));

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const cvViewsWeekly = [
      { period: 'Week 1', views: 0 },
      { period: 'Week 2', views: 0 },
      { period: 'Week 3', views: 0 },
      { period: 'Week 4', views: 0 },
    ];
    const cvViewsMonthly = months.map((m) => ({ month: m, views: 0 }));

    viewedList.forEach((v: any) => {
      const vDate = v.viewedAt ? new Date(v.viewedAt) : new Date();
      if (vDate >= startOfYear && vDate <= endOfYear) {
        const mIdx = vDate.getUTCMonth();
        if (cvViewsMonthly[mIdx]) {
          cvViewsMonthly[mIdx].views += v.viewCount || 1;
        }
        const day = vDate.getUTCDate();
        const wIdx = Math.min(3, Math.floor((day - 1) / 7));
        cvViewsWeekly[wIdx].views += v.viewCount || 1;
      }
    });

    // Likes & Shares Activity
    const likesAndSharesWeekly = [
      { period: 'Week 1', likes: 0, shares: 0 },
      { period: 'Week 2', likes: 0, shares: 0 },
      { period: 'Week 3', likes: 0, shares: 0 },
      { period: 'Week 4', likes: 0, shares: 0 },
    ];
    const likesAndSharesMonthly = months.map((m) => ({ month: m, likes: 0, shares: 0 }));

    const yearFavs = await ClubFavourite.find({
      clubId: club._id,
      targetType: 'PLAYER',
      createdAt: { $gte: startOfYear, $lte: endOfYear },
    }).select('createdAt');

    yearFavs.forEach((f: any) => {
      const fDate = new Date(f.createdAt);
      const mIdx = fDate.getUTCMonth();
      if (likesAndSharesMonthly[mIdx]) {
        likesAndSharesMonthly[mIdx].likes++;
      }
      const day = fDate.getUTCDate();
      const wIdx = Math.min(3, Math.floor((day - 1) / 7));
      likesAndSharesWeekly[wIdx].likes++;
    });

    sharedList.forEach((s: any) => {
      const sDate = s.sharedAt ? new Date(s.sharedAt) : new Date();
      if (sDate >= startOfYear && sDate <= endOfYear) {
        const mIdx = sDate.getUTCMonth();
        if (likesAndSharesMonthly[mIdx]) {
          likesAndSharesMonthly[mIdx].shares += s.shareCount || 1;
        }
        const day = sDate.getUTCDate();
        const wIdx = Math.min(3, Math.floor((day - 1) / 7));
        likesAndSharesWeekly[wIdx].shares += s.shareCount || 1;
      }
    });

    // 5. Monitored Players Table (Screenshot 3) - Aggregation with $lookup
    const matchStage: any = { isDeleted: { $ne: true } };

    if (query.position && query.position !== 'All Positions' && query.position !== 'ALL') {
      matchStage.position = new RegExp(String(query.position).trim(), 'i');
    }
    if (query.country && query.country !== 'Country' && query.country !== 'ALL') {
      matchStage.country = new RegExp(String(query.country).trim(), 'i');
    }
    if (query.status && query.status !== 'All Status' && query.status !== 'ALL') {
      matchStage.cvTier = String(query.status).toUpperCase();
    }
    if (query.ageRange) {
      const parts = String(query.ageRange).split('-');
      if (parts.length === 2) {
        const min = parseInt(parts[0], 10);
        const max = parseInt(parts[1], 10);
        if (!isNaN(min) && !isNaN(max)) {
          matchStage.age = { $gte: min, $lte: max };
        }
      }
    } else if (query.minAge || query.maxAge) {
      matchStage.age = {};
      if (query.minAge) matchStage.age.$gte = Number(query.minAge);
      if (query.maxAge) matchStage.age.$lte = Number(query.maxAge);
    }
    if (query.search) {
      const sRegex = new RegExp(String(query.search).trim(), 'i');
      matchStage.$or = [
        { fullName: sRegex },
        { currentClub: sRegex },
        { academy: sRegex },
        { country: sRegex },
        { position: sRegex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));

    const aggregatePipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'playerattributes',
          localField: '_id',
          foreignField: 'playerId',
          as: 'attributesDoc',
        },
      },
      {
        $unwind: {
          path: '$attributesDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'clubfavourites',
          let: { playerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$targetPlayerId', '$$playerId'] },
                    { $eq: ['$targetType', 'PLAYER'] },
                    { $in: ['$clubId', [club._id, new Types.ObjectId(userId)]] },
                  ],
                },
              },
            },
          ],
          as: 'likedDocs',
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: '$likedDocs' }, 0] },
        },
      },
      { $sort: { overallRating: -1, createdAt: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ];

    const [aggResult] = await PlayerProfile.aggregate(aggregatePipeline);
    const totalPlayers = aggResult?.metadata?.[0]?.total || 0;
    const rawMonitoredPlayers = aggResult?.data || [];

    const sharedPlayerIdSet = new Set(
      sharedList.map((s: any) => s.playerId?.toString()).filter(Boolean),
    );

    const formattedMonitoredPlayers = rawMonitoredPlayers.map((p: any) => {
      let age = typeof p.age === 'number' ? p.age : null;
      if (p.dateOfBirth) {
        const diffMs = Date.now() - new Date(p.dateOfBirth).getTime();
        age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
      }
      const rawRating = typeof p.overallRating === 'number' ? p.overallRating : 75;
      const ratingStr = rawRating > 10 ? (rawRating / 10).toFixed(1) : rawRating.toFixed(1);

      let statusTier: string;
      if (p.cvTier) {
        statusTier = p.cvTier.charAt(0).toUpperCase() + p.cvTier.slice(1).toLowerCase();
      } else if (rawRating >= 85) {
        statusTier = 'Gold';
      } else if (rawRating >= 75) {
        statusTier = 'Silver';
      } else {
        statusTier = 'Bronze';
      }

      return {
        id: p._id,
        name: p.fullName || 'Unknown Player',
        position: p.position || 'Forward',
        avatar: p.profileImage || p.avatar || null,
        rating: ratingStr,
        club: p.currentClub || p.academy || 'Free Agent',
        country: p.country || '',
        age: age ?? 18,
        status: statusTier,
        isLiked: Boolean(p.isLiked),
        isShared: sharedPlayerIdSet.has(p._id.toString()),
        shareableUrl: `${playerShareBase}/${p._id}`,
      };
    });

    // 6. Media Section (Screenshot 4)
    const mediaItems = await Media.find({
      $or: [
        { userId: new Types.ObjectId(userId) },
        { clubId: club._id },
        { role: 'AGENT', userId: new Types.ObjectId(userId) },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    const formattedMedia = mediaItems.map((m: any) => ({
      id: m._id,
      title: m.title || 'Match highlight',
      url: m.url,
      thumbnailUrl: m.thumbnailUrl || m.url,
      date: m.createdAt
        ? new Date(m.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '',
      views: m.views || 0,
      likes: m.likes || 0,
      mediaType: m.mediaType,
    }));

    const images = formattedMedia.filter((m: any) => m.mediaType === 'IMAGE');
    const videos = formattedMedia.filter((m: any) => m.mediaType === 'VIDEO');

    return {
      agent: agentInfo,
      metrics,
      recentActivity,
      analytics: {
        selectedYear,
        title: 'Analytics For Players Monitored',
        subtitle: 'Insights based on Players interactions, profile activity & performance data.',
        cvViewsOverTime: {
          weekly: cvViewsWeekly,
          monthly: cvViewsMonthly,
        },
        likesAndSharesActivity: {
          weekly: likesAndSharesWeekly,
          monthly: likesAndSharesMonthly,
        },
      },
      monitoredPlayers: {
        meta: {
          page,
          limit,
          total: totalPlayers,
          totalPages: Math.ceil(totalPlayers / limit) || 1,
        },
        data: formattedMonitoredPlayers,
      },
      media: {
        images,
        videos,
      },
      subscription: subscription
        ? {
            status: subscription.status,
            plan: subscription.planId,
            nextBillingDate: subscription.nextBillingDate,
            amountPaid: subscription.amountPaid,
          }
        : null,
      accessStatus: {
        isApproved,
        hasActiveSubscription: Boolean(subscription),
        isAccessActive: isApproved && Boolean(subscription),
      },
    };
  }

  async getAgentAnalytics(userId: string, query: any = {}) {
    const club = await clubService.resolveClub(userId);
    const agentProfile = await AgentProfile.findOne({ userId });

    const selectedYear = query.year ? Number(query.year) : new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0));
    const endOfYear = new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59, 999));

    // Filter viewed profiles for the selected year
    const viewedProfiles = (club.viewedPlayerProfiles || []).filter((v: any) => {
      if (!v.viewedAt) return true;
      const d = new Date(v.viewedAt);
      return d >= startOfYear && d <= endOfYear;
    });
    const playersProfileViewedCount = viewedProfiles.length;

    // Filter liked CVs for the selected year
    const likedCvsCount = await ClubFavourite.countDocuments({
      clubId: club._id,
      targetType: 'PLAYER',
      createdAt: { $gte: startOfYear, $lte: endOfYear },
    });

    // Filter shared profiles for the selected year
    const sharedProfiles = (club.sharedPlayerProfiles || []).filter((s: any) => {
      if (!s.sharedAt) return true;
      const d = new Date(s.sharedAt);
      return d >= startOfYear && d <= endOfYear;
    });
    const sharedProfilesCount = sharedProfiles.reduce(
      (sum: number, s: any) => sum + (s.shareCount || 1),
      0,
    );

    const totalViewsOnPlayers = viewedProfiles.reduce(
      (sum: number, v: any) => sum + (v.viewCount || 1),
      0,
    );
    const profileViewsCount =
      club.profileViews ||
      totalViewsOnPlayers ||
      (agentProfile?.cvsSharedCount ? agentProfile.cvsSharedCount * 12 : 0) ||
      0;

    const now = new Date();
    const isCurrentYear = selectedYear === now.getFullYear();

    const weeks = isCurrentYear
      ? [
          {
            week: 'Week 1',
            start: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 2',
            start: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 3',
            start: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 4',
            start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            end: now,
            views: 0,
            likes: 0,
            shares: 0,
          },
        ]
      : [
          {
            week: 'Week 1',
            start: new Date(Date.UTC(selectedYear, 0, 1)),
            end: new Date(Date.UTC(selectedYear, 2, 31, 23, 59, 59)),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 2',
            start: new Date(Date.UTC(selectedYear, 3, 1)),
            end: new Date(Date.UTC(selectedYear, 5, 30, 23, 59, 59)),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 3',
            start: new Date(Date.UTC(selectedYear, 6, 1)),
            end: new Date(Date.UTC(selectedYear, 8, 30, 23, 59, 59)),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 4',
            start: new Date(Date.UTC(selectedYear, 9, 1)),
            end: new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59)),
            views: 0,
            likes: 0,
            shares: 0,
          },
        ];

    viewedProfiles.forEach((v: any) => {
      const vDate = v.viewedAt ? new Date(v.viewedAt) : now;
      for (const w of weeks) {
        if (vDate >= w.start && vDate <= w.end) {
          w.views += v.viewCount || 1;
          break;
        }
      }
    });

    const favs = await ClubFavourite.find({
      clubId: club._id,
      targetType: 'PLAYER',
      createdAt: { $gte: weeks[0].start, $lte: weeks[weeks.length - 1].end },
    }).select('createdAt');

    favs.forEach((f: any) => {
      const fDate = new Date(f.createdAt);
      for (const w of weeks) {
        if (fDate >= w.start && fDate <= w.end) {
          w.likes++;
          break;
        }
      }
    });

    sharedProfiles.forEach((s: any) => {
      const sDate = s.sharedAt ? new Date(s.sharedAt) : now;
      for (const w of weeks) {
        if (sDate >= w.start && sDate <= w.end) {
          w.shares += s.shareCount || 1;
          break;
        }
      }
    });

    return {
      selectedYear,
      title: 'Analytics For Players Monitored',
      subtitle: 'Insights Based on Players Interactions, Profile Activity & Performance Data.',
      overview: {
        playersProfileViewed: {
          label: 'Players Profile Viewed',
          count: playersProfileViewedCount,
        },
        likedCvs: {
          label: 'Liked CVs',
          count: likedCvsCount,
        },
        sharedProfiles: {
          label: 'Shared Profiles',
          count: sharedProfilesCount,
        },
        profileViews: {
          label: 'Profile Views',
          count: profileViewsCount,
        },
      },
      cvsViewsOverTime: weeks.map((w) => ({
        week: w.week,
        views: w.views,
      })),
      likesAndSharesActivity: weeks.map((w) => ({
        week: w.week,
        likes: w.likes,
        shares: w.shares,
      })),
    };
  }
}

export const agentAnalyticsService = new AgentAnalyticsService();
