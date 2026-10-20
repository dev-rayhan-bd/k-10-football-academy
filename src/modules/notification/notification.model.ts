import { Schema, model } from 'mongoose';
import { INotificationDocument } from './notification.interface';

const NotificationSchema = new Schema<INotificationDocument>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientRole: { type: String },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: 'SYSTEM', index: true },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });

export const Notification = model<INotificationDocument>('Notification', NotificationSchema);
