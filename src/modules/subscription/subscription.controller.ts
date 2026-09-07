import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { subscriptionService } from './subscription.service';

export const createPlan = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.createPlan(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Membership plan created successfully',
    data: result,
  });
});

export const getPlans = catchAsync(async (_req: Request, res: Response) => {
  const result = await subscriptionService.getActivePlans();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Membership plans fetched successfully',
    data: result,
  });
});

export const subscribe = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || req.body.userId;
  const result = await subscriptionService.subscribe(userId, req.body.planId);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Subscribed successfully',
    data: result,
  });
});

export const getUserSubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || req.params.userId;
  const result = await subscriptionService.getUserSubscription(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User subscription fetched successfully',
    data: result,
  });
});
