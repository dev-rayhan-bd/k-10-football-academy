import { Document, Types } from 'mongoose';

export type ConversationType = 'INDIVIDUAL' | 'GROUP';

export interface IConversation {
  type?: ConversationType;
  name?: string;
  avatar?: string;
  creatorId?: Types.ObjectId;
  lastMessage?: string;
  lastMessageTime?: Date;
  lastSenderId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IConversationDocument extends IConversation, Document {}

export interface IConversationParticipant {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role?: string;
  unreadCount?: number;
  lastReadAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IConversationParticipantDocument extends IConversationParticipant, Document {}

export interface IMessage {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId?: Types.ObjectId;
  text?: string;
  imageUrl?: string;
  attachmentsJson?: string;
  isRead: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMessageDocument extends IMessage, Document {}
