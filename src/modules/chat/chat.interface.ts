import { Document, Types } from 'mongoose';

export interface IConversation {
  lastMessage?: string;
  lastMessageTime?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IConversationDocument extends IConversation, Document {}

export interface IConversationParticipant {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role?: string;
}

export interface IConversationParticipantDocument extends IConversationParticipant, Document {}

export interface IMessage {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId?: Types.ObjectId;
  text?: string;
  attachmentsJson?: string;
  isRead: boolean;
  createdAt?: Date;
}

export interface IMessageDocument extends IMessage, Document {}
