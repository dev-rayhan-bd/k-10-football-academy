import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { gameReportService } from './services/game-report.service';
import { academyService } from '@/modules/academy/academy.service';
import { subscriptionService } from '@/modules/subscription/subscription.service';
import { shopService } from '@/modules/shop/shop.service';
import { playerCvValidationRequestService } from './services/player-cv-validation-request.service';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { MatchRecord } from '@/modules/player/player.model';
import { gameReportPdfService } from './services/game-report/game-report-pdf.service';
import { AppError } from '@/utils/AppError';

/**
 * 1. Self Flow: Player submits Game Report (Screen 1 to 5) directly
 */
export const createSelfGameReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const result = await gameReportService.createSelfGameReport(userId, req.body, req.user);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Game report initiated and Stripe payment checkout created ($3.99)',
    data: result,
  });
});

/**
 * 1.b Self Flow - Step 2: Submit 36 Performance Indicators after Payment
 */
export const completeSelfGameReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const reportId = req.params.reportId || req.params.id;
  const result = await gameReportService.completeSelfGameReport(
    userId,
    reportId,
    req.body,
    req.user,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

/**
 * 2. Coach Flow - Step 1: Request Coach with $3.99 Stripe Payment (Screen 1 & 2)
 */
export const requestCoachGameReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const result = await gameReportService.requestCoachGameReport(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Game report created and Stripe payment checkout initiated ($3.99)',
    data: result,
  });
});

/**
 * 3. Stripe Webhook: Verifies payment & notifies coach
 */
export const handleStripeGameReportWebhook = catchAsync(async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  let event: any;
  if (webhookSecret && sig) {
    const stripe = getStripeClient();
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      res
        .status(StatusCodes.BAD_REQUEST)
        .send(`Webhook Signature Verification Error: ${err.message}`);
      return;
    }
  } else {
    event = req.body;
  }

  const obj = event.data?.object || {};
  if (
    obj.metadata?.paymentType === 'ACADEMY_PREMIUM_PLAN' ||
    obj.metadata?.type === 'ACADEMY_PREMIUM_PLAN'
  ) {
    await academyService.handleAcademyPlanStripeWebhook(obj);
  } else if (
    obj.metadata?.paymentType === 'MEMBERSHIP_SUBSCRIPTION' ||
    obj.metadata?.type === 'MEMBERSHIP_SUBSCRIPTION'
  ) {
    await subscriptionService.handleSubscriptionStripeWebhook(obj);
  } else if (obj.metadata?.paymentType === 'SHOP_ORDER' || obj.metadata?.type === 'SHOP_ORDER') {
    await shopService.handleShopOrderStripeWebhook(obj);
  } else if (
    obj.metadata?.paymentType === 'TOURNAMENT_CLUB_REGISTRATION' ||
    obj.metadata?.type === 'TOURNAMENT_CLUB_REGISTRATION'
  ) {
    await academyService.handleTournamentRegistrationStripeWebhook(obj);
  } else if (
    obj.metadata?.paymentType === 'CV_VALIDATION' ||
    obj.metadata?.type === 'CV_VALIDATION'
  ) {
    const playerId = obj.metadata?.playerId;
    const transactionId = obj.id || obj.payment_intent;
    if (playerId) {
      await playerCvValidationRequestService.finalizePaidCvValidation(playerId, transactionId);
    }
  } else {
    await gameReportService.handleStripeWebhook(event);
  }

  res.status(StatusCodes.OK).json({ received: true });
});

/**
 * 4. Coach Flow - Get Pending Reports assigned to the logged-in coach
 */
export const getCoachPendingReports = catchAsync(async (req: Request, res: Response) => {
  const coachEmail = req.user!.email;
  const { meta, result } = await gameReportService.getCoachPendingReports(coachEmail, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Pending coach evaluation reports retrieved successfully',
    meta,
    data: result,
  });
});

/**
 * 4b. Coach Flow - Get All Game Reports Dashboard (Screen 2: 4 Cards & Table)
 */
export const getCoachAllGameReports = catchAsync(async (req: Request, res: Response) => {
  const coachUser = {
    userId: req.user?.userId || (req.user as any)?._id,
    email: req.user?.email || '',
  };
  const result = await gameReportService.getCoachAllGameReports(coachUser, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Coach game reports dashboard retrieved successfully',
    meta: result.meta,
    data: {
      summary: result.summary,
      reports: result.reports,
    },
  });
});

/**
 * 5. Coach Flow - Step 2: Coach completes Match Report (Screen 3, 4, 5)
 */
export const completeCoachGameReport = catchAsync(async (req: Request, res: Response) => {
  const { reportId } = req.params;
  const coachUser = {
    _id: req.user?.userId || (req.user as any)?._id,
    userId: req.user?.userId || (req.user as any)?._id,
    email: req.user?.email,
    name: (req.user as any)?.name || 'Coach',
  };
  const result = await gameReportService.completeCoachGameReport(reportId, coachUser, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Coach evaluation completed and player CV updated successfully',
    data: result,
  });
});

/**
 * Action on Game Report Request (Accept, Reject, Schedule, Cancel)
 */
export const updateGameReportStatus = catchAsync(async (req: Request, res: Response) => {
  const reportId = req.params.reportId || req.params.id;
  const result = await gameReportService.updateGameReportStatus(reportId, req.user, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

/**
 * 6. Verify Game Report Payment (Direct Stripe API check fallback for local dev / webhook delays)
 */
export const verifyGameReportPayment = catchAsync(async (req: Request, res: Response) => {
  const sessionId = (req.query.session_id || req.query.sessionId) as string | undefined;
  const reportId = (req.query.reportId || req.query.report_id) as string | undefined;

  const result = await gameReportService.verifyPayment(sessionId, reportId);

  sendResponse(res, {
    statusCode: result.success ? StatusCodes.OK : StatusCodes.BAD_REQUEST,
    success: result.success,
    message: result.success
      ? 'Payment verified successfully and coach notified'
      : (result as any).message || 'Payment verification failed or pending',
    data: result,
  });
});

/**
 * 7. Get Player's Game Reports (Summary stats, filter tabs ALL/PAID/PENDING, pagination)
 */
export const getPlayerGameReports = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id || req.params.playerId || req.params.id;
  const result = await gameReportService.getPlayerGameReports(userId, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Player game reports retrieved successfully',
    data: result,
  });
});

/**
 * 8. Get Specific Game Report Details for Side Drawer
 */
export const getGameReportDetails = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id || req.params.playerId || req.params.id;
  const reportId = req.params.reportId || req.params.id;
  const result = await gameReportService.getGameReportDetails(userId, reportId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Game report details retrieved successfully',
    data: result,
  });
});

/**
 * 9. Option B: View Game Report by Secure Token (Zero account required for external evaluator)
 */
export const getReportByAccessLink = catchAsync(async (req: Request, res: Response) => {
  const token = req.params.token;
  const result = await gameReportService.getReportByAccessLink(token);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Game report details fetched via secure access link',
    data: result,
  });
});

/**
 * 10. Option B: Evaluator Responds to Secure Access Link (ACCEPT or REJECT)
 */
export const respondToAccessLink = catchAsync(async (req: Request, res: Response) => {
  const token = req.params.token;
  const result = await gameReportService.respondToAccessLink(token, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

/**
 * 11. Option B: Evaluator Submits 36 Performance Indicators via Secure Link
 */
export const submitReportByAccessLink = catchAsync(async (req: Request, res: Response) => {
  const token = req.params.token;
  const result = await gameReportService.submitReportByAccessLink(token, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

/**
 * 12. Re-assign Rejected Game Report to another Coach / Person WITHOUT extra payment ($0 charge)
 */
export const reassignGameReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const reportId = req.params.reportId || req.params.id;
  const result = await gameReportService.reassignGameReport(userId, reportId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

/**
 * 13. Download or Stream Official Game Report PDF (Client Requirement 4)
 */
export const downloadGameReportPdf = catchAsync(async (req: Request, res: Response) => {
  const reportId = req.params.reportId || req.params.id;
  const matchRecord = await MatchRecord.findById(reportId).populate('playerId');
  if (!matchRecord) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Game report not found');
  }

  const pdfBuffer = await gameReportPdfService.buildPdfBuffer(matchRecord);
  const playerName =
    matchRecord.playerInfo?.playerName || (matchRecord.playerId as any)?.fullName || 'Player';
  const cleanFilename = `Game_Report_${playerName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${matchRecord._id}.pdf`;

  if (!matchRecord.reportPdfUrl) {
    try {
      const savedUrl = await gameReportPdfService.generateAndSaveReportPdf(matchRecord);
      if (savedUrl) {
        matchRecord.reportPdfUrl = savedUrl;
        await matchRecord.save();
      }
    } catch {
      // ignore
    }
  }

  const isDownload = req.query.download === 'true';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${isDownload ? 'attachment' : 'inline'}; filename="${cleanFilename}"`,
  );
  res.setHeader('Content-Length', pdfBuffer.length);
  res.status(StatusCodes.OK).send(pdfBuffer);
});
