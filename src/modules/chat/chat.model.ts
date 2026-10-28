import { Schema, model } from 'mongoose';
import {
  IConversationDocument,
  IConversationParticipantDocument,
  IMessageDocument,
} from './chat.interface';

const ConversationSchema = new Schema<IConversationDocument>(
  {
    type: { type: String, enum: ['INDIVIDUAL', 'GROUP'], default: 'INDIVIDUAL' },
    name: { type: String, default: '' },
    avatar: { type: String, default: '' },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User' },
    lastMessage: { type: String, default: '' },
    lastMessageTime: { type: Date, default: Date.now },
    lastSenderId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

ConversationSchema.index({ lastMessageTime: -1 });

const ConversationParticipantSchema = new Schema<IConversationParticipantDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String },
    unreadCount: { type: Number, default: 0 },
    lastReadAt: { type: Date },
  },
  { timestamps: true },
);

ConversationParticipantSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

const MessageSchema = new Schema<IMessageDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    text: { type: String, default: '' },
    imageUrl: { type: String },
    attachmentsJson: { type: String },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const Conversation = model<IConversationDocument>('Conversation', ConversationSchema);
export const ConversationParticipant = model<IConversationParticipantDocument>(
  'ConversationParticipant',
  ConversationParticipantSchema,
);
export const Message = model<IMessageDocument>('Message', MessageSchema);
