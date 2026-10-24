import { Router } from 'express';
import { auth } from '@/middlewares/auth.middleware';
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationSettings,
  updateNotificationSettings,
} from './notification.controller';

const router = Router();

router.use(auth());

// Notification Preferences / Controls (Common for all roles)
router.get('/settings', getNotificationSettings);
router.patch('/settings', updateNotificationSettings);
router.put('/settings', updateNotificationSettings);

router.get('/preferences', getNotificationSettings);
router.patch('/preferences', updateNotificationSettings);
router.put('/preferences', updateNotificationSettings);

router.get('/', getMyNotifications);
router.patch('/mark-all-read', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

export const NotificationRoutes = router;
