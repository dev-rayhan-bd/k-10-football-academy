import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import { Conversation, ConversationParticipant, Message } from './chat.model';
import { UserModel } from '@/modules/user/user.model';
import { uploadToStorage } from '@/utils/fileUpload.utils';

import { emitToConversation, emitToUser, isUserOnline } from '@/socket';

const formatRelativeTime = (date?: Date | null): string => {
  if (!date) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - new Date(date).getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(date).toLocaleDateString();
};

export class ChatService {
  /**
   * Start or retrieve an existing conversation (Individual or Group)
   */
  async getOrCreateConversation(
    currentUserId: string,
    payload:
      | string
      | {
          type?: 'INDIVIDUAL' | 'GROUP';
          participantId?: string;
          participantIds?: string[];
          name?: string;
          avatar?: string;
        },
  ) {
    const isGroup =
      typeof payload === 'object' &&
      (payload.type === 'GROUP' ||
        (Array.isArray(payload.participantIds) && payload.participantIds.length > 1));

    // ----------------------------------------------------
    // 1. GROUP CHAT CREATION
    // ----------------------------------------------------
    if (isGroup) {
      const groupData = payload as {
        name?: string;
        avatar?: string;
        participantIds?: string[];
      };

      const requestedIds = Array.isArray(groupData.participantIds)
        ? groupData.participantIds.map(String)
        : [];

      // Combine current user with other participants (deduplicated)
      const allMemberIds = Array.from(new Set([currentUserId.toString(), ...requestedIds])).filter(
        (id) => Types.ObjectId.isValid(id),
      );

      if (allMemberIds.length < 2) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'A group chat must have at least 2 participants',
        );
      }

      // Verify all participants exist in database
      const existingUsers = await UserModel.find({
        _id: { $in: allMemberIds.map((id) => new Types.ObjectId(id)) },
        status: { $ne: 'BLOCKED' },
      }).select('_id name fullName email role avatar');

      if (existingUsers.length < 2) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Not enough valid participants found for group chat',
        );
      }

      const groupName = groupData.name?.trim() || `Group Chat (${existingUsers.length} members)`;

      const conversation = await Conversation.create({
        type: 'GROUP',
        name: groupName,
        avatar: groupData.avatar || '',
        creatorId: new Types.ObjectId(currentUserId),
        lastMessage: 'Group created',
        lastMessageTime: new Date(),
      });

      const participantDocs = existingUsers.map((u) => ({
        conversationId: conversation._id,
        userId: u._id,
        role: u._id.toString() === currentUserId.toString() ? 'ADMIN' : u.role || 'MEMBER',
      }));

      await ConversationParticipant.create(participantDocs);

      // Notify all members about the newly created group chat in real-time
      existingUsers.forEach((u) => {
        emitToUser(u._id.toString(), 'conversation_updated', {
          conversationId: conversation._id.toString(),
          lastMessage: 'Group created',
          lastMessageTime: new Date(),
          type: 'GROUP',
          name: groupName,
          unreadIncrement: 0,
        });
      });

      return {
        id: conversation._id.toString(),
        _id: conversation._id,
        type: 'GROUP',
        name: groupName,
        avatar: conversation.avatar || '',
        user: {
          id: conversation._id.toString(),
          _id: conversation._id,
          name: groupName,
          fullName: groupName,
          role: 'GROUP',
          avatar: conversation.avatar || '',
        },
        participants: existingUsers.map((u: any) => ({
          _id: u._id,
          id: u._id.toString(),
          name: u.name || u.fullName || 'User',
          role: u.role || 'MEMBER',
          avatar: u.avatar || '',
        })),
        lastMessage: conversation.lastMessage || 'Group created',
        lastMessageTime: conversation.lastMessageTime,
        time: formatRelativeTime(conversation.lastMessageTime),
        unreadCount: 0,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      };
    }

    // ----------------------------------------------------
    // 2. INDIVIDUAL (1-ON-1) CHAT
    // ----------------------------------------------------
    const targetUserId =
      typeof payload === 'string' ? payload : payload.participantId || payload.participantIds?.[0];

    if (!targetUserId || !Types.ObjectId.isValid(targetUserId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid target participant ID is required');
    }

    if (currentUserId.toString() === targetUserId.toString()) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot start a conversation with yourself');
    }

    const targetUser = await UserModel.findById(targetUserId).select(
      '_id name fullName email role avatar currentClub status',
    );
    if (!targetUser) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Target user profile not found');
    }

    // Find all individual conversations where current user is a participant
    const myParticipants = await ConversationParticipant.find({ userId: currentUserId });
    const myConversationIds = myParticipants.map((p) => p.conversationId);

    // Look for a 1-on-1 conversation that also includes targetUserId
    const match = await ConversationParticipant.findOne({
      conversationId: { $in: myConversationIds },
      userId: targetUserId,
    });

    let conversation;
    if (match) {
      conversation = await Conversation.findOne({
        _id: match.conversationId,
        type: { $ne: 'GROUP' },
      });
    }

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'INDIVIDUAL',
        lastMessage: '',
        lastMessageTime: new Date(),
      });

      await ConversationParticipant.create([
        {
          conversationId: conversation._id,
          userId: new Types.ObjectId(currentUserId),
        },
        {
          conversationId: conversation._id,
          userId: new Types.ObjectId(targetUserId),
          role: targetUser.role,
        },
      ]);
    }

    return {
      id: conversation._id.toString(),
      _id: conversation._id,
      type: 'INDIVIDUAL',
      user: {
        _id: targetUser._id,
        id: targetUser._id.toString(),
        name: targetUser.name || (targetUser as any).fullName || 'User',
        fullName: (targetUser as any).fullName || targetUser.name || 'User',
        role: targetUser.role,
        avatar: targetUser.avatar || '',
        email: targetUser.email,
        currentClub: targetUser.currentClub || '',
        isOnline: isUserOnline(targetUserId),
      },
      lastMessage: conversation.lastMessage || '',
      lastMessageTime: conversation.lastMessageTime,
      time: formatRelativeTime(conversation.lastMessageTime),
      unreadCount: 0,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * Get all conversations for current user with search & pagination
   */
  async getUserConversations(
    userId: string,
    query: { search?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const myParticipants = await ConversationParticipant.find({ userId }).select('conversationId');
    if (!myParticipants.length) {
      return {
        meta: { page, limit, total: 0, totalPages: 1 },
        data: [],
      };
    }

    const convIds = myParticipants.map((p) => p.conversationId);

    // Find all conversations
    const conversations = await Conversation.find({ _id: { $in: convIds } })
      .sort({ lastMessageTime: -1, updatedAt: -1 })
      .lean();

    // Find all other participants for these conversations to resolve display profiles
    const allParticipants = await ConversationParticipant.find({
      conversationId: { $in: convIds },
      userId: { $ne: new Types.ObjectId(userId) },
    })
      .populate('userId', '_id name fullName email role avatar currentClub status')
      .lean();

    const participantMap = new Map<string, any[]>();
    allParticipants.forEach((p) => {
      const key = p.conversationId.toString();
      if (!participantMap.has(key)) participantMap.set(key, []);
      if (p.userId) participantMap.get(key)!.push(p.userId);
    });

    // Compute unread message count for current user per conversation
    const unreadAgg = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: convIds },
          senderId: { $ne: new Types.ObjectId(userId) },
          isRead: false,
        },
      },
      {
        $group: {
          _id: '$conversationId',
          count: { $sum: 1 },
        },
      },
    ]);

    const unreadMap = new Map<string, number>();
    unreadAgg.forEach((u) => {
      unreadMap.set(u._id.toString(), u.count);
    });

    let formattedList = conversations.map((conv: any) => {
      const isGroup = conv.type === 'GROUP';
      const otherMembers = participantMap.get(conv._id.toString()) || [];
      const primaryUser = otherMembers[0] || null;
      const primaryUserId = primaryUser?._id ? primaryUser._id.toString() : '';
      const unreadCount = unreadMap.get(conv._id.toString()) || 0;

      const displayName = isGroup
        ? conv.name || 'Group Chat'
        : primaryUser?.name || primaryUser?.fullName || 'User';

      const displayAvatar = isGroup ? conv.avatar || '' : primaryUser?.avatar || '';

      const displayRole = isGroup ? 'GROUP' : primaryUser?.role || 'USER';

      return {
        id: conv._id.toString(),
        _id: conv._id,
        type: conv.type || 'INDIVIDUAL',
        name: isGroup ? conv.name : undefined,
        user: {
          _id: isGroup ? conv._id : primaryUser?._id || null,
          id: isGroup ? conv._id.toString() : primaryUserId,
          name: displayName,
          fullName: displayName,
          role: displayRole,
          avatar: displayAvatar,
          email: isGroup ? '' : primaryUser?.email || '',
          currentClub: isGroup ? '' : primaryUser?.currentClub || '',
          isOnline: isGroup ? false : isUserOnline(primaryUserId),
        },
        participants: isGroup
          ? otherMembers.map((m: any) => ({
              _id: m._id,
              name: m.name || m.fullName || 'User',
              role: m.role || 'MEMBER',
              avatar: m.avatar || '',
            }))
          : undefined,
        lastMessage: conv.lastMessage || '',
        lastMessageTime: conv.lastMessageTime || conv.updatedAt,
        time: formatRelativeTime(conv.lastMessageTime || conv.updatedAt),
        unreadCount,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    });

    // Handle search filter across contact name, email, group name, last message
    if (query.search && typeof query.search === 'string') {
      const term = query.search.trim().toLowerCase();
      formattedList = formattedList.filter((item) => {
        const uName = (item.user.name || '').toLowerCase();
        const uEmail = (item.user.email || '').toLowerCase();
        const lastMsg = (item.lastMessage || '').toLowerCase();
        const gName = (item.name || '').toLowerCase();
        return (
          uName.includes(term) ||
          uEmail.includes(term) ||
          lastMsg.includes(term) ||
          gName.includes(term)
        );
      });
    }

    const total = formattedList.length;
    const paginated = formattedList.slice(skip, skip + limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data: paginated,
    };
  }

  /**
   * Send a message (creates in DB, updates conversation, emits via Socket.io)
   */
  async sendMessage(
    senderId: string,
    payload: {
      conversationId?: string;
      receiverId?: string;
      participantId?: string;
      text?: string;
      imageUrl?: string;
      attachmentsJson?: string;
    },
  ) {
    const { text, imageUrl, attachmentsJson } = payload;
    let conversationId = payload.conversationId;

    // If conversationId is not provided, auto-create or retrieve conversation using receiverId
    const targetUserId = payload.receiverId || payload.participantId;
    if (!conversationId && targetUserId) {
      if (Types.ObjectId.isValid(targetUserId)) {
        const convExists = await Conversation.findById(targetUserId);
        if (convExists) {
          conversationId = convExists._id.toString();
        } else {
          const conv = await this.getOrCreateConversation(senderId, targetUserId);
          conversationId = conv.id;
        }
      } else {
        const conv = await this.getOrCreateConversation(senderId, targetUserId);
        conversationId = conv.id;
      }
    }

    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Valid conversationId (or receiverId) is required to send a message',
      );
    }

    if (!text && !imageUrl && !attachmentsJson) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Message must contain text, an image URL, or attachments',
      );
    }

    // Check that sender is a participant
    const isParticipant = await ConversationParticipant.findOne({
      conversationId,
      userId: senderId,
    });

    if (!isParticipant) {
      throw new AppError(StatusCodes.FORBIDDEN, 'You are not a participant in this conversation');
    }

    // Determine receiverId if not provided (relevant for 1-on-1 chats)
    let receiverId = payload.receiverId;
    if (receiverId && receiverId.toString() === conversationId.toString()) {
      receiverId = undefined;
    }
    if (!receiverId || !Types.ObjectId.isValid(receiverId)) {
      const otherParticipant = await ConversationParticipant.findOne({
        conversationId,
        userId: { $ne: senderId },
      });
      if (otherParticipant) {
        receiverId = otherParticipant.userId.toString();
      }
    }

    const message = await Message.create({
      conversationId,
      senderId,
      receiverId: receiverId ? new Types.ObjectId(receiverId) : undefined,
      text: text || '',
      imageUrl: imageUrl || undefined,
      attachmentsJson: attachmentsJson || undefined,
      isRead: false,
    });

    // Populate sender details
    await message.populate('senderId', '_id name fullName email role avatar');

    const previewText =
      text && text.trim() !== ''
        ? text.trim()
        : imageUrl
          ? '📷 Sent an image'
          : '📎 Sent an attachment';

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: previewText,
      lastMessageTime: new Date(),
      lastSenderId: new Types.ObjectId(senderId),
    });

    const senderObj = message.senderId as any;
    const formattedMessage = {
      id: message._id.toString(),
      _id: message._id,
      conversationId: message.conversationId,
      senderId: senderObj?._id || senderId,
      sender: {
        _id: senderObj?._id || senderId,
        name: senderObj?.name || senderObj?.fullName || 'User',
        role: senderObj?.role || 'USER',
        avatar: senderObj?.avatar || '',
      },
      receiverId: message.receiverId,
      text: message.text || '',
      imageUrl: message.imageUrl || null,
      attachmentsJson: message.attachmentsJson || null,
      isRead: message.isRead,
      isMe: false, // will be evaluated on client
      time: new Date(message.createdAt || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      createdAt: message.createdAt,
    };

    // Emit Real-Time Socket Events

    // 1. Emit new_message to all participants in this conversation room
    emitToConversation(conversationId.toString(), 'new_message', formattedMessage);

    // 2. Emit new_message and conversation_updated directly to ALL participants (works for 1-on-1 and Group chats)
    const allParticipants = await ConversationParticipant.find({ conversationId });
    allParticipants.forEach((p) => {
      const isSender = p.userId.toString() === senderId.toString();
      emitToUser(p.userId.toString(), 'new_message', formattedMessage);
      emitToUser(p.userId.toString(), 'conversation_updated', {
        conversationId,
        lastMessage: previewText,
        lastMessageTime: new Date(),
        senderId,
        senderName: senderObj?.name || senderObj?.fullName || 'User',
        senderAvatar: senderObj?.avatar || '',
        unreadIncrement: isSender ? 0 : 1,
      });
    });

    return formattedMessage;
  }

  /**
   * Get messages for a conversation and mark pending incoming messages as read
   */
  async getMessages(conversationId: string, currentUserId: string, page = 1, limit = 100) {
    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid conversation ID is required');
    }

    const isParticipant = await ConversationParticipant.findOne({
      conversationId,
      userId: currentUserId,
    });

    if (!isParticipant) {
      throw new AppError(StatusCodes.FORBIDDEN, 'You are not a participant in this conversation');
    }

    const skip = (Math.max(1, page) - 1) * limit;

    const messages = await Message.find({ conversationId })
      .populate('senderId', '_id name fullName email role avatar')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Automatically mark all unread messages sent by the other party as read
    const unreadMessageIds = messages
      .filter((m: any) => {
        const sId = m.senderId?._id?.toString() || m.senderId?.toString();
        return sId !== currentUserId.toString() && !m.isRead;
      })
      .map((m: any) => m._id);

    if (unreadMessageIds.length > 0) {
      await Message.updateMany({ _id: { $in: unreadMessageIds } }, { $set: { isRead: true } });

      emitToConversation(conversationId, 'messages_read', {
        conversationId,
        readerId: currentUserId,
        messageIds: unreadMessageIds,
      });
    }

    return messages.map((msg: any) => {
      const s = msg.senderId || {};
      const sId = s._id ? s._id.toString() : (msg.senderId || '').toString();
      const isMe = sId === currentUserId.toString();

      return {
        id: msg._id.toString(),
        _id: msg._id,
        conversationId: msg.conversationId,
        senderId: sId,
        sender: {
          _id: s._id || sId,
          name: s.name || s.fullName || 'User',
          role: s.role || 'USER',
          avatar: s.avatar || '',
        },
        receiverId: msg.receiverId,
        text: msg.text || '',
        imageUrl: msg.imageUrl || null,
        attachmentsJson: msg.attachmentsJson || null,
        isRead: unreadMessageIds.some((id) => id.toString() === msg._id.toString())
          ? true
          : msg.isRead,
        isMe,
        time: new Date(msg.createdAt || Date.now()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        createdAt: msg.createdAt,
      };
    });
  }

  /**
   * Explicitly mark messages in a conversation as read
   */
  async markMessagesAsRead(conversationId: string, currentUserId: string) {
    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid conversation ID is required');
    }

    const result = await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: new Types.ObjectId(currentUserId) },
        isRead: false,
      },
      {
        $set: { isRead: true },
      },
    );

    const participants = await ConversationParticipant.find({ conversationId });

    const readPayload = {
      conversationId,
      readerId: currentUserId,
      modifiedCount: result.modifiedCount,
    };

    emitToConversation(conversationId, 'messages_read', readPayload);

    // Also emit directly to every participant's personal room so both sender and receiver get real-time read receipt
    participants.forEach((p) => {
      emitToUser(p.userId.toString(), 'messages_read', readPayload);
    });

    return {
      success: true,
      modifiedCount: result.modifiedCount,
    };
  }

  /**
   * Upload chat attachment directly to Cloudinary or AWS S3 and return public URL
   */
  async uploadAttachment(file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'No attachment file provided');
    }

    const isImage = file.mimetype.startsWith('image/');
    const folder = isImage ? 'chat_images' : 'chat_documents';

    const url = await uploadToStorage(file, folder);

    return {
      url,
      fileName: file.originalname || 'attachment',
      fileType: file.mimetype,
      fileSize: file.size,
      isImage,
    };
  }

  /**
   * Get contact directory for starting new chats (+ NEW CHAT)
   * Supports filtering by role (PARENTS, AGENTS, CLUBS, ACADEMIES, COACHES)
   */
  async getContacts(
    currentUserId: string,
    query: { role?: string; search?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {
      _id: { $ne: new Types.ObjectId(currentUserId) },
      status: 'ACTIVE',
    };

    // Role normalization
    if (query.role && typeof query.role === 'string' && query.role.toUpperCase() !== 'ALL') {
      const r = query.role.toUpperCase().trim();
      if (r === 'PARENTS' || r === 'PARENT') {
        filter.role = { $in: ['PARENT', 'GUARDIAN'] };
      } else if (r === 'AGENTS' || r === 'AGENT') {
        filter.role = { $in: ['AGENT', 'SCOUT'] };
      } else if (r === 'CLUBS' || r === 'CLUB') {
        filter.role = 'CLUB';
      } else if (r === 'ACADEMIES' || r === 'ACADEMY') {
        filter.role = 'ACADEMY';
      } else if (r === 'COACHES' || r === 'COACH') {
        filter.role = 'COACH';
      } else {
        filter.role = r;
      }
    }

    if (query.search && typeof query.search === 'string') {
      const term = query.search.trim();
      const regex = new RegExp(term, 'i');
      filter.$or = [
        { name: regex },
        { fullName: regex },
        { email: regex },
        { currentClub: regex },
        { clubName: regex },
        { agencyName: regex },
        { academyName: regex },
      ];
    }

    const [contacts, total] = await Promise.all([
      UserModel.find(filter)
        .select('_id name fullName email role avatar currentClub clubName agencyName academyName')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter),
    ]);

    const formattedContacts = contacts.map((c: any) => ({
      _id: c._id,
      id: c._id.toString(),
      name: c.name || c.fullName || 'User',
      fullName: c.fullName || c.name || 'User',
      role: c.role,
      avatar: c.avatar || '',
      email: c.email || '',
      club: c.currentClub || c.clubName || c.academyName || c.agencyName || '',
      isOnline: isUserOnline(c._id.toString()),
    }));

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data: formattedContacts,
    };
  }
}

export const chatService = new ChatService();
