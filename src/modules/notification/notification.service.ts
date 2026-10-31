import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Notification } from './notification.model';
import { User } from '@/modules/user/user.model';
import { AppError } from '@/utils/AppError';
import { logger } from '@/utils/logger';
import { emitToUser } from '@/socket';

export class NotificationService {
  async createNotification(payload: {
    recipientId: string | Types.ObjectId;
    recipientRole?: string;
    title: string;
    message: string;
    type: string;
    data?: Record<string, unknown>;
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

      try {
        const recipientStr = payload.recipientId.toString();
        // Emit both new_notification and notification for flexible client-side listeners
        emitToUser(recipientStr, 'new_notification', doc);
        emitToUser(recipientStr, 'notification', doc);
      } catch {
        // Socket emission failure should not disrupt persistence
      }

      return doc;
    } catch (err: unknown) {
      logger.error({ err }, 'Failed to create in-app notification');
      return null;
    }
  }

  /**
   * Dispatches notifications to all Admins while respecting each Admin's individual toggle settings
   */
  async notifyAdmins(payload: {
    settingKey:
      | 'verificationAlerts'
      | 'storyAlerts'
      | 'paymentAlerts'
      | 'userRegistrationAlerts'
      | 'reportAlerts'
      | 'systemAlerts'
      | 'marketingEmails';
    title: string;
    message: string;
    type: string;
    data?: Record<string, unknown>;
  }) {
    try {
      const admins = await User.find({
        role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
        status: { $ne: 'BLOCKED' },
      }).select('_id role notificationSettings');

      const docs = [];
      for (const admin of admins) {
        const settings = (admin.notificationSettings || {}) as Record<string, boolean>;
        // If the admin turned off this notification toggle, respect their choice and skip
        if (settings[payload.settingKey] === false) {
          logger.info(
            `Admin notification "${payload.title}" skipped for admin ${admin._id} because ${payload.settingKey} is turned off`,
          );
          continue;
        }

        const doc = await this.createNotification({
          recipientId: admin._id,
          recipientRole: admin.role,
          title: payload.title,
          message: payload.message,
          type: payload.type,
          data: payload.data,
        });
        if (doc) docs.push(doc);
      }
      return docs;
    } catch (err: unknown) {
      logger.error({ err }, 'Failed to notify admins');
      return [];
    }
  }

  async getMyNotifications(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      isRead?: boolean;
      type?: string;
    },
  ) {
    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options?.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { recipientId: new Types.ObjectId(userId) };

    if (options?.isRead !== undefined) {
      filter.isRead = options.isRead;
    }

    if (options?.type) {
      filter.type = options.type;
    }

    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipientId: new Types.ObjectId(userId), isRead: false }),
    ]);

    return {
      notifications: items,
      meta: {
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({
      recipientId: new Types.ObjectId(userId),
      isRead: false,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    const doc = await Notification.findOneAndUpdate(
      { _id: notificationId, recipientId: new Types.ObjectId(userId) },
      { isRead: true },
      { new: true },
    );
    if (!doc) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Notification not found');
    }
    return doc;
  }

  async markAllAsRead(userId: string) {
    return Notification.updateMany(
      { recipientId: new Types.ObjectId(userId), isRead: false },
      { isRead: true },
    );
  }

  async deleteNotification(notificationId: string, userId: string) {
    const doc = await Notification.findOneAndDelete({
      _id: notificationId,
      recipientId: new Types.ObjectId(userId),
    });
    if (!doc) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Notification not found');
    }
    return doc;
  }

  async clearAllNotifications(userId: string) {
    const result = await Notification.deleteMany({
      recipientId: new Types.ObjectId(userId),
    });
    return { deletedCount: result.deletedCount };
  }

  getRoleControls(role: string, settings: Record<string, boolean>) {
    const r = (role || 'PLAYER').toUpperCase();

    switch (r) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return [
          {
            key: 'verificationAlerts',
            title: 'Verification & KYC Requests',
            description:
              'Get notified when clubs, agents, coaches, or academies submit verification documents',
            value: settings.verificationAlerts ?? true,
          },
          {
            key: 'storyAlerts',
            title: 'Success Story Approvals',
            description:
              'Get notified when clubs, agents, or academies submit new success stories for review',
            value: settings.storyAlerts ?? true,
          },
          {
            key: 'paymentAlerts',
            title: 'Payment & Revenue Alerts',
            description:
              'Get notified when subscriptions, memberships, or game reports are purchased',
            value: settings.paymentAlerts ?? true,
          },
          {
            key: 'userRegistrationAlerts',
            title: 'New User Registrations',
            description:
              'Get notified whenever new players, coaches, clubs, agents, or academies sign up',
            value: settings.userRegistrationAlerts ?? true,
          },
          {
            key: 'reportAlerts',
            title: 'Game Reports & Match Evaluations',
            description: 'Get notified when match reports are submitted, evaluated, or disputed',
            value: settings.reportAlerts ?? true,
          },
          {
            key: 'systemAlerts',
            title: 'System & Security Alerts',
            description:
              'Get notified of critical security events, account status modifications, and platform errors',
            value: settings.systemAlerts ?? true,
          },
          {
            key: 'marketingEmails',
            title: 'Platform Digests & Updates',
            description:
              'Receive platform performance summaries, newsletters, and system digest updates',
            value: settings.marketingEmails ?? false,
          },
        ];

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
            key: 'systemAlerts',
            title: 'System Alerts',
            description: 'Get notified of critical platform notifications',
            value: settings.systemAlerts ?? true,
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

    const rawSettings = (user.notificationSettings || {}) as Record<string, boolean>;
    const controls = this.getRoleControls(user.role, rawSettings);

    // Build role-scoped settings object matching controls 1-to-1
    const settings: Record<string, boolean> = {};
    for (const ctrl of controls) {
      settings[ctrl.key] = ctrl.value;
    }

    return {
      role: user.role,
      settings,
      controls,
    };
  }

  async updateNotificationSettings(userId: string, payload: Record<string, unknown>) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const currentSettings = (user.notificationSettings || {}) as Record<string, boolean>;
    const controls = this.getRoleControls(user.role, currentSettings);
    const validKeys = controls.map((c) => c.key);

    const updatedSettings: Record<string, boolean> = {
      ...currentSettings,
    };

    for (const key of validKeys) {
      if (typeof payload[key] === 'boolean') {
        updatedSettings[key] = payload[key] as boolean;
      }
    }

    user.notificationSettings = updatedSettings;
    await user.save();

    const updatedControls = this.getRoleControls(
      user.role,
      user.notificationSettings as Record<string, boolean>,
    );

    const finalSettings: Record<string, boolean> = {};
    for (const ctrl of updatedControls) {
      finalSettings[ctrl.key] = ctrl.value;
    }

    return {
      role: user.role,
      settings: finalSettings,
      controls: updatedControls,
    };
  }
}

export const notificationService = new NotificationService();
