import { Types } from 'mongoose';
import { Notification } from './notification.model';
import { logger } from '@/utils/logger';

export class NotificationService {
  async createNotification(payload: {
    recipientId: string | Types.ObjectId;
    recipientRole?: string;
    title: string;
    message: string;
    type: string;
    data?: Record<string, any>;
  }) {
    try {
      const doc = await Notification.create({
        recipientId: new Types.ObjectId(payload.recipientId.toString()),
        recipientRole: payload.recipientRole,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        data: payload.data,
        isRead: false,
      });
      logger.info(`Notification created for user: ${payload.recipientId} - "${payload.title}"`);
      return doc;
    } catch (err: any) {
      logger.error({ err }, 'Failed to create in-app notification');
      return null;
    }
  }

  async getMyNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { recipientId: new Types.ObjectId(userId) };

    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, isRead: false }),
    ]);

    return {
      notifications: items,
      meta: {
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, recipientId: new Types.ObjectId(userId) },
      { isRead: true },
      { new: true },
    );
  }

  async markAllAsRead(userId: string) {
    return Notification.updateMany(
      { recipientId: new Types.ObjectId(userId), isRead: false },
      { isRead: true },
    );
  }
}

export const notificationService = new NotificationService();
