import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { notificationService } from './notification.service';

export const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const result = await notificationService.getMyNotifications(userId, page, limit);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Notifications retrieved successfully',
    meta: result.meta,
    data: result.notifications,
  });
});

export const markNotificationRead = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const { id } = req.params;

  const result = await notificationService.markAsRead(id, userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Notification marked as read',
    data: result,
  });
});

export const markAllNotificationsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;

  const result = await notificationService.markAllAsRead(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'All notifications marked as read',
    data: result,
  });
});

export const getNotificationSettings = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const result = await notificationService.getNotificationSettings(userId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Notification settings retrieved successfully',
    data: result,
  });
});

export const updateNotificationSettings = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const result = await notificationService.updateNotificationSettings(userId, req.body);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Notification settings updated successfully',
    data: result,
  });
});
