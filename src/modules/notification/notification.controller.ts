import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { notificationService } from './notification.service';

export const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId || (req.user as any)?._id;
  const result = await notificationService.getMyNotifications(userId, req.query);

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
