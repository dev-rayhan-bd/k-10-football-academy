import { AppError } from '@/utils/AppError';
import { calculateMatchPerformance } from '@/utils/ratingCalculator';
import { MatchRecord } from '@/modules/player/player.model';
import { User } from '@/modules/user/user.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { emailQueue } from '@/jobs/queues/email.queue';
import { getPlayerReportCompletedEmailTemplate } from '@/utils/emailTemplates';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { notificationService } from '@/modules/notification/notification.service';
import { ParentChild } from '@/modules/parent/parent.model';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import QueryBuilder from '@/builder/QueryBuilder';
import { mapStatsAndEventsToMatchEvents, parseTimerInput } from './game-report.utils';
import { gameReportPdfService } from './game-report-pdf.service';

export class GameReportCoachService {
  /**
   * Flow 2 - Step B: Coach Completes Match Report (Screen 3, 4, 5 with 24 counters and markers)
   */
  async completeCoachGameReport(reportId: string, coachUser: any, payload: any) {
    const matchRecord = await MatchRecord.findById(reportId).populate('playerId');
    if (!matchRecord) {
      throw new AppError(404, 'Match record not found.');
    }

    if (matchRecord.coachReview?.status === 'COMPLETED') {
      throw new AppError(
        400,
        'This Game Report has already been evaluated and completed. Repeated submissions are not allowed.',
      );
    }

    if (matchRecord.coachReview?.paymentStatus !== 'PAID') {
      throw new AppError(
        402,
        'Payment of $3.99 platform fee is required before submitting the coach evaluation.',
      );
    }

    const playerProfile = (matchRecord.playerId as any) || {};
    const position = playerProfile.position || 'CM';

    const { stats = {}, accurateShots = [], accurateAssists = [], coachFeedback = '' } = payload;

    const hasRawTimer =
      (payload.timer !== undefined && payload.timer !== null && payload.timer !== '') ||
      (payload.matchTime !== undefined && payload.matchTime !== null && payload.matchTime !== '') ||
      (payload.matchDuration !== undefined &&
        payload.matchDuration !== null &&
        payload.matchDuration !== '') ||
      (payload.minutesPlayed !== undefined &&
        payload.minutesPlayed !== null &&
        payload.minutesPlayed !== '');

    let finalMinutes = matchRecord.minutesPlayed || 90;
    let finalMatchDuration = matchRecord.matchDuration || '90:00';
    if (hasRawTimer) {
      const timerResult = parseTimerInput(payload);
      finalMinutes = timerResult.minutesPlayed || 90;
      finalMatchDuration = timerResult.matchDuration || '90:00';
    }

    // Auto-map UI stats counters to MATCH_EVENTS for client's excel formula
    const events = mapStatsAndEventsToMatchEvents(stats, payload.events);

    // Apply Client's 100% Excel formula
    const perfResult = calculateMatchPerformance(position, finalMinutes, events);
    const finalRating = Math.round((perfResult.overallRating / 10) * 10) / 10;

    matchRecord.minutesPlayed = finalMinutes;
    matchRecord.matchDuration = finalMatchDuration;
    matchRecord.stats = stats;
    matchRecord.accurateShots = accurateShots;
    matchRecord.accurateAssists = accurateAssists;
    matchRecord.events = events;
    matchRecord.playerRating = finalRating;
    matchRecord.positivePoints = perfResult.positivePoints;
    matchRecord.negativePoints = perfResult.negativePoints;
    matchRecord.netContribution = perfResult.netContribution;
    matchRecord.interpretation = perfResult.interpretation;
    matchRecord.categoryScores = perfResult.categoryAdjustedScores as any;
    matchRecord.categoryRatings = perfResult.categoryRatings as any;

    if (stats.goalScored !== undefined) matchRecord.goals = stats.goalScored;
    if (stats.assists !== undefined) matchRecord.assists = stats.assists;
    if (stats.passAccurate !== undefined) {
      const acc = Number(stats.passAccurate) || 0;
      const wrong = Number(stats.wrongPass) || 0;
      matchRecord.passes = acc + wrong;
      matchRecord.passAccuracy =
        matchRecord.passes > 0 ? Math.round((acc / matchRecord.passes) * 100) : 0;
    }
    if (stats.yellowCard !== undefined) matchRecord.yellowCards = stats.yellowCard;
    if (stats.redCard !== undefined) matchRecord.redCards = stats.redCard;
    if (stats.standTackle !== undefined || stats.slidingTackle !== undefined) {
      matchRecord.tackles = (Number(stats.standTackle) || 0) + (Number(stats.slidingTackle) || 0);
    }

    if (matchRecord.coachReview) {
      matchRecord.coachReview.status = 'COMPLETED';
      matchRecord.coachReview.evaluatedAt = new Date();
      matchRecord.coachReview.coachRating = finalRating;
      matchRecord.coachReview.coachFeedback = coachFeedback;
      matchRecord.coachReview.coachId = coachUser._id;
    }

    matchRecord.isProfessionallyVerified = true;
    matchRecord.authorName = coachUser.name || 'Coach';
    matchRecord.authorRole = 'COACH';

    // Generate Official PDF Report (Client Requirement 4)
    const pdfUrl = await gameReportPdfService.generateAndSaveReportPdf(matchRecord);
    if (pdfUrl) {
      matchRecord.reportPdfUrl = pdfUrl;
    }

    await matchRecord.save();
    await playerStatsService.recalculatePlayerStats(playerProfile._id);

    // Invalidate player cache so CV immediately reflects updated rating & feedback
    if (playerProfile._id) {
      await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);
    }

    // In-app Notification to Player
    if (playerProfile.userId) {
      await notificationService.createNotification({
        recipientId: playerProfile.userId,
        recipientRole: 'ATHLETE',
        title: 'Coach Evaluation Completed',
        message: `Coach ${coachUser.name || 'Your Coach'} evaluated your match performance. Rating: ${finalRating}/100.`,
        type: 'EVALUATION_COMPLETED',
        data: { reportId: matchRecord._id, rating: finalRating },
      });
    }

    // In-app Notification to Parent(s) if linked
    if (playerProfile._id) {
      try {
        const parentLinks = await ParentChild.find({
          childPlayerId: playerProfile._id,
        }).populate('parentId');
        for (const link of parentLinks) {
          const parent = link.parentId as any;
          if (parent && parent.userId) {
            await notificationService.createNotification({
              recipientId: parent.userId,
              recipientRole: 'PARENT',
              title: 'Child Match Evaluation Completed',
              message: `Coach ${coachUser.name || 'Coach'} completed the match evaluation for ${playerProfile.fullName || 'your child'}. Rating: ${finalRating}/100.`,
              type: 'CHILD_EVALUATION_COMPLETED',
              data: {
                reportId: matchRecord._id,
                childPlayerId: playerProfile._id,
                rating: finalRating,
              },
            });
          }
        }
      } catch (err: any) {
        logger.error({ err }, 'Error sending parent completion notification');
      }
    }

    void notificationService.notifyAdmins({
      settingKey: 'reportAlerts',
      title: 'Match Report Evaluated',
      message: `Coach ${coachUser.name || 'Coach'} completed the match evaluation for ${playerProfile.fullName || 'player'}. Rating: ${finalRating}/100.`,
      type: 'EVALUATION_COMPLETED',
      data: {
        reportId: matchRecord._id,
        playerId: playerProfile._id,
        rating: finalRating,
      },
    });

    // Send Completion Notification Email to Player
    const playerUser = await User.findById(playerProfile.userId);
    if (playerUser && playerUser.email) {
      const cvUrl = `${(env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}/player/cv`;
      const emailHtml = getPlayerReportCompletedEmailTemplate(
        playerProfile.fullName || playerUser.name,
        coachUser.name || 'Your Coach',
        finalRating,
        perfResult.interpretation,
        cvUrl,
      );

      await emailQueue.add('send-player-report-completed', {
        to: playerUser.email,
        subject: `Your Match Report Has Been Evaluated by Coach ${coachUser.name || ''}`,
        body: emailHtml,
      });

      logger.info(`Evaluation completed email queued to player: ${playerUser.email}`);
    }

    return matchRecord;
  }

  /**
   * Get Reports Assigned to Coach for Evaluation
   */
  async getCoachPendingReports(coachEmail: string, query: Record<string, unknown> = {}) {
    const baseFilter = {
      'coachReview.coachEmail': coachEmail.toLowerCase().trim(),
      'coachReview.paymentStatus': 'PAID',
      'coachReview.status': 'PENDING',
    };

    const reportQuery = new QueryBuilder(MatchRecord.find(baseFilter).populate('playerId'), query)
      .search(['awayTeam', 'homeTeam', 'gameType', 'leagueType'])
      .filter()
      .sort()
      .paginate();

    const result = await reportQuery.modelQuery;
    const meta = await reportQuery.countTotal();

    return {
      meta,
      result,
    };
  }

  /**
   * Get Coach Game Reports Dashboard (Screen: Game Reports)
   * 4 Cards (TOTAL REPORTS, COMPLETED, PENDING, THIS MONTH) + Table (Completed & Pending)
   */
  async getCoachAllGameReports(
    coachUser: { userId: string; email: string },
    query: Record<string, unknown> = {},
  ) {
    const coachEmail = (coachUser.email || '').toLowerCase().trim();
    const coachUserId = coachUser.userId;

    const baseFilter: any = {
      $or: [{ 'coachReview.coachEmail': coachEmail }, { 'coachReview.coachId': coachUserId }],
      'coachReview.status': { $in: ['PENDING', 'COMPLETED'] },
    };

    // Calculate Summary Stats Cards across all reports assigned to coach
    const allReports = await MatchRecord.find(baseFilter).sort({ createdAt: -1 });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let completedCount = 0;
    let pendingCount = 0;
    let thisMonthCount = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    allReports.forEach((m) => {
      const status = m.coachReview?.status;
      if (status === 'COMPLETED') completedCount++;
      if (status === 'PENDING') pendingCount++;

      const pStatus = m.coachReview?.paymentStatus;
      if (pStatus === 'PAID') {
        paidCount++;
      } else {
        unpaidCount++;
      }

      const reportDate = new Date(m.createdAt || m.matchDate || 0);
      if (reportDate >= startOfMonth) {
        thisMonthCount++;
      }
    });

    const summary = {
      totalReports: allReports.length,
      completed: completedCount,
      pending: pendingCount,
      thisMonth: thisMonthCount,
      paidReports: paidCount,
      unpaidReports: unpaidCount,
    };

    // Filter by query status if provided (?status=COMPLETED or ?status=PENDING)
    const filterStatus = String(query.status || 'ALL')
      .toUpperCase()
      .trim();
    const listFilter: any = { ...baseFilter };
    if (filterStatus === 'COMPLETED') {
      listFilter['coachReview.status'] = 'COMPLETED';
    } else if (filterStatus === 'PENDING') {
      listFilter['coachReview.status'] = 'PENDING';
    }

    // Filter by payment status if provided (?paymentStatus=PAID or ?paymentStatus=UNPAID)
    if (query.paymentStatus && typeof query.paymentStatus === 'string') {
      listFilter['coachReview.paymentStatus'] = query.paymentStatus.toUpperCase().trim();
    }

    // Clean query object so QueryBuilder doesn't attempt to filter on non-existent top-level fields
    const queryForBuilder = { ...query };
    delete queryForBuilder.status;
    delete queryForBuilder.paymentStatus;

    const reportQuery = new QueryBuilder(
      MatchRecord.find(listFilter).populate(
        'playerId',
        'fullName position profileImage currentClub',
      ),
      queryForBuilder,
    )
      .search(['awayTeam', 'homeTeam', 'opponentTeam', 'ownTeam', 'gameType', 'matchResult'])
      .filter()
      .sort()
      .paginate();

    const reports = await reportQuery.modelQuery.lean();
    const meta = await reportQuery.countTotal();

    const formattedReports = reports.map((r: any) => {
      const player = r.playerId || {};
      const status = r.coachReview?.status || 'PENDING';
      const rating =
        status === 'PENDING' ? 'PENDING' : (r.playerRating ?? r.coachReview?.coachRating ?? null);

      const home = r.homeTeam || r.ownTeam || 'Team';
      const away = r.awayTeam || r.opponentTeam || 'Opponent';
      const matchLabel = r.matchResult || `${home} vs ${away}`;

      const goals = r.goals ?? r.stats?.goalScored ?? (status === 'PENDING' ? null : 0);
      const assists = r.assists ?? r.stats?.assists ?? (status === 'PENDING' ? null : 0);
      const date = r.matchDate
        ? new Date(r.matchDate).toISOString().split('T')[0]
        : r.gameDate || '';

      const amount = r.coachReview?.paymentAmount
        ? `$ ${Number(r.coachReview.paymentAmount).toFixed(2)}`
        : '$ 3.99';

      const paymentStatus = (r.coachReview?.paymentStatus || 'UNPAID') as
        'PAID' | 'UNPAID' | 'FREE';
      const isPaid = paymentStatus === 'PAID';

      return {
        _id: r._id,
        player: {
          _id: player._id || null,
          name: player.fullName || r.playerInfo?.playerName || 'Player',
          position: player.position || r.playerInfo?.position || 'PLAYER',
          avatar: player.profileImage || '',
        },
        rating,
        matches: matchLabel,
        goals,
        assists,
        date,
        amount,
        paymentStatus,
        isPaid,
        transactionId: r.coachReview?.transactionId || null,
        status,
        createdAt: r.createdAt,
      };
    });

    return {
      summary,
      meta,
      reports: formattedReports,
    };
  }

  async updateGameReportStatus(
    reportId: string,
    _user: any,
    payload: {
      status: string;
      rejectionReason?: string;
      matchDate?: Date;
      matchTime?: string;
      matchLocation?: string;
    },
  ) {
    const matchRecord = await MatchRecord.findById(reportId).populate('playerId');
    if (!matchRecord) {
      throw new AppError(404, 'Match record not found.');
    }

    if (matchRecord.coachReview?.status === 'COMPLETED') {
      throw new AppError(
        400,
        'This Game Report has already been evaluated and completed. Repeated submissions are not allowed.',
      );
    }

    if (matchRecord.coachReview?.paymentStatus !== 'PAID') {
      throw new AppError(
        402,
        'Payment of $3.99 platform fee is required before submitting the coach evaluation.',
      );
    }

    const validStatuses = [
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'AWAITING_SCHEDULING',
      'SCHEDULED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ];
    const newStatus = String(payload.status).toUpperCase();
    if (!validStatuses.includes(newStatus)) {
      throw new AppError(400, `Invalid status. Allowed statuses: ${validStatuses.join(', ')}`);
    }

    if (!matchRecord.coachReview) {
      matchRecord.coachReview = {
        paymentStatus: 'FREE',
        paymentAmount: 0,
        status: newStatus as any,
      };
    } else {
      matchRecord.coachReview.status = newStatus as any;
    }

    if (payload.rejectionReason) {
      (matchRecord.coachReview as any).rejectionReason = payload.rejectionReason;
    }
    if (payload.matchDate) {
      matchRecord.matchDate = new Date(payload.matchDate);
    }
    if (payload.matchLocation) {
      matchRecord.location = payload.matchLocation;
    }

    await matchRecord.save();

    const playerProfile = (matchRecord.playerId as any) || {};

    if (playerProfile._id) {
      await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);
    }

    if (playerProfile.userId) {
      await notificationService.createNotification({
        recipientId: playerProfile.userId,
        recipientRole: 'ATHLETE',
        title: `Game Report Status: ${newStatus}`,
        message: `Your Game Report request has been updated to: ${newStatus}${payload.rejectionReason ? `. Reason: ${payload.rejectionReason}` : ''}`,
        type: 'REPORT_STATUS_UPDATED',
        data: { reportId: matchRecord._id, status: newStatus },
      });
    }

    if (newStatus === 'REJECTED' && playerProfile._id) {
      try {
        const parentLinks = await ParentChild.find({
          childPlayerId: playerProfile._id,
        }).populate('parentId');

        for (const link of parentLinks) {
          const parent = link.parentId as any;
          if (parent && parent.userId) {
            await notificationService.createNotification({
              recipientId: parent.userId,
              recipientRole: 'PARENT',
              title: 'Game Report Request Declined - Free Reassignment Available',
              message: `The coach declined the Game Report request${payload.rejectionReason ? ` (${payload.rejectionReason})` : ''}. You can re-assign this Game Report to another coach without paying any additional fee.`,
              type: 'CHILD_GAME_REPORT_REQUEST',
              data: { reportId: matchRecord._id, status: 'REJECTED' },
            });
          }
        }
      } catch (err: any) {
        logger.error({ err }, 'Error sending parent rejection notification');
      }
    }

    return {
      message: `Game report status updated to ${newStatus} successfully`,
      reportId: matchRecord._id,
      status: newStatus,
      coachReview: matchRecord.coachReview,
    };
  }
}

export const gameReportCoachService = new GameReportCoachService();
