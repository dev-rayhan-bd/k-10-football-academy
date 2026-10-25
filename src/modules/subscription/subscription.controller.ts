import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { subscriptionService } from './subscription.service';

export const createPlan = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.createPlan(req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Membership plan created successfully',
    data: result,
  });
});

export const getPlans = catchAsync(async (req: Request, res: Response) => {
  const role = req.query.role as string | undefined;
  const result = await subscriptionService.getActivePlans(role);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Membership plans fetched successfully',
    data: result,
  });
});

export const subscribe = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?.id || req.body.userId;
  const result = await subscriptionService.subscribe(userId, req.body.planId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Stripe checkout session created successfully',
    data: result,
  });
});

export const verifyPayment = catchAsync(async (req: Request, res: Response) => {
  const sessionId = (req.query.session_id ||
    req.query.sessionId ||
    req.body?.sessionId ||
    req.body?.session_id) as string;
  const result = await subscriptionService.verifyPayment(sessionId);
  sendResponse(res, {
    statusCode: result.success ? StatusCodes.OK : StatusCodes.BAD_REQUEST,
    success: result.success,
    message: result.message,
    data: result,
  });
});

export const getUserSubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?.id || req.params.userId;
  const result = await subscriptionService.getUserSubscription(userId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'User subscription fetched successfully',
    data: result,
  });
});
