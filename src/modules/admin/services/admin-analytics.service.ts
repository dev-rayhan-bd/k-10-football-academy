/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserModel } from '@/modules/user/user.model';
import { MatchRecord } from '@/modules/player/player.model';
import { GameReport, AcademyFinanceTransaction } from '@/modules/academy/academy.model';
import { ParentMatchReport } from '@/modules/parent/parent.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { ShopOrder } from '@/modules/shop/shop.model';
import { PlatformPayment } from '../admin.model';
import {
  IAdminAnalyticsQuery,
  isIgnoredFilter,
  parseFlexibleDate,
  inferTargetRole,
} from './admin.utils';

const BI_MONTHLY_BUCKETS = [
  { index: 1, label: 'Jan-Feb', months: [1, 2] },
  { index: 2, label: 'Mar-Apr', months: [3, 4] },
  { index: 3, label: 'May-Jun', months: [5, 6] },
  { index: 4, label: 'Jul-Aug', months: [7, 8] },
  { index: 5, label: 'Sept-Oct', months: [9, 10] },
  { index: 6, label: 'Nov-Dec', months: [11, 12] },
];

const ANALYTICS_ROLES = ['PLAYER', 'COACH', 'ACADEMY', 'AGENT', 'CLUB'] as const;

const ROLE_DISPLAY_MAP: Record<string, string> = {
  PLAYER: 'Player',
  COACH: 'Coach',
  ACADEMY: 'Academy',
  AGENT: 'Agent',
  CLUB: 'Club',
};

export class AdminAnalyticsService {
  /**
   * GET /api/v1/admin/analytics
   * Uses MongoDB Aggregation Pipelines ($match, $lookup, $facet, $group, $project)
   * Supports filtering by ?year=2026 (or ALL), ?role=PLAYER|COACH|ACADEMY|AGENT|CLUB|ALL, ?startDate, ?endDate
   */
  async getAnalytics(query: IAdminAnalyticsQuery) {
    // Parse year filter (supports ?year=2026 or ?year=ALL; if omitted, aggregates across all years or selected year)
    const rawYear = query.year !== undefined ? String(query.year).trim().toUpperCase() : '';
    const hasYearFilter = Boolean(rawYear && !isIgnoredFilter(rawYear) && !isNaN(Number(rawYear)));
    const selectedYear = hasYearFilter ? Number(rawYear) : null;

    // Parse role filter for "USER GROWTH BY ROLE" dropdown (ALL ROLES | PLAYER | COACH | ACADEMY | AGENT | CLUB)
    const rawRole = query.role !== undefined ? String(query.role).trim() : '';
    const hasRoleFilter = Boolean(rawRole && !isIgnoredFilter(rawRole));
    const selectedRole = hasRoleFilter ? inferTargetRole(rawRole) : 'ALL';

    // Date range filter (if year or startDate/endDate is provided)
    let dateRangeStart: Date | undefined;
    let dateRangeEnd: Date | undefined;

    if (selectedYear) {
      dateRangeStart = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0, 0));
      dateRangeEnd = new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59, 999));
    } else {
      dateRangeStart = parseFlexibleDate(query.startDate);
      dateRangeEnd = parseFlexibleDate(query.endDate);
      if (dateRangeEnd) {
        dateRangeEnd.setHours(23, 59, 59, 999);
      }
    }

    const buildDateMatch = (field: string) => {
      if (!dateRangeStart && !dateRangeEnd) return {};
      const cond: Record<string, Date> = {};
      if (dateRangeStart) cond.$gte = dateRangeStart;
      if (dateRangeEnd) cond.$lte = dateRangeEnd;
      return { [field]: cond };
    };

    // =========================================================================
    // 1. USER AGGREGATION PIPELINE ($lookup role profiles + $facet)
    // =========================================================================
    const userMatchStage: Record<string, any> = {
      role: { $in: [...ANALYTICS_ROLES] },
      ...buildDateMatch('createdAt'),
    };

    const [
      userFacetResult,
      allTimeUsersCount,
      subscriptionAggResult,
      matchRecordAggResult,
      parentReportAggResult,
      financeTxnAggResult,
      gameReportAggResult,
      shopOrderAggResult,
      platformPaymentAggResult,
    ] = await Promise.all([
      UserModel.aggregate([
        { $match: userMatchStage },
        // Enrich with role profile via $lookup
        {
          $lookup: {
            from: 'playerprofiles',
            localField: '_id',
            foreignField: 'userId',
            pipeline: [{ $project: { _id: 1, createdAt: 1 } }],
            as: 'playerProfile',
          },
        },
        {
          $lookup: {
            from: 'coachprofiles',
            localField: '_id',
            foreignField: 'userId',
            pipeline: [{ $project: { _id: 1, createdAt: 1 } }],
            as: 'coachProfile',
          },
        },
        {
          $lookup: {
            from: 'academyprofiles',
            localField: '_id',
            foreignField: 'userId',
            pipeline: [{ $project: { _id: 1, createdAt: 1 } }],
            as: 'academyProfile',
          },
        },
        {
          $lookup: {
            from: 'agentprofiles',
            localField: '_id',
            foreignField: 'userId',
            pipeline: [{ $project: { _id: 1, createdAt: 1 } }],
            as: 'agentProfile',
          },
        },
        {
          $lookup: {
            from: 'clubprofiles',
            localField: '_id',
            foreignField: 'userId',
            pipeline: [{ $project: { _id: 1, createdAt: 1 } }],
            as: 'clubProfile',
          },
        },
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$createdAt', new Date()] },
          },
        },
        {
          $addFields: {
            month: { $month: '$effectiveDate' },
            year: { $year: '$effectiveDate' },
            biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } },
          },
        },
        {
          $facet: {
            totalCount: [{ $count: 'count' }],
            byRole: [
              {
                $group: {
                  _id: '$role',
                  count: { $sum: 1 },
                },
              },
            ],
            byBiMonthAndRole: [
              ...(selectedRole !== 'ALL' ? [{ $match: { role: selectedRole } }] : []),
              {
                $group: {
                  _id: { bucket: '$biMonthBucket', role: '$role' },
                  count: { $sum: 1 },
                },
              },
            ],
            years: [
              {
                $group: {
                  _id: '$year',
                },
              },
              { $sort: { _id: -1 } },
            ],
          },
        },
      ]),

      UserModel.countDocuments({ role: { $in: [...ANALYTICS_ROLES] } }),

      // =========================================================================
      // 2. SUBSCRIPTION REVENUE & COUNT AGGREGATION ($lookup membershipplans & users)
      // =========================================================================
      UserSubscription.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$startDate', '$createdAt'] },
          },
        },
        ...(dateRangeStart || dateRangeEnd ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        {
          $match: {
            status: { $in: ['ACTIVE', 'EXPIRED'] },
          },
        },
        {
          $lookup: {
            from: 'membershipplans',
            localField: 'planId',
            foreignField: '_id',
            as: 'plan',
          },
        },
        { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            pipeline: [{ $project: { _id: 1, role: 1 } }],
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        // Exclude free admin grants ($0 paid) from paid revenue metrics
        {
          $match: {
            $or: [{ isAdminGrant: { $ne: true } }, { amountPaid: { $gt: 0 } }],
          },
        },
        {
          $addFields: {
            resolvedRole: {
              $ifNull: ['$user.role', { $ifNull: ['$category', '$plan.targetRole'] }],
            },
          },
        },
        ...(selectedRole !== 'ALL' ? [{ $match: { resolvedRole: selectedRole } }] : []),
        {
          $addFields: {
            effectiveAmount: {
              $cond: [
                { $gt: ['$amountPaid', 0] },
                '$amountPaid',
                { $cond: [{ $gt: ['$plan.price', 0] }, '$plan.price', 0] },
              ],
            },
            biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } },
          },
        },
        {
          $group: {
            _id: '$biMonthBucket',
            subscriptionsCount: { $sum: 1 },
            subscriptionRevenue: { $sum: '$effectiveAmount' },
          },
        },
      ]),

      // =========================================================================
      // 3. MATCH RECORDS (GAME REPORTS) AGGREGATION ($lookup academyfinancetransactions)
      // =========================================================================
      MatchRecord.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$createdAt', '$matchDate'] },
          },
        },
        ...(dateRangeStart || dateRangeEnd ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        {
          $lookup: {
            from: 'academyfinancetransactions',
            localField: '_id',
            foreignField: 'reportId',
            as: 'financeTxn',
          },
        },
        { $unwind: { path: '$financeTxn', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } },
            isPaidReport: {
              $or: [
                { $eq: ['$coachReview.paymentStatus', 'PAID'] },
                { $gt: ['$financeTxn.cost', 0] },
              ],
            },
            paidAmount: {
              $cond: [
                { $gt: ['$financeTxn.cost', 0] },
                '$financeTxn.cost',
                {
                  $cond: [
                    { $eq: ['$coachReview.paymentStatus', 'PAID'] },
                    { $ifNull: ['$coachReview.paymentAmount', 0] },
                    0,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: '$biMonthBucket',
            totalReportsCount: { $sum: 1 },
            paidReportsCount: {
              $sum: { $cond: ['$isPaidReport', 1, 0] },
            },
            reportRevenue: { $sum: '$paidAmount' },
          },
        },
      ]),

      // =========================================================================
      // 4. PARENT MATCH REPORTS AGGREGATION ($lookup academyfinancetransactions)
      // =========================================================================
      ParentMatchReport.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$paidAt', { $ifNull: ['$createdAt', '$matchDate'] }] },
          },
        },
        ...(dateRangeStart || dateRangeEnd ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        {
          $lookup: {
            from: 'academyfinancetransactions',
            localField: '_id',
            foreignField: 'reportId',
            as: 'financeTxn',
          },
        },
        { $unwind: { path: '$financeTxn', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } },
            isPaid: { $eq: ['$paymentStatus', 'PAID'] },
            paidAmount: {
              $cond: [
                { $eq: ['$paymentStatus', 'PAID'] },
                { $ifNull: ['$financeTxn.cost', { $ifNull: ['$coachReviewPrice', 0] }] },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: '$biMonthBucket',
            totalReportsCount: { $sum: 1 },
            paidReportsCount: { $sum: { $cond: ['$isPaid', 1, 0] } },
            reportRevenue: { $sum: '$paidAmount' },
          },
        },
      ]),

      // =========================================================================
      // 5. STANDALONE ACADEMY FINANCE TRANSACTIONS (Where reportId is null)
      // =========================================================================
      AcademyFinanceTransaction.aggregate([
        {
          $match: {
            reportId: null,
            status: 'COMPLETED',
            ...buildDateMatch('transactionDate'),
          },
        },
        {
          $addFields: {
            biMonthBucket: { $ceil: { $divide: [{ $month: '$transactionDate' }, 2] } },
          },
        },
        {
          $group: {
            _id: '$biMonthBucket',
            reportsCount: { $sum: 1 },
            reportRevenue: { $sum: '$cost' },
          },
        },
      ]),

      // =========================================================================
      // 6. ACADEMY GAME REPORTS AGGREGATION
      // =========================================================================
      GameReport.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$createdAt', '$matchDate'] },
          },
        },
        ...(dateRangeStart || dateRangeEnd ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        {
          $addFields: {
            biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } },
            paidAmount: {
              $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, { $ifNull: ['$price', 0] }, 0],
            },
          },
        },
        {
          $group: {
            _id: '$biMonthBucket',
            reportsCount: { $sum: 1 },
            reportRevenue: { $sum: '$paidAmount' },
          },
        },
      ]),

      // =========================================================================
      // 7. SHOP ORDERS AGGREGATION
      // =========================================================================
      ShopOrder.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$paidAt', '$createdAt'] },
          },
        },
        ...(dateRangeStart || dateRangeEnd ? [{ $match: buildDateMatch('effectiveDate') }] : []),
        { $match: { paymentStatus: 'PAID' } },
        {
          $addFields: {
            biMonthBucket: { $ceil: { $divide: [{ $month: '$effectiveDate' }, 2] } },
          },
        },
        {
          $group: {
            _id: '$biMonthBucket',
            orderRevenue: { $sum: '$totalAmount' },
          },
        },
      ]),

      // =========================================================================
      // 8. DIRECT PLATFORM PAYMENTS AGGREGATION
      // =========================================================================
      PlatformPayment.aggregate([
        {
          $match: {
            overrideTargetId: { $exists: false },
            status: 'COMPLETED',
            ...buildDateMatch('paymentDate'),
          },
        },
        {
          $addFields: {
            biMonthBucket: { $ceil: { $divide: [{ $month: '$paymentDate' }, 2] } },
          },
        },
        {
          $group: {
            _id: { bucket: '$biMonthBucket', category: '$category' },
            count: { $sum: 1 },
            revenue: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    const facet = userFacetResult[0] || {
      totalCount: [],
      byRole: [],
      byBiMonthAndRole: [],
      years: [],
    };

    const totalUsers = facet.totalCount[0]?.count || 0;

    // -------------------------------------------------------------------------
    // A. Build USER ROLE DISTRIBUTION (Pie Chart - Screenshot 2)
    // -------------------------------------------------------------------------
    const roleCountsMap = new Map<string, number>();
    for (const r of ANALYTICS_ROLES) {
      roleCountsMap.set(r, 0);
    }
    for (const item of facet.byRole || []) {
      if (item._id && roleCountsMap.has(item._id)) {
        roleCountsMap.set(item._id, item.count);
      }
    }

    const userRoleDistribution = ANALYTICS_ROLES.map((roleKey) => {
      const count = roleCountsMap.get(roleKey) || 0;
      const percentage = totalUsers > 0 ? parseFloat(((count / totalUsers) * 100).toFixed(1)) : 0;
      const roundedPercentage = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;

      return {
        role: roleKey,
        label: roleKey === 'CLUB' ? 'Club' : ROLE_DISPLAY_MAP[roleKey],
        name: ROLE_DISPLAY_MAP[roleKey],
        count,
        value: count,
        percentage,
        roundedPercentage,
      };
    });

    // -------------------------------------------------------------------------
    // B. Build USER GROWTH BY ROLE (Line Chart - Screenshot 1: Jan-Feb .. Nov-Dec)
    // -------------------------------------------------------------------------
    const growthMatrix = new Map<number, Record<string, number>>();
    for (const b of BI_MONTHLY_BUCKETS) {
      growthMatrix.set(b.index, {
        PLAYER: 0,
        COACH: 0,
        ACADEMY: 0,
        AGENT: 0,
        CLUB: 0,
      });
    }

    for (const row of facet.byBiMonthAndRole || []) {
      const bucketIdx = Number(row._id?.bucket);
      const roleKey = String(row._id?.role || '');
      const bucketObj = growthMatrix.get(bucketIdx);
      if (bucketObj && roleKey in bucketObj) {
        bucketObj[roleKey] += row.count;
      }
    }

    let runningCumulativeUsers = 0;
    const userGrowthByRole = BI_MONTHLY_BUCKETS.map((b) => {
      const counts = growthMatrix.get(b.index)!;
      const periodTotal =
        selectedRole !== 'ALL'
          ? counts[selectedRole] || 0
          : counts.PLAYER + counts.COACH + counts.ACADEMY + counts.AGENT + counts.CLUB;
      runningCumulativeUsers += periodTotal;

      return {
        period: b.label,
        label: b.label,
        bucketIndex: b.index,
        total: periodTotal,
        cumulativeTotal: runningCumulativeUsers,
        // Keys matching chart legend in Screenshot 1
        Player: counts.PLAYER,
        Coach: counts.COACH,
        Academy: counts.ACADEMY,
        Agent: counts.AGENT,
        Clubs: counts.CLUB,
        Club: counts.CLUB,
        // Lowercase aliases for convenience
        player: counts.PLAYER,
        coach: counts.COACH,
        academy: counts.ACADEMY,
        agent: counts.AGENT,
        clubs: counts.CLUB,
      };
    });

    // -------------------------------------------------------------------------
    // C. Build REVENUE BREAKDOWN (Bar Chart - Screenshot 2: subscriptions & reports per bi-month)
    // -------------------------------------------------------------------------
    const revMatrix = new Map<
      number,
      {
        subscriptions: number;
        reports: number;
        subscriptionRevenue: number;
        reportRevenue: number;
        otherRevenue: number;
      }
    >();

    for (const b of BI_MONTHLY_BUCKETS) {
      revMatrix.set(b.index, {
        subscriptions: 0,
        reports: 0,
        subscriptionRevenue: 0,
        reportRevenue: 0,
        otherRevenue: 0,
      });
    }

    for (const s of subscriptionAggResult) {
      const bucket = revMatrix.get(Number(s._id));
      if (bucket) {
        bucket.subscriptions += s.subscriptionsCount || 0;
        bucket.subscriptionRevenue += Number(s.subscriptionRevenue) || 0;
      }
    }

    let totalGameReportsCount = 0;

    for (const mr of matchRecordAggResult) {
      totalGameReportsCount += mr.totalReportsCount || 0;
      const bucket = revMatrix.get(Number(mr._id));
      if (bucket) {
        bucket.reports += mr.totalReportsCount || 0;
        bucket.reportRevenue += Number(mr.reportRevenue) || 0;
      }
    }

    for (const pr of parentReportAggResult) {
      totalGameReportsCount += pr.totalReportsCount || 0;
      const bucket = revMatrix.get(Number(pr._id));
      if (bucket) {
        bucket.reports += pr.totalReportsCount || 0;
        bucket.reportRevenue += Number(pr.reportRevenue) || 0;
      }
    }

    for (const ft of financeTxnAggResult) {
      totalGameReportsCount += ft.reportsCount || 0;
      const bucket = revMatrix.get(Number(ft._id));
      if (bucket) {
        bucket.reports += ft.reportsCount || 0;
        bucket.reportRevenue += Number(ft.reportRevenue) || 0;
      }
    }

    for (const gr of gameReportAggResult) {
      totalGameReportsCount += gr.reportsCount || 0;
      const bucket = revMatrix.get(Number(gr._id));
      if (bucket) {
        bucket.reports += gr.reportsCount || 0;
        bucket.reportRevenue += Number(gr.reportRevenue) || 0;
      }
    }

    for (const so of shopOrderAggResult) {
      const bucket = revMatrix.get(Number(so._id));
      if (bucket) {
        bucket.otherRevenue += Number(so.orderRevenue) || 0;
      }
    }

    for (const pp of platformPaymentAggResult) {
      const bucketIdx = Number(pp._id?.bucket);
      const cat = String(pp._id?.category || '');
      const bucket = revMatrix.get(bucketIdx);
      if (bucket) {
        if (cat === 'SUBSCRIPTION') {
          bucket.subscriptions += pp.count || 0;
          bucket.subscriptionRevenue += Number(pp.revenue) || 0;
        } else if (cat === 'GAME_REPORT') {
          totalGameReportsCount += pp.count || 0;
          bucket.reports += pp.count || 0;
          bucket.reportRevenue += Number(pp.revenue) || 0;
        } else {
          bucket.otherRevenue += Number(pp.revenue) || 0;
        }
      }
    }

    let totalSubscriptionRevenue = 0;
    let totalGameReportRevenue = 0;
    let totalOtherRevenue = 0;

    const revenueBreakdown = BI_MONTHLY_BUCKETS.map((b) => {
      const item = revMatrix.get(b.index)!;
      const subRev = parseFloat(item.subscriptionRevenue.toFixed(2));
      const repRev = parseFloat(item.reportRevenue.toFixed(2));
      const othRev = parseFloat(item.otherRevenue.toFixed(2));
      const periodTotalRev = parseFloat((subRev + repRev + othRev).toFixed(2));

      totalSubscriptionRevenue += subRev;
      totalGameReportRevenue += repRev;
      totalOtherRevenue += othRev;

      return {
        period: b.label,
        label: b.label,
        bucketIndex: b.index,
        // Exact keys shown in Screenshot 2 tooltip ("subscriptions : 3", "reports : 4")
        subscriptions: item.subscriptions,
        reports: item.reports,
        // Revenue dollar amounts per bar
        subscriptionRevenue: subRev,
        reportRevenue: repRev,
        otherRevenue: othRev,
        totalRevenue: periodTotalRev,
      };
    });

    totalSubscriptionRevenue = parseFloat(totalSubscriptionRevenue.toFixed(2));
    totalGameReportRevenue = parseFloat(totalGameReportRevenue.toFixed(2));
    totalOtherRevenue = parseFloat(totalOtherRevenue.toFixed(2));
    const grandTotalRevenue = parseFloat(
      (totalSubscriptionRevenue + totalGameReportRevenue + totalOtherRevenue).toFixed(2),
    );

    return {
      // Top 3 Summary Cards (Screenshot 1: TOTAL USERS, REVENUE, GAME REPORTS)
      summary: {
        totalUsers,
        allTimeTotalUsers: allTimeUsersCount,
        revenue: grandTotalRevenue,
        subscriptionRevenue: totalSubscriptionRevenue,
        gameReportRevenue: totalGameReportRevenue,
        gameReports: totalGameReportsCount,
        currency: '$',
      },
      // Chart 1: USER GROWTH BY ROLE (Screenshot 1)
      userGrowthByRole,
      // Chart 2: USER ROLE DISTRIBUTION (Screenshot 2 - Left Pie Chart)
      userRoleDistribution,
      // Chart 3: REVENUE BREAKDOWN (Screenshot 2 - Right Dual Bar Chart)
      revenueBreakdown,
    };
  }
}

export const adminAnalyticsService = new AdminAnalyticsService();
