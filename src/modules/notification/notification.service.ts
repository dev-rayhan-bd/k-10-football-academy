import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Notification } from './notification.model';
import { User } from '@/modules/user/user.model';
import { AppError } from '@/utils/AppError';
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

  getRoleControls(role: string, settings: any) {
    const r = (role || 'PLAYER').toUpperCase();

    switch (r) {
      case 'PLAYER':
      case 'ATHLETE':
      case 'PARENT':
      case 'GUARDIAN':
        return [
          {
            key: 'newVideoLikes',
            title: 'New video likes',
            description: 'Get notified when someone likes your video',
            value: settings.newVideoLikes ?? true,
          },
          {
            key: 'profileViews',
            title: 'Profile views',
            description: 'Get notified when a club views your profile',
            value: settings.profileViews ?? true,
          },
          {
            key: 'interestAlerts',
            title: 'Interest alerts',
            description: 'Get notified when a club shows interest in you',
            value: settings.interestAlerts ?? true,
          },
          {
            key: 'marketingEmails',
            title: 'Marketing emails',
            description: 'Receive news and updates from K10 Football',
            value: settings.marketingEmails ?? false,
          },
        ];

      case 'COACH':
      case 'ACADEMY':
        return [
          {
            key: 'newVideoLikes',
            title: 'New video likes',
            description: 'Get notified when someone likes your video',
            value: settings.newVideoLikes ?? true,
          },
          {
            key: 'profileViews',
            title: 'Profile views',
            description: 'Get notified when a club views your profile',
            value: settings.profileViews ?? true,
          },
          {
            key: 'interestAlerts',
            title: 'Interest alerts',
            description: 'Get notified when clubs express interest in your athletes',
            value: settings.interestAlerts ?? true,
          },
          {
            key: 'marketingEmails',
            title: 'Marketing emails',
            description: 'Receive news and updates from K10 Football',
            value: settings.marketingEmails ?? false,
          },
        ];

      case 'CLUB':
        return [
          {
            key: 'newCvAlerts',
            title: 'New CV Alerts',
            description: 'Get notified of new athlete CVs',
            value: settings.newCvAlerts ?? true,
          },
          {
            key: 'profileShareAlerts',
            title: 'Profile Share Alerts',
            description: 'Notification when profiles are viewed',
            value: settings.profileShareAlerts ?? true,
          },
          {
            key: 'marketingEmails',
            title: 'Marketing emails',
            description: 'Receive news and updates from K10 Football',
            value: settings.marketingEmails ?? false,
          },
        ];

      case 'AGENT':
        return [
          {
            key: 'newPlayers',
            title: 'New Players',
            description: 'Get notified when new Players join',
            value: settings.newPlayers ?? true,
          },
          {
            key: 'profileUpdates',
            title: 'Profile Updates',
            description: 'Notifications when liked Players update profiles',
            value: settings.profileUpdates ?? true,
          },
          {
            key: 'sharedWithYou',
            title: 'Shared with You',
            description: 'When another agent shares a profile with you',
            value: settings.sharedWithYou ?? true,
          },
          {
            key: 'marketingEmails',
            title: 'Marketing emails',
            description: 'Receive news and updates from K10 Football',
            value: settings.marketingEmails ?? false,
          },
        ];

      default:
        return [
          {
            key: 'newVideoLikes',
            title: 'New video likes',
            description: 'Get notified when someone likes your video',
            value: settings.newVideoLikes ?? true,
          },
          {
            key: 'profileViews',
            title: 'Profile views',
            description: 'Get notified when a club views your profile',
            value: settings.profileViews ?? true,
          },
          {
            key: 'marketingEmails',
            title: 'Marketing emails',
            description: 'Receive news and updates from K10 Football',
            value: settings.marketingEmails ?? false,
          },
        ];
    }
  }

  async getNotificationSettings(userId: string) {
    const user = await User.findById(userId).select('role notificationSettings');
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const settings = user.notificationSettings || {
      newVideoLikes: true,
      profileViews: true,
      interestAlerts: true,
      marketingEmails: false,
      newCvAlerts: true,
      profileShareAlerts: true,
      newPlayers: true,
      profileUpdates: true,
      sharedWithYou: true,
    };

    const controls = this.getRoleControls(user.role, settings);

    return {
      role: user.role,
      settings,
      controls,
    };
  }

  async updateNotificationSettings(userId: string, payload: any) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const currentSettings = user.notificationSettings || {};
    const updatedSettings: any = {
      ...currentSettings,
    };

    const allowedKeys = [
      'newVideoLikes',
      'profileViews',
      'interestAlerts',
      'marketingEmails',
      'newCvAlerts',
      'profileShareAlerts',
      'newPlayers',
      'profileUpdates',
      'sharedWithYou',
    ];

    allowedKeys.forEach((key) => {
      if (typeof payload[key] === 'boolean') {
        updatedSettings[key] = payload[key];
      }
    });

    user.notificationSettings = updatedSettings;
    await user.save();

    const controls = this.getRoleControls(user.role, user.notificationSettings);

    return {
      role: user.role,
      settings: user.notificationSettings,
      controls,
    };
  }
}

export const notificationService = new NotificationService();
