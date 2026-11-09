import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { calculateMatchPerformance } from '@/utils/ratingCalculator';
import { MatchRecord } from '@/modules/player/player.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { User } from '@/modules/user/user.model';
import { ParentChild, ParentProfile } from '@/modules/parent/parent.model';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import {
  mapStatsAndEventsToMatchEvents,
  parseTimerInput,
  resolveOrCreatePlayerProfile,
} from './game-report.utils';
import { gameReportPdfService } from './game-report-pdf.service';

export class GameReportSelfService {
  /**
   * Flow 1: Option A - "Parent / Self Creates Report"
   * Author is tagged as Parent or Player.
   * isProfessionallyVerified is false.
   * Initiates $3.99 Stripe checkout session for platform fee.
   */
  async createSelfGameReport(userId: string, payload: any, currentUser?: any) {
    const playerProfile = await resolveOrCreatePlayerProfile(userId, payload);

    const userRole = currentUser?.role || 'PLAYER';
    const isParent = userRole === 'PARENT';

    payload.playerId = playerProfile._id;
    payload.reportCompletionType = isParent ? 'PARENT' : payload.reportCompletionType || 'SELF';
    payload.authorRole = userRole;
    payload.authorName =
      currentUser?.name || (isParent ? 'Parent' : playerProfile.fullName || 'Player');
    payload.isProfessionallyVerified = false;

    const resolvedPrice = Number(payload.price || payload.amount || 3.99);

    const hasStats = Boolean(
      (payload.stats && Object.keys(payload.stats).length > 0) ||
      (Array.isArray(payload.events) && payload.events.length > 0),
    );

    payload.coachReview = {
      paymentStatus: 'UNPAID',
      paymentAmount: resolvedPrice,
      status: hasStats ? 'COMPLETED' : 'IN_PROGRESS',
    };

    // Auto-fill playerInfo from Screen 1 if not provided or merge
    payload.playerInfo = {
      playerName: payload.playerInfo?.playerName || playerProfile.fullName,
      dateOfBirth: payload.playerInfo?.dateOfBirth || playerProfile.dateOfBirth,
      clubName: payload.playerInfo?.clubName || playerProfile.currentClub,
      position: payload.playerInfo?.position || playerProfile.position,
      foot: payload.playerInfo?.foot || playerProfile.preferredFoot,
      characteristics: payload.playerInfo?.characteristics || playerProfile.playerStyles || [],
      weight: payload.playerInfo?.weight || playerProfile.weight,
      height: payload.playerInfo?.height || playerProfile.height,
    };

    // Map UI Screen 2 to internal fields
    if (payload.gameType && !payload.leagueType) payload.leagueType = payload.gameType;
    if (payload.gameDate && !payload.matchDate) payload.matchDate = payload.gameDate;
    if (payload.gameLocation && !payload.location) payload.location = payload.gameLocation;
    const resolvedHomeTeam =
      payload.ownTeam ||
      payload.homeTeam ||
      payload.playerInfo?.clubName ||
      playerProfile.currentClub ||
      'Home Team';
    const resolvedOpponent =
      payload.opponentTeam || payload.opponent || payload.awayTeam || 'Opponent';
    const resolvedHomeScore = payload.ownTeamScore ?? payload.homeScore ?? 0;
    const resolvedAwayScore = payload.opponentTeamScore ?? payload.awayScore ?? 0;

    let resolvedResult = payload.result;
    if (!resolvedResult) {
      if (resolvedHomeScore > resolvedAwayScore) resolvedResult = 'W';
      else if (resolvedHomeScore === resolvedAwayScore) resolvedResult = 'D';
      else resolvedResult = 'L';
    }

    payload.homeTeam = resolvedHomeTeam;
    payload.awayTeam = resolvedOpponent;
    payload.homeScore = resolvedHomeScore;
    payload.awayScore = resolvedAwayScore;
    payload.result = resolvedResult;
    payload.matchResult = `${resolvedHomeTeam} ${resolvedHomeScore}-${resolvedAwayScore} ${resolvedOpponent}`;

    // Auto-map UI stats counters to MATCH_EVENTS for client's excel formula
    if (payload.stats || payload.events) {
      payload.events = mapStatsAndEventsToMatchEvents(payload.stats || {}, payload.events || []);
    }

    const hasRawTimer =
      (payload.timer !== undefined && payload.timer !== null && payload.timer !== '') ||
      (payload.matchTime !== undefined && payload.matchTime !== null && payload.matchTime !== '') ||
      (payload.matchDuration !== undefined &&
        payload.matchDuration !== null &&
        payload.matchDuration !== '') ||
      (payload.minutesPlayed !== undefined &&
        payload.minutesPlayed !== null &&
        payload.minutesPlayed !== '');

    if (hasRawTimer) {
      const timerResult = parseTimerInput(payload);
      payload.minutesPlayed = timerResult.minutesPlayed;
      payload.matchDuration = timerResult.matchDuration;
    } else {
      payload.minutesPlayed = 0;
      payload.matchDuration = '00:00';
    }
    const minutes = payload.minutesPlayed;

    // Apply 100% Client's Excel formula for player rating
    if (payload.events && payload.events.length > 0) {
      const position = playerProfile.position || 'CM';
      const perfResult = calculateMatchPerformance(position, minutes, payload.events);

      payload.playerRating = Math.round((perfResult.overallRating / 10) * 10) / 10;
      payload.positivePoints = perfResult.positivePoints;
      payload.negativePoints = perfResult.negativePoints;
      payload.netContribution = perfResult.netContribution;
      payload.interpretation = perfResult.interpretation;
      payload.categoryScores = perfResult.categoryAdjustedScores;
      payload.categoryRatings = perfResult.categoryRatings;
    }

    // Direct stats shortcuts
    if (payload.stats) {
      if (payload.stats.goalScored !== undefined) payload.goals = payload.stats.goalScored;
      if (payload.stats.assists !== undefined) payload.assists = payload.stats.assists;
      if (payload.stats.passAccurate !== undefined) {
        const acc = Number(payload.stats.passAccurate) || 0;
        const wrong = Number(payload.stats.wrongPass) || 0;
        payload.passes = acc + wrong;
        payload.passAccuracy = payload.passes > 0 ? Math.round((acc / payload.passes) * 100) : 0;
      }
      if (payload.stats.yellowCard !== undefined) payload.yellowCards = payload.stats.yellowCard;
      if (payload.stats.redCard !== undefined) payload.redCards = payload.stats.redCard;
      if (payload.stats.standTackle !== undefined || payload.stats.slidingTackle !== undefined) {
        payload.tackles =
          (Number(payload.stats.standTackle) || 0) + (Number(payload.stats.slidingTackle) || 0);
      }
    }

    const record = await MatchRecord.create(payload);
    await playerStatsService.recalculatePlayerStats(playerProfile._id);
    await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);

    // Create Stripe Checkout Session ($3.99 Platform Fee)
    const stripe = getStripeClient();
    const clientBaseUrl = (env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const cancelUrl = env.STRIPE_CANCEL_URL;
    const userDoc = await User.findById(userId);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(resolvedPrice * 100),
            product_data: {
              name: 'K10 Match Report Platform Fee',
              description: `${payload.authorRole === 'PARENT' ? 'Parent' : 'Self'} Match Report for ${playerProfile.fullName || 'Player'} (${resolvedHomeTeam} vs ${resolvedOpponent})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reportType: 'MATCH_RECORD',
        subType: payload.reportCompletionType,
        reportId: record._id.toString(),
        playerId: playerProfile._id.toString(),
        userId: String(userId),
      },
      payment_intent_data: {
        metadata: {
          reportType: 'MATCH_RECORD',
          subType: payload.reportCompletionType,
          reportId: record._id.toString(),
          playerId: playerProfile._id.toString(),
          userId: String(userId),
        },
      },
      customer_email: userDoc?.email || undefined,
      success_url: `${clientBaseUrl}/dashboard/player/game-reports/create?step=statistics&reportId=${record._id}&session_id={CHECKOUT_SESSION_ID}&position=${encodeURIComponent(
        payload.playerInfo?.position ||
          payload.position ||
          record.playerInfo?.position ||
          playerProfile?.position ||
          'CM',
      )}`,
      cancel_url: cancelUrl,
    });

    record.coachReview!.transactionId = session.id;
    await record.save();

    const chosenPosition =
      payload.playerInfo?.position ||
      payload.position ||
      record.playerInfo?.position ||
      playerProfile?.position ||
      'CM';

    return {
      reportId: record._id,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: resolvedPrice,
      currency: '$',
      position: chosenPosition,
      status: 'AWAITING_PAYMENT',
    };
  }

  /**
   * Option A - Step 2: Parent / Player Submits 36 Performance Indicators after Payment ($3.99)
   */
  async completeSelfGameReport(userId: string, reportId: string, payload: any, currentUser?: any) {
    if (!reportId || !Types.ObjectId.isValid(reportId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid report ID is required');
    }

    const matchRecord = await MatchRecord.findById(reportId).populate('playerId');
    if (!matchRecord) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Game report not found');
    }

    // 1. REPEAT SUBMISSION PROTECTION: Prevent multiple submissions on the same finalized report
    // A report is finalized only if it has already been marked COMPLETED AND has recorded events/stats
    const hasExistingStats = Boolean(
      (matchRecord.events && matchRecord.events.length > 0) ||
      (matchRecord.stats &&
        Object.entries(
          matchRecord.stats.toObject ? matchRecord.stats.toObject() : matchRecord.stats,
        ).some(([k, v]) => k !== 'appearances' && Number(v) > 0)),
    );
    if (matchRecord.coachReview?.status === 'COMPLETED' && hasExistingStats) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'This Game Report has already been completed and finalized. Repeated submissions are not allowed.',
      );
    }

    // 2. STRICT PAYMENT ENFORCEMENT: Client Requirement 5
    if (matchRecord.coachReview?.paymentStatus !== 'PAID') {
      throw new AppError(
        StatusCodes.PAYMENT_REQUIRED,
        'Payment of $3.99 platform fee is required before submitting the 36 performance evaluation buttons',
      );
    }

    // 3. OWNERSHIP SECURITY: Ensure requesting user owns this report or is parent/admin
    const playerProfile: any = matchRecord.playerId || {};
    const requesterRole = currentUser?.role || '';
    if (requesterRole !== 'SUPER_ADMIN' && requesterRole !== 'ADMIN') {
      const isDirectPlayer =
        String(playerProfile.userId) === String(userId) ||
        String(playerProfile._id) === String(userId);

      if (!isDirectPlayer) {
        const parentProfile = await ParentProfile.findOne({
          $or: [
            { userId },
            { _id: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null },
          ],
        });
        const isLinkedParent =
          parentProfile &&
          (await ParentChild.exists({
            parentId: parentProfile._id,
            childPlayerId: playerProfile._id,
          }));

        if (!isLinkedParent) {
          throw new AppError(
            StatusCodes.FORBIDDEN,
            'Access denied. You do not have permission to submit this Game Report.',
          );
        }
      }
    }

    const position = playerProfile.position || matchRecord.playerInfo?.position || 'CM';

    const { stats = {}, accurateShots = [], accurateAssists = [], events: rawEvents } = payload;

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

    // Auto-map UI stats counters and 36 events for client's excel formula
    const events = mapStatsAndEventsToMatchEvents(stats, rawEvents);

    // Calculate Rating via Client's 100% Excel Formula
    const isGK =
      position === 'GK' ||
      position.toUpperCase().includes('GOAL') ||
      position.toUpperCase().includes('GK');
    const perfResult = calculateMatchPerformance(position, finalMinutes, events);
    const ratingOutOf10 = Math.round((perfResult.overallRating / 10) * 10) / 10;
    const finalRating = ratingOutOf10;

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

    matchRecord.isProfessionallyVerified = false;
    matchRecord.authorRole = currentUser?.role || 'PARENT';
    matchRecord.authorName = currentUser?.name || 'Parent (Unverified Self-Evaluation)';

    if (matchRecord.coachReview) {
      matchRecord.coachReview.status = 'COMPLETED';
      matchRecord.coachReview.evaluatedAt = new Date();
      matchRecord.coachReview.coachRating = finalRating;
      matchRecord.coachReview.coachFeedback =
        payload.coachFeedback || payload.feedback || 'Parent Self-Evaluation';
    }

    // Generate Official PDF Report (Client Requirement 4)
    const pdfUrl = await gameReportPdfService.generateAndSaveReportPdf(matchRecord);
    if (pdfUrl) {
      matchRecord.reportPdfUrl = pdfUrl;
    }

    await matchRecord.save();

    if (playerProfile._id) {
      await playerStatsService.recalculatePlayerStats(playerProfile._id);
      await playerCacheService.invalidatePlayerCache(playerProfile._id, playerProfile.userId);
    }

    const apiBase = env.PUBLIC_API_URL
      ? env.PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
      : `http://localhost:${env.PORT || 5000}`;
    const pdfViewUrl = `${apiBase}/api/v1/players/game-reports/${matchRecord._id}/pdf`;
    const pdfDownloadUrl = `${apiBase}/api/v1/players/game-reports/${matchRecord._id}/pdf?download=true`;

    const indicatorCount = isGK ? 45 : 36;
    return {
      success: true,
      message: `${indicatorCount} performance indicators saved and official PDF generated`,
      reportId: matchRecord._id,
      overallRating: ratingOutOf10,
      overallScore: perfResult.overallRating,
      reportPdfUrl: matchRecord.reportPdfUrl || pdfViewUrl,
      pdfViewUrl,
      pdfDownloadUrl,
      status: 'COMPLETED',
      isProfessionallyVerified: false,
    };
  }
}

export const gameReportSelfService = new GameReportSelfService();
