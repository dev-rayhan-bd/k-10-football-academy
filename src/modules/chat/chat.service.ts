import { AppError } from '@/utils/AppError';
import { Conversation, ConversationParticipant, Message } from './chat.model';

export class ChatService {
  async getOrCreateConversation(currentUserId: string, targetUserId: string) {
    const existingParticipants = await ConversationParticipant.find({ userId: currentUserId });
    const conversationIds = existingParticipants.map((p) => p.conversationId);

    const match = await ConversationParticipant.findOne({
      conversationId: { $in: conversationIds },
      userId: targetUserId,
    });

    if (match) {
      return Conversation.findById(match.conversationId);
    }

    const conversation = await Conversation.create({});
    await ConversationParticipant.create([
      { conversationId: conversation._id, userId: currentUserId },
      { conversationId: conversation._id, userId: targetUserId },
    ]);

    return conversation;
  }

  async getUserConversations(userId: string) {
    const participants = await ConversationParticipant.find({ userId }).populate('conversationId');
    return participants;
  }

  async sendMessage(
    senderId: string,
    payload: { conversationId: string; text?: string; attachmentsJson?: string },
  ) {
    const participant = await ConversationParticipant.findOne({
      conversationId: payload.conversationId,
      userId: senderId,
    });

    if (!participant) {
      throw new AppError(403, 'You are not a participant in this conversation');
    }

    const message = await Message.create({
      conversationId: payload.conversationId,
      senderId,
      text: payload.text,
      attachmentsJson: payload.attachmentsJson,
    });

    await Conversation.findByIdAndUpdate(payload.conversationId, {
      lastMessage: payload.text || 'Sent an attachment',
      lastMessageTime: new Date(),
    });

    return message;
  }

  async getMessages(conversationId: string) {
    return Message.find({ conversationId })
      .populate('senderId', 'name avatar')
      .sort({ createdAt: 1 });
  }
}

export const chatService = new ChatService();
