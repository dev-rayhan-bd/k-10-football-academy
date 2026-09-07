import { Schema, model } from 'mongoose';
import {
  IConversationDocument,
  IConversationParticipantDocument,
  IMessageDocument,
} from './chat.interface';

const ConversationSchema = new Schema<IConversationDocument>(
  {
    lastMessage: { type: String },
    lastMessageTime: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const ConversationParticipantSchema = new Schema<IConversationParticipantDocument>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String },
  },
  { timestamps: true },
);

const MessageSchema = new Schema<IMessageDocument>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User' },
    text: { type: String },
    attachmentsJson: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Conversation = model<IConversationDocument>('Conversation', ConversationSchema);
export const ConversationParticipant = model<IConversationParticipantDocument>(
  'ConversationParticipant',
  ConversationParticipantSchema,
);
export const Message = model<IMessageDocument>('Message', MessageSchema);
