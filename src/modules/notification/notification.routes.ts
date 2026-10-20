import { Router } from 'express';
import { auth } from '@/middlewares/auth.middleware';
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './notification.controller';

const router = Router();

router.use(auth());

router.get('/', getMyNotifications);
router.patch('/mark-all-read', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

export const NotificationRoutes = router;
