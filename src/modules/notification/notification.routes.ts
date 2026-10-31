import { Router } from 'express';
import { auth } from '@/middlewares/auth.middleware';
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  getNotificationSettings,
  updateNotificationSettings,
} from './notification.controller';

const router = Router();

// All notification routes are secured and work seamlessly for ALL authenticated roles
router.use(auth());

// 1. Notification Preferences / Settings
router.get('/settings', getNotificationSettings);
router.patch('/settings', updateNotificationSettings);

// 2. Unread notification count for badges / header bell
router.get('/unread-count', getUnreadNotificationCount);

// 3. Batch operations
router.patch('/mark-all-read', markAllNotificationsRead);
router.delete('/clear-all', clearAllNotifications);

// 4. Core notifications list & single item operations
router.get('/', getMyNotifications);
router.patch('/:id/read', markNotificationRead);
router.delete('/:id', deleteNotification);

export const NotificationRoutes = router;
