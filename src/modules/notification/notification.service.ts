import { Types } from 'mongoose';
import { Notification } from './notification.model';
import { logger } from '@/utils/logger';
import QueryBuilder from '@/builder/QueryBuilder';

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

  async getMyNotifications(userId: string, queryOrPage: any = 1, limit = 20) {
    const filter = { recipientId: new Types.ObjectId(userId) };

    const normalizedQuery: Record<string, unknown> =
      typeof queryOrPage === 'object' && queryOrPage !== null
        ? { ...queryOrPage }
        : {
            page: queryOrPage || 1,
            limit: limit || 20,
          };

    const notificationQuery = new QueryBuilder(Notification.find(filter), normalizedQuery)
      .search(['title', 'message', 'type'])
      .filter()
      .sort()
      .paginate();

    const [items, pagination, unreadCount] = await Promise.all([
      notificationQuery.modelQuery,
      notificationQuery.countTotal(),
      Notification.countDocuments({ ...filter, isRead: false }),
    ]);

    return {
      notifications: items,
      meta: {
        total: pagination.total,
        unreadCount,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: pagination.totalPage,
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
