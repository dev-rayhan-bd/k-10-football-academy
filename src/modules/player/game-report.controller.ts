import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { gameReportService } from './services/game-report.service';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';

/**
 * 1. Self Flow: Player submits Game Report (Screen 1 to 5) directly
 */
export const createSelfGameReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const result = await gameReportService.createSelfGameReport(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Game report completed and verified with Excel performance formula',
    data: result,
  });
});

/**
 * 2. Coach Flow - Step 1: Request Coach with $6.99 Stripe Payment (Screen 1 & 2)
 */
export const requestCoachGameReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const result = await gameReportService.requestCoachGameReport(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Game report created and Stripe payment checkout initiated ($6.99)',
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

  await gameReportService.handleStripeWebhook(event);

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
