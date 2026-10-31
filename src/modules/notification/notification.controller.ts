import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { notificationService } from './notification.service';

export const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  let isRead: boolean | undefined;
  if (req.query.isRead !== undefined) {
    if (req.query.isRead === 'true') isRead = true;
    else if (req.query.isRead === 'false') isRead = false;
  }

  const type = req.query.type ? String(req.query.type) : undefined;

  const result = await notificationService.getMyNotifications(userId, {
    page,
    limit,
    isRead,
    type,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Notifications retrieved successfully',
    meta: result.meta,
    data: result.notifications,
  });
});

export const getUnreadNotificationCount = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const unreadCount = await notificationService.getUnreadCount(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Unread notification count retrieved successfully',
    data: { unreadCount },
  });
});

export const markNotificationRead = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
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
  const userId = req.user!.userId;

  const result = await notificationService.markAllAsRead(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'All notifications marked as read',
    data: result,
  });
});

export const deleteNotification = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const result = await notificationService.deleteNotification(id, userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Notification deleted successfully',
    data: result,
  });
});

export const clearAllNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const result = await notificationService.clearAllNotifications(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'All notifications cleared successfully',
    data: result,
  });
});

export const getNotificationSettings = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const result = await notificationService.getNotificationSettings(userId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Notification settings retrieved successfully',
    data: result,
  });
});

export const updateNotificationSettings = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const result = await notificationService.updateNotificationSettings(
    userId,
    req.body as Record<string, unknown>,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Notification settings updated successfully',
    data: result,
  });
});
