/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserModel } from '@/modules/user/user.model';
import { MatchRecord } from '@/modules/player/player.model';
import { GameReport, AcademySuccessStory } from '@/modules/academy/academy.model';
import { ParentMatchReport } from '@/modules/parent/parent.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { ShopOrder } from '@/modules/shop/shop.model';
import { PlatformPayment } from '../admin.model';
import { SuccessStory } from '@/modules/agent/agent.model';
import { ClubSuccessStory, ClubFavourite } from '@/modules/club/club.model';
import { IAdminDashboardQuery, isIgnoredFilter, formatDateYMD, formatTimeAgo } from './admin.utils';

const BI_MONTHLY_BUCKETS = [
  { index: 1, label: 'Jan-Feb', months: [1, 2] },
  { index: 2, label: 'Mar-Apr', months: [3, 4] },
  { index: 3, label: 'May-Jun', months: [5, 6] },
  { index: 4, label: 'Jul-Aug', months: [7, 8] },
  { index: 5, label: 'Sept-Oct', months: [9, 10] },
  { index: 6, label: 'Nov-Dec', months: [11, 12] },
];

const ROLE_DISPLAY_MAP: Record<string, string> = {
  PLAYER: 'Player',
  COACH: 'Coach',
  ACADEMY: 'Academy',
  AGENT: 'Agent',
  CLUB: 'Club',
  PARENT: 'Parent',
};

export class AdminDashboardService {
  /**
   * GET /api/v1/admin/dashboard
   * Returns:
   * 1. Hero banner information
   * 2. Top-right Pending Approvals widget
   * 3. 4 Main summary metric cards (Total Users, Revenue This Month, Pending Verifications, Active Subscriptions)
   * 4. Analytics graphs with year filtering (Revenue Overview bar chart & Membership Growth line chart)
   * 5. Recent Activities table
   */
  async getDashboard(query: IAdminDashboardQuery) {
    // -------------------------------------------------------------------------
    // 1. Year Filtering for Analytics (Graph & Charts)
    // -------------------------------------------------------------------------
    const rawYear = query.year !== undefined ? String(query.year).trim().toUpperCase() : '';
    const hasYearFilter = Boolean(rawYear && !isIgnoredFilter(rawYear) && !isNaN(Number(rawYear)));
    const currentYear = new Date().getFullYear();
    const selectedYear = hasYearFilter ? Number(rawYear) : rawYear === 'ALL' ? null : currentYear;

    let chartStartDate: Date | undefined;
    let chartEndDate: Date | undefined;

    if (selectedYear) {
      chartStartDate = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0, 0));
      chartEndDate = new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59, 999));
    }

    const buildDateMatch = (field: string) => {
      if (!chartStartDate && !chartEndDate) return {};
      const cond: Record<string, Date> = {};
      if (chartStartDate) cond.$gte = chartStartDate;
      if (chartEndDate) cond.$lte = chartEndDate;
      return { [field]: cond };
    };

    // Current month boundaries for "REVENUE THIS MONTH" card
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0));
    const endOfMonth = new Date(
      Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    );

    // -------------------------------------------------------------------------
    // 2. Parallel Database Aggregations & Queries
    // -------------------------------------------------------------------------
    const [
      totalUsersCount,
      pendingVerificationsCount,
      activeSubscriptionsCount,
      // Monthly Revenue streams
      subMonthAgg,
      mrMonthAgg,
      prMonthAgg,
      grMonthAgg,
      soMonthAgg,
      ppMonthAgg,
      // Top-right Pending Approvals widget
      pendingUsers,
      pendingAcStories,
      pendingAgStories,
      pendingClStories,
      // Analytics: Revenue Overview streams (filtered by selected year)
      subYearAgg,
      mrYearAgg,
      prYearAgg,
      grYearAgg,
      soYearAgg,
      ppYearAgg,
      // Analytics: Membership Growth streams (filtered by selected year)
      userGrowthAgg,
      subGrowthAgg,
      // Recent Activities sources
      recentUsers,
      recentSubscriptions,
      recentMatchRecords,
      recentGameReports,
      recentFavourites,
      recentStories,
    ] = await Promise.all([
      // 1. Total Users
      UserModel.countDocuments({ role: { $ne: 'SUPER_ADMIN' } }),

      // 2. Pending Verifications (Agents & Clubs)
      UserModel.countDocuments({
        role: { $in: ['AGENT', 'CLUB'] },
        verificationStatus: 'PENDING',
      }),

      // 3. Active Subscriptions
      UserSubscription.countDocuments({ status: 'ACTIVE' }),

      // Monthly Revenue components
      UserSubscription.aggregate([
        {
          $match: {
            status: 'ACTIVE',
            startDate: { $gte: startOfMonth, $lte: endOfMonth },
            amountPaid: { $gt: 0 },
          },
        },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
      MatchRecord.aggregate([
        {
          $match: {
            'coachReview.paymentStatus': 'PAID',
            'coachReview.paymentAmount': { $gt: 0 },
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$coachReview.paymentAmount' } } },
      ]),
      ParentMatchReport.aggregate([
        {
          $match: {
            paymentStatus: 'PAID',
            coachReviewPrice: { $gt: 0 },
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$coachReviewPrice' } } },
      ]),
      GameReport.aggregate([
        {
          $match: {
            paymentStatus: 'PAID',
            price: { $gt: 0 },
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$price' } } },
      ]),
      ShopOrder.aggregate([
        {
          $match: {
            paymentStatus: 'PAID',
            totalAmount: { $gt: 0 },
            paidAt: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      PlatformPayment.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            overrideTargetId: { $exists: false },
            amount: { $gt: 0 },
            paymentDate: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      // Pending Approvals (Top 10 candidates per category)
      UserModel.find({
        role: { $in: ['AGENT', 'CLUB'] },
        verificationStatus: 'PENDING',
      })
        .select('_id name email role avatar clubName agencyName createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      AcademySuccessStory.find({ status: 'PENDING', isDeleted: false })
        .populate('academyId', 'name logo')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      SuccessStory.find({ status: 'PENDING', isDeleted: false })
        .populate('creatorId', 'name avatar agencyName')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      ClubSuccessStory.find({ status: 'PENDING', isDeleted: false })
        .populate('clubId', 'name logo')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      // Chart 1: Revenue Overview by Bi-Monthly Bucket
      UserSubscription.aggregate([
        { $addFields: { effectiveDate: { $ifNull: ['$startDate', '$createdAt'] } } },
        ...(chartStartDate || chartEndDate ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        { $match: { status: 'ACTIVE', amountPaid: { $gt: 0 } } },
        {
          $addFields: { biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } } },
        },
        { $group: { _id: '$biMonthBucket', revenue: { $sum: '$amountPaid' } } },
      ]),
      MatchRecord.aggregate([
        { $addFields: { effectiveDate: { $ifNull: ['$createdAt', '$matchDate'] } } },
        ...(chartStartDate || chartEndDate ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        {
          $match: { 'coachReview.paymentStatus': 'PAID', 'coachReview.paymentAmount': { $gt: 0 } },
        },
        {
          $addFields: { biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } } },
        },
        { $group: { _id: '$biMonthBucket', revenue: { $sum: '$coachReview.paymentAmount' } } },
      ]),
      ParentMatchReport.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$paidAt', { $ifNull: ['$createdAt', '$matchDate'] }] },
          },
        },
        ...(chartStartDate || chartEndDate ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        { $match: { paymentStatus: 'PAID', coachReviewPrice: { $gt: 0 } } },
        {
          $addFields: { biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } } },
        },
        { $group: { _id: '$biMonthBucket', revenue: { $sum: '$coachReviewPrice' } } },
      ]),
      GameReport.aggregate([
        { $addFields: { effectiveDate: { $ifNull: ['$createdAt', '$matchDate'] } } },
        ...(chartStartDate || chartEndDate ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        { $match: { paymentStatus: 'PAID', price: { $gt: 0 } } },
        {
          $addFields: { biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } } },
        },
        { $group: { _id: '$biMonthBucket', revenue: { $sum: '$price' } } },
      ]),
      ShopOrder.aggregate([
        { $addFields: { effectiveDate: { $ifNull: ['$paidAt', '$createdAt'] } } },
        ...(chartStartDate || chartEndDate ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        { $match: { paymentStatus: 'PAID', totalAmount: { $gt: 0 } } },
        {
          $addFields: { biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } } },
        },
        { $group: { _id: '$biMonthBucket', revenue: { $sum: '$totalAmount' } } },
      ]),
      PlatformPayment.aggregate([
        { $addFields: { effectiveDate: { $ifNull: ['$paymentDate', '$createdAt'] } } },
        ...(chartStartDate || chartEndDate ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        {
          $match: { status: 'COMPLETED', overrideTargetId: { $exists: false }, amount: { $gt: 0 } },
        },
        {
          $addFields: { biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } } },
        },
        { $group: { _id: '$biMonthBucket', revenue: { $sum: '$amount' } } },
      ]),

      // Chart 2: Membership Growth by Bi-Monthly Bucket
      UserModel.aggregate([
        {
          $match: {
            role: { $in: ['PLAYER', 'COACH', 'ACADEMY', 'AGENT', 'CLUB'] },
            ...buildDateMatch('createdAt'),
          },
        },
        { $addFields: { biMonthBucket: { $ceil: { $divide: [{ $month: '$createdAt' }, 2] } } } },
        { $group: { _id: '$biMonthBucket', count: { $sum: 1 } } },
      ]),
      UserSubscription.aggregate([
        {
          $addFields: { effectiveDate: { $ifNull: ['$startDate', '$createdAt'] } },
        },
        ...(chartStartDate || chartEndDate ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        { $match: { status: 'ACTIVE' } },
        {
          $addFields: { biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } } },
        },
        { $group: { _id: '$biMonthBucket', count: { $sum: 1 } } },
      ]),

      // Recent Activities sources (limit 15 each)
      UserModel.find({ role: { $ne: 'SUPER_ADMIN' } })
        .select(
          '_id name email role avatar clubName agencyName verificationStatus status createdAt',
        )
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      UserSubscription.find()
        .populate('userId', 'name email role avatar')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      MatchRecord.find()
        .populate('playerId', 'fullName userId profileImage')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      GameReport.find()
        .populate('academyId', 'name logo')
        .populate('playerId', 'fullName')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      ClubFavourite.find()
        .populate('clubId', 'name logo')
        .populate('targetPlayerId', 'fullName')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      ClubSuccessStory.find({ isDeleted: false })
        .populate('clubId', 'name logo')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
    ]);

    // -------------------------------------------------------------------------
    // 3. Compute REVENUE THIS MONTH
    // -------------------------------------------------------------------------
    const monthlyTotal =
      (subMonthAgg[0]?.total || 0) +
      (mrMonthAgg[0]?.total || 0) +
      (prMonthAgg[0]?.total || 0) +
      (grMonthAgg[0]?.total || 0) +
      (soMonthAgg[0]?.total || 0) +
      (ppMonthAgg[0]?.total || 0);

    const revenueThisMonth = parseFloat(monthlyTotal.toFixed(2));

    // -------------------------------------------------------------------------
    // 4. Assemble Top-Right "PENDING APPROVALS" Widget
    // -------------------------------------------------------------------------
    const pendingList: any[] = [];

    for (const u of pendingUsers) {
      pendingList.push({
        _id: u._id.toString(),
        targetId: u._id.toString(),
        name: u.clubName || u.agencyName || u.name || 'Application',
        role: u.role,
        roleLabel: ROLE_DISPLAY_MAP[u.role] || u.role,
        avatar: u.avatar || '',
        type: 'REGISTRATION',
        status: 'PENDING',
        timeAgo: formatTimeAgo(u.createdAt),
        createdAt: u.createdAt,
      });
    }

    for (const s of pendingAcStories as any[]) {
      const ac = s.academyId;
      pendingList.push({
        _id: s._id.toString(),
        targetId: s._id.toString(),
        name: s.storyTitle || ac?.name || 'Academy Story',
        role: 'ACADEMY',
        roleLabel: 'Academy',
        avatar: s.photo || ac?.logo || '',
        type: 'SUCCESS_STORY',
        status: 'PENDING',
        timeAgo: formatTimeAgo(s.createdAt),
        createdAt: s.createdAt,
      });
    }

    for (const s of pendingAgStories as any[]) {
      const ag = s.creatorId;
      pendingList.push({
        _id: s._id.toString(),
        targetId: s._id.toString(),
        name: s.storyTitle || ag?.agencyName || ag?.name || 'Agent Story',
        role: 'AGENT',
        roleLabel: 'Agent',
        avatar: s.image || ag?.avatar || '',
        type: 'SUCCESS_STORY',
        status: 'PENDING',
        timeAgo: formatTimeAgo(s.createdAt),
        createdAt: s.createdAt,
      });
    }

    for (const s of pendingClStories as any[]) {
      const cl = s.clubId;
      pendingList.push({
        _id: s._id.toString(),
        targetId: s._id.toString(),
        name: s.storyTitle || cl?.name || 'Club Story',
        role: 'CLUB',
        roleLabel: 'Club',
        avatar: s.coverImage || cl?.logo || '',
        type: 'SUCCESS_STORY',
        status: 'PENDING',
        timeAgo: formatTimeAgo(s.createdAt),
        createdAt: s.createdAt,
      });
    }

    pendingList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const pendingApprovals = pendingList.slice(0, 5);

    // -------------------------------------------------------------------------
    // 5. Build Chart 1: Revenue Overview
    // -------------------------------------------------------------------------
    const revMatrix = new Map<number, number>();
    for (const b of BI_MONTHLY_BUCKETS) {
      revMatrix.set(b.index, 0);
    }

    const mergeRevenue = (agg: any[]) => {
      for (const row of agg) {
        const bucket = Number(row._id);
        if (bucket >= 1 && bucket <= 6) {
          revMatrix.set(bucket, (revMatrix.get(bucket) || 0) + (Number(row.revenue) || 0));
        }
      }
    };

    mergeRevenue(subYearAgg);
    mergeRevenue(mrYearAgg);
    mergeRevenue(prYearAgg);
    mergeRevenue(grYearAgg);
    mergeRevenue(soYearAgg);
    mergeRevenue(ppYearAgg);

    const revenueOverview = BI_MONTHLY_BUCKETS.map((b) => {
      const val = parseFloat((revMatrix.get(b.index) || 0).toFixed(2));
      return {
        period: b.label,
        bucketIndex: b.index,
        revenue: val,
      };
    });

    // -------------------------------------------------------------------------
    // 6. Build Chart 2: Membership Growth
    // -------------------------------------------------------------------------
    const userGrowthMap = new Map<number, number>();
    const subGrowthMap = new Map<number, number>();
    for (const b of BI_MONTHLY_BUCKETS) {
      userGrowthMap.set(b.index, 0);
      subGrowthMap.set(b.index, 0);
    }

    for (const row of userGrowthAgg) {
      const bucket = Number(row._id);
      if (bucket >= 1 && bucket <= 6) {
        userGrowthMap.set(bucket, (userGrowthMap.get(bucket) || 0) + (row.count || 0));
      }
    }

    for (const row of subGrowthAgg) {
      const bucket = Number(row._id);
      if (bucket >= 1 && bucket <= 6) {
        subGrowthMap.set(bucket, (subGrowthMap.get(bucket) || 0) + (row.count || 0));
      }
    }

    let cumulativeGrowth = 0;
    const membershipGrowth = BI_MONTHLY_BUCKETS.map((b) => {
      const newMembers = userGrowthMap.get(b.index) || 0;
      const activeSubs = subGrowthMap.get(b.index) || 0;
      const periodTotal = newMembers + activeSubs;
      cumulativeGrowth += periodTotal;

      return {
        period: b.label,
        bucketIndex: b.index,
        members: newMembers,
        activeSubscriptions: activeSubs,
        total: periodTotal,
        cumulativeTotal: cumulativeGrowth,
      };
    });

    // -------------------------------------------------------------------------
    // 7. Assemble Recent Activities Table (Image 2 & 3)
    // -------------------------------------------------------------------------
    const activities: any[] = [];

    // User registrations & verifications
    for (const u of recentUsers) {
      const isVerification = u.role === 'AGENT' || u.role === 'CLUB';
      const action = isVerification ? 'Verification' : 'Created Profile';
      const status =
        u.verificationStatus === 'APPROVED' || u.status === 'ACTIVE' ? 'Completed' : 'Pending';

      activities.push({
        _id: u._id.toString(),
        name: u.clubName || u.agencyName || u.name || 'User',
        role: ROLE_DISPLAY_MAP[u.role] || u.role,
        action,
        date: formatDateYMD(u.createdAt),
        status,
        createdAt: u.createdAt,
      });
    }

    // Subscriptions
    for (const sub of recentSubscriptions as any[]) {
      const u = sub.userId;
      if (u) {
        activities.push({
          _id: sub._id.toString(),
          name: u.name || 'Subscriber',
          role: ROLE_DISPLAY_MAP[u.role || sub.category] || 'Member',
          action: 'Subscription Renewed',
          date: formatDateYMD(sub.startDate || sub.createdAt),
          status: sub.status === 'ACTIVE' ? 'Completed' : 'Pending',
          createdAt: sub.createdAt,
        });
      }
    }

    // Match / Game Reports
    for (const mr of recentMatchRecords as any[]) {
      const pl = mr.playerId;
      const isCompleted =
        mr.coachReview?.paymentStatus === 'PAID' || mr.coachReview?.status === 'COMPLETED';
      activities.push({
        _id: mr._id.toString(),
        name: pl?.fullName || mr.coachReview?.coachName || 'Player',
        role: 'Player',
        action: 'Game Reports',
        date: formatDateYMD(mr.createdAt || mr.matchDate),
        status: isCompleted ? 'Completed' : 'Pending',
        createdAt: mr.createdAt,
      });
    }

    for (const gr of recentGameReports as any[]) {
      const pl = gr.playerId;
      const ac = gr.academyId;
      activities.push({
        _id: gr._id.toString(),
        name: pl?.fullName || ac?.name || 'Academy Report',
        role: 'Academy',
        action: 'Game Reports',
        date: formatDateYMD(gr.createdAt || gr.matchDate),
        status: gr.paymentStatus === 'PAID' ? 'Completed' : 'Pending',
        createdAt: gr.createdAt,
      });
    }

    // Club Favourite / Player Liked
    for (const fav of recentFavourites as any[]) {
      const cl = fav.clubId;
      activities.push({
        _id: fav._id.toString(),
        name: cl?.name || 'Club',
        role: 'Club',
        action: 'Player Liked',
        date: formatDateYMD(fav.createdAt),
        status: 'Completed',
        createdAt: fav.createdAt,
      });
    }

    // Success Stories
    for (const s of recentStories as any[]) {
      const cl = s.clubId;
      activities.push({
        _id: s._id.toString(),
        name: s.storyTitle || cl?.name || 'Club Story',
        role: 'Club',
        action: 'Success Story',
        date: formatDateYMD(s.date || s.createdAt),
        status: s.status === 'APPROVED' ? 'Completed' : 'Pending',
        createdAt: s.createdAt,
      });
    }

    // Sort all activities descending by date
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const total = activities.length;
    const paginatedActivities = activities
      .slice((page - 1) * limit, page * limit)

      .map(({ createdAt: _c, ...rest }) => rest);

    // -------------------------------------------------------------------------
    // 8. Final Clean Response (Zero filter object, 100% DB-driven values)
    // -------------------------------------------------------------------------
    return {
      // Top Hero Banner
      hero: {
        platformTitle: 'K10 FOOTBALL',
        tier: 'SUPER ADMIN',
        contactPhone: '+55 11 9999-8888',
        contactEmail: 'contact@santosfc.academy',
      },

      // Top 4 Metric Cards (Image 1)
      summary: {
        totalUsers: totalUsersCount,
        revenueThisMonth,
        pendingVerifications: pendingVerificationsCount,
        activeSubscriptions: activeSubscriptionsCount,
        currency: '$',
      },

      // Top Right: Pending Approvals Widget (Image 1)
      pendingApprovals,

      // Analytics Section (Image 2 & 3: Deep Insights)
      analytics: {
        selectedYear: selectedYear || 'ALL',
        revenueOverview,
        membershipGrowth,
      },

      // Recent Activities Table (Image 2 & 3)
      recentActivities: paginatedActivities,

      // Clean pagination metadata (no filter object included)
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const adminDashboardService = new AdminDashboardService();
