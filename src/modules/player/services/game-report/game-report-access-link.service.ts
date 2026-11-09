import crypto from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { MatchRecord } from '@/modules/player/player.model';
import { User } from '@/modules/user/user.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { calculateMatchPerformance, MATCH_EVENTS } from '@/utils/ratingCalculator';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { notificationService } from '@/modules/notification/notification.service';
import { emailQueue } from '@/jobs/queues/email.queue';
import { getCoachReportRequestEmailTemplate } from '@/utils/emailTemplates';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { mapStatsAndEventsToMatchEvents, parseTimerInput } from './game-report.utils';
import { gameReportPdfService } from './game-report-pdf.service';
import { ParentChild, ParentProfile } from '@/modules/parent/parent.model';

export class GameReportAccessLinkService {
  /**
   * Generates a 32-byte cryptographic token and builds the secure standalone access link
   */
  generateSecureToken(): { token: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days validity
    return { token, expiresAt };
  }

  /**
   * Format full public frontend URL with token and player position
   */
  formatAccessUrl(token: string, position?: string): string {
    const baseUrl = (env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const posParam = position ? `&position=${encodeURIComponent(position)}` : '';
    return `${baseUrl}/game-report/evaluate?token=${token}${posParam}`;
  }

  /**
   * Option B: Public View by Token (Zero account required for external coach/scout)
   * Only returns scoped match data and basic athlete info (strictly protects private player account)
   */
  async getReportByToken(token: string) {
    if (!token || typeof token !== 'string') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid access link token is required');
    }

    const report = await MatchRecord.findOne({ accessLinkToken: token.trim() }).populate(
      'playerId',
      'fullName position currentClub profileImage age dateOfBirth',
    );

    if (!report) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Invalid or non-existent Game Report access link');
    }

    const now = new Date();
    const isExpired = report.tokenExpiresAt ? now > new Date(report.tokenExpiresAt) : false;
    const isCompleted = report.coachReview?.status === 'COMPLETED';

    const player: any = report.playerId || {};

    return {
      success: true,
      reportId: report._id,
      matchDetails: {
        homeTeam: report.homeTeam || report.playerInfo?.clubName || 'Home Team',
        awayTeam: report.awayTeam || (report as any).opponentTeam || 'Away Team',
        matchDate: report.matchDate || report.gameDate,
        leagueType: report.leagueType || report.gameType || 'Match Evaluation',
        location: report.location || report.gameLocation || 'Pitch',
        weather: report.weather || 'Clear',
        temperature: report.temperature ?? 20,
        result: report.result,
        homeScore: report.homeScore ?? 0,
        awayScore: report.awayScore ?? 0,
      },
      athlete: {
        id: player._id,
        name: player.fullName || report.playerInfo?.playerName || 'Athlete',
        position: player.position || report.playerInfo?.position || 'CM',
        club: player.currentClub || report.playerInfo?.clubName || 'Club Team',
        profileImage: player.profileImage || '',
      },
      assignedEvaluator: {
        name: report.coachReview?.coachName || report.evaluatorInfo?.name || 'Evaluator',
        email: report.coachReview?.coachEmail || report.evaluatorInfo?.email || '',
        role: report.evaluatorInfo?.role || 'Coach / Scout',
      },
      status: report.coachReview?.status || 'PENDING',
      isExpired,
      isCompleted,
      canSubmit: !isExpired && !isCompleted && report.coachReview?.status !== 'REJECTED',
      reportPdfUrl: report.reportPdfUrl || null,
      evaluationCriteriaList: Object.values(MATCH_EVENTS),
    };
  }

  /**
   * Option B: External Evaluator Responds (Accept or Reject)
   */
  async respondToAccessLink(
    token: string,
    payload: {
      action: 'ACCEPT' | 'REJECT';
      rejectionReason?: string;
      evaluatorName?: string;
      evaluatorRole?: string;
    },
  ) {
    if (!token) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Token is required');
    }

    const report = await MatchRecord.findOne({ accessLinkToken: token.trim() }).populate(
      'playerId',
      'fullName userId',
    );

    if (!report) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Invalid Game Report access link');
    }

    if (report.coachReview?.status === 'COMPLETED') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'This Game Report has already been completed');
    }

    const action = String(payload.action).toUpperCase().trim();
    if (action !== 'ACCEPT' && action !== 'REJECT') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Action must be ACCEPT or REJECT');
    }

    const player: any = report.playerId || {};

    if (action === 'ACCEPT') {
      if (report.coachReview) {
        report.coachReview.status = 'ACCEPTED';
      }
      if (payload.evaluatorName || payload.evaluatorRole) {
        report.evaluatorInfo = {
          name: payload.evaluatorName || report.coachReview?.coachName,
          role: payload.evaluatorRole || 'Coach / Scout',
          email: report.coachReview?.coachEmail,
        };
      }
      await report.save();

      // Notify Player
      if (player.userId) {
        await notificationService.createNotification({
          recipientId: player.userId,
          recipientRole: 'ATHLETE',
          title: 'Game Report Request Accepted',
          message: `${report.coachReview?.coachName || 'The evaluator'} has accepted your Game Report evaluation request.`,
          type: 'REPORT_STATUS_UPDATED',
          data: { reportId: report._id, status: 'ACCEPTED' },
        });
      }

      // Notify Parents
      await this.notifyParents(
        player._id,
        'Game Report Request Accepted',
        `${report.coachReview?.coachName || 'The evaluator'} has accepted the Game Report request for ${player.fullName || 'your child'}.`,
        report._id,
      );

      return {
        success: true,
        message: 'Game report request accepted successfully. You can now complete the evaluation.',
        status: 'ACCEPTED',
        reportId: report._id,
      };
    } else {
      // REJECT action
      const reason = payload.rejectionReason || 'Coach is unavailable for this match';
      if (report.coachReview) {
        report.coachReview.status = 'REJECTED';
        report.coachReview.rejectionReason = reason;
      }
      report.rejectionReason = reason;
      await report.save();

      // Notify Player
      if (player.userId) {
        await notificationService.createNotification({
          recipientId: player.userId,
          recipientRole: 'ATHLETE',
          title: 'Game Report Request Declined',
          message: `The evaluator could not accept your Game Report request. Reason: ${reason}.`,
          type: 'REPORT_STATUS_UPDATED',
          data: { reportId: report._id, status: 'REJECTED' },
        });
      }

      // Notify Parents with Re-assignment Guidance
      await this.notifyParents(
        player._id,
        'Game Report Request Declined - Free Reassignment Available',
        `The evaluator was unavailable (${reason}). You can re-assign this Game Report to another coach without paying any extra fee.`,
        report._id,
      );

      return {
        success: true,
        message: 'Game report request declined. Parent has been notified with free re-assignment.',
        status: 'REJECTED',
        reportId: report._id,
      };
    }
  }

  /**
   * Option B: External Evaluator Submits 36 Performance Indicators (Generates PDF + CV Integration)
   */
  async submitReportByToken(token: string, payload: any) {
    if (!token) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Token is required');
    }

    const report = await MatchRecord.findOne({ accessLinkToken: token.trim() }).populate(
      'playerId',
      'fullName position userId currentClub',
    );

    if (!report) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Invalid Game Report access link');
    }

    if (report.coachReview?.status === 'COMPLETED') {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'This Game Report has already been evaluated and submitted',
      );
    }

    if (report.coachReview?.paymentStatus !== 'PAID') {
      throw new AppError(
        StatusCodes.PAYMENT_REQUIRED,
        'Payment of $3.99 platform fee is required before submitting the evaluation.',
      );
    }

    const now = new Date();
    if (report.tokenExpiresAt && now > new Date(report.tokenExpiresAt)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'This access link has expired');
    }

    const playerProfile: any = report.playerId || {};
    const position = playerProfile.position || report.playerInfo?.position || 'CM';

    const {
      stats = {},
      accurateShots = [],
      accurateAssists = [],
      coachFeedback = '',
      evaluatorName,
      evaluatorRole,
    } = payload;

    const hasRawTimer =
      (payload.timer !== undefined && payload.timer !== null && payload.timer !== '') ||
      (payload.matchTime !== undefined && payload.matchTime !== null && payload.matchTime !== '') ||
      (payload.matchDuration !== undefined &&
        payload.matchDuration !== null &&
        payload.matchDuration !== '') ||
      (payload.minutesPlayed !== undefined &&
        payload.minutesPlayed !== null &&
        payload.minutesPlayed !== '');

    let finalMinutes = report.minutesPlayed || 90;
    let finalMatchDuration = report.matchDuration || '90:00';
    if (hasRawTimer) {
      const timerResult = parseTimerInput(payload);
      finalMinutes = timerResult.minutesPlayed || 90;
      finalMatchDuration = timerResult.matchDuration || '90:00';
    }

    // Auto-map UI stats counters and 36 events for client's excel formula
    const events = mapStatsAndEventsToMatchEvents(stats, payload.events);

    // Calculate Rating via Client's 100% Excel Formula
    const perfResult = calculateMatchPerformance(position, finalMinutes, events);
    const finalRating = Math.round((perfResult.overallRating / 10) * 10) / 10;

    const resolvedEvaluatorName =
      evaluatorName || report.coachReview?.coachName || report.evaluatorInfo?.name || 'Coach';
    const resolvedEvaluatorRole =
      evaluatorRole || report.evaluatorInfo?.role || 'Authorised Coach / Scout';

    report.minutesPlayed = finalMinutes;
    report.matchDuration = finalMatchDuration;
    report.stats = stats;
    report.accurateShots = accurateShots;
    report.accurateAssists = accurateAssists;
    report.events = events;
    report.playerRating = finalRating;
    report.positivePoints = perfResult.positivePoints;
    report.negativePoints = perfResult.negativePoints;
    report.netContribution = perfResult.netContribution;
    report.interpretation = perfResult.interpretation;
    report.categoryScores = perfResult.categoryAdjustedScores as any;
    report.categoryRatings = perfResult.categoryRatings as any;
    report.authorName = resolvedEvaluatorName;
    report.authorRole = 'COACH';
    report.isProfessionallyVerified = true;
    report.tokenUsedAt = new Date();

    if (report.coachReview) {
      report.coachReview.status = 'COMPLETED';
      report.coachReview.evaluatedAt = new Date();
      report.coachReview.coachRating = finalRating;
      report.coachReview.coachFeedback = coachFeedback;
      report.coachReview.coachName = resolvedEvaluatorName;
    }

    report.evaluatorInfo = {
      name: resolvedEvaluatorName,
      role: resolvedEvaluatorRole,
      email: report.coachReview?.coachEmail || report.evaluatorInfo?.email,
    };

    // Generate Official PDF Report (Client Requirement 4)
    const pdfUrl = await gameReportPdfService.generateAndSaveReportPdf(report);
    if (pdfUrl) {
      report.reportPdfUrl = pdfUrl;
    }

    await report.save();

    // Recalculate stats & invalidate cache
    if (playerProfile._id) {
      await playerStatsService.recalculatePlayerStats(playerProfile._id);
      await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);
    }

    // In-app Notification to Player
    if (playerProfile.userId) {
      await notificationService.createNotification({
        recipientId: playerProfile.userId,
        recipientRole: 'ATHLETE',
        title: 'Game Report Evaluation Completed',
        message: `${resolvedEvaluatorName} completed your match evaluation. Overall Rating: ${finalRating}/10.`,
        type: 'EVALUATION_COMPLETED',
        data: { reportId: report._id, rating: finalRating, pdfUrl: report.reportPdfUrl },
      });
    }

    // In-app Notification to Parent(s)
    await this.notifyParents(
      playerProfile._id,
      'Child Game Report Completed',
      `${resolvedEvaluatorName} completed the match evaluation for ${playerProfile.fullName || 'your child'}. Rating: ${finalRating}/10.`,
      report._id,
    );

    const apiBase = env.PUBLIC_API_URL
      ? env.PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
      : `http://localhost:${env.PORT || 5000}`;
    const pdfViewUrl = `${apiBase}/api/v1/players/game-reports/${report._id}/pdf`;
    const pdfDownloadUrl = `${apiBase}/api/v1/players/game-reports/${report._id}/pdf?download=true`;

    return {
      success: true,
      message: 'Game report evaluation submitted successfully and integrated into Player CV',
      reportId: report._id,
      overallRating: finalRating,
      reportPdfUrl: report.reportPdfUrl || pdfViewUrl,
      pdfViewUrl,
      pdfDownloadUrl,
      isProfessionallyVerified: true,
      author: `${resolvedEvaluatorName} (${resolvedEvaluatorRole})`,
    };
  }

  /**
   * Re-assign Rejected Game Report to another Coach / Person WITHOUT extra payment ($0 charge)
   */
  async reassignGameReport(
    userId: string,
    reportId: string,
    payload: {
      coachId?: string;
      coachEmail?: string;
      coachName?: string;
      scoutName?: string;
    },
  ) {
    if (!reportId || !Types.ObjectId.isValid(reportId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid report ID is required');
    }

    const report = await MatchRecord.findById(reportId).populate('playerId');
    if (!report) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Game Report not found');
    }

    // Verification check: Only paid reports can be re-assigned
    if (report.coachReview?.paymentStatus !== 'PAID') {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Only reports with verified platform fee can be re-assigned',
      );
    }

    // Only allow re-assignment if status was REJECTED, CANCELLED, or token has EXPIRED
    const isTokenExpired = report.tokenExpiresAt && new Date() > new Date(report.tokenExpiresAt);
    if (
      report.coachReview?.status !== 'REJECTED' &&
      report.coachReview?.status !== 'CANCELLED' &&
      !isTokenExpired
    ) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Cannot re-assign a report with status '${report.coachReview?.status}'. Re-assignment is allowed for rejected, cancelled, or expired requests.`,
      );
    }

    // Security: Check that requesting user is Parent or linked Player
    const player: any = report.playerId || {};
    const parentProfile = await ParentProfile.findOne({
      $or: [
        { userId },
        { _id: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null },
      ],
    });

    if (parentProfile) {
      const link = await ParentChild.findOne({
        parentId: parentProfile._id,
        childPlayerId: player._id,
      });
      if (!link && String(player.userId) !== String(userId)) {
        throw new AppError(StatusCodes.FORBIDDEN, 'Access denied. You do not own this report.');
      }
    } else if (String(player.userId) !== String(userId)) {
      throw new AppError(StatusCodes.FORBIDDEN, 'Access denied. You do not own this report.');
    }

    // Resolve target new coach or external person
    let targetEmail = payload.coachEmail?.toLowerCase().trim();
    let targetName = payload.coachName || payload.scoutName;
    let coachObjectId: any = undefined;

    if (payload.coachId && Types.ObjectId.isValid(payload.coachId)) {
      const coachUser = await User.findById(payload.coachId);
      if (coachUser) {
        coachObjectId = coachUser._id;
        targetEmail = coachUser.email;
        if (!targetName) targetName = coachUser.name;
      } else {
        const coachProf = await CoachProfile.findById(payload.coachId);
        if (coachProf) {
          coachObjectId = coachProf.userId;
          if (!targetName) targetName = coachProf.fullName;
          const u = await User.findById(coachProf.userId);
          if (u) targetEmail = u.email;
        }
      }
    }

    if (!targetEmail) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Please provide a valid coach ID or email for re-assignment',
      );
    }

    // Archive previous rejection
    if (!report.reassignmentHistory) {
      report.reassignmentHistory = [];
    }
    report.reassignmentHistory.push({
      previousCoachEmail: report.coachReview?.coachEmail,
      previousCoachName: report.coachReview?.coachName,
      rejectionReason: report.rejectionReason || report.coachReview?.rejectionReason,
      rejectedAt: new Date(),
    });

    // Generate new secure access token
    const { token, expiresAt } = this.generateSecureToken();
    const accessUrl = this.formatAccessUrl(token);

    // Reset status to PENDING with the new coach
    report.accessLinkToken = token;
    report.tokenExpiresAt = expiresAt;
    report.tokenUsedAt = undefined;
    report.rejectionReason = undefined;

    report.coachReview = {
      coachId: coachObjectId,
      coachEmail: targetEmail,
      coachName: targetName || 'Coach',
      paymentStatus: 'PAID', // Retains previous $3.99 payment!
      paymentAmount: 3.99,
      status: 'PENDING',
      transactionId: report.coachReview?.transactionId,
    };

    report.evaluatorInfo = {
      name: targetName || 'Coach',
      email: targetEmail,
      role: 'Coach / Scout',
    };

    await report.save();

    // Dispatch email to new coach/evaluator
    const emailHtml = getCoachReportRequestEmailTemplate(
      targetName || 'Coach',
      player.fullName || 'Player',
      {
        leagueType: report.leagueType || report.gameType || 'Match Evaluation',
        homeTeam: report.homeTeam || 'Home Team',
        awayTeam: report.awayTeam || 'Opponent',
        matchDate: new Date(report.matchDate || report.gameDate || Date.now()).toLocaleDateString(),
      },
      accessUrl,
    );

    await emailQueue.add('send-coach-report-request', {
      to: targetEmail,
      subject: `Game Report Evaluation Request for ${player.fullName || 'Athlete'}`,
      body: emailHtml,
    });

    // In-app notification if new coach is registered on platform
    if (coachObjectId) {
      await notificationService.createNotification({
        recipientId: coachObjectId,
        recipientRole: 'COACH',
        title: 'New Match Evaluation Request',
        message: `You have received a re-assigned match evaluation request for ${player.fullName || 'player'}.`,
        type: 'NEW_EVALUATION_REQUEST',
        data: { reportId: report._id, accessUrl },
      });
    }

    return {
      success: true,
      message: `Game report re-assigned to ${targetName || targetEmail} successfully without additional charge ($0.00).`,
      reportId: report._id,
      assignedTo: {
        name: targetName,
        email: targetEmail,
      },
      accessLink: accessUrl,
      status: 'PENDING',
      feePaid: '$3.99 (Retained from initial payment)',
    };
  }

  private async notifyParents(playerId: any, title: string, message: string, reportId: any) {
    if (!playerId) return;
    try {
      const parentLinks = await ParentChild.find({
        childPlayerId: playerId,
      }).populate('parentId');

      for (const link of parentLinks) {
        const parent = link.parentId as any;
        if (parent && parent.userId) {
          await notificationService.createNotification({
            recipientId: parent.userId,
            recipientRole: 'PARENT',
            title,
            message,
            type: 'CHILD_GAME_REPORT_REQUEST',
            data: { reportId, childPlayerId: playerId },
          });
        }
      }
    } catch (err: any) {
      logger.error({ err }, 'Error sending parent notification in access link service');
    }
  }
}

export const gameReportAccessLinkService = new GameReportAccessLinkService();
