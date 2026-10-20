import { Types, Document } from 'mongoose';

export type NotificationType =
  | 'PAYMENT_SUCCESS'
  | 'CHILD_GAME_REPORT_REQUEST'
  | 'NEW_EVALUATION_REQUEST'
  | 'EVALUATION_COMPLETED'
  | 'CHILD_EVALUATION_COMPLETED'
  | 'SYSTEM';

export interface INotification {
  recipientId: Types.ObjectId;
  recipientRole?: string;
  title: string;
  message: string;
  type: NotificationType | string;
  data?: Record<string, any>;
  isRead: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface INotificationDocument extends INotification, Document {}
