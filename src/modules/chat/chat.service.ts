import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import { Conversation, ConversationParticipant, Message } from './chat.model';
import { UserModel } from '@/modules/user/user.model';
import { uploadToStorage } from '@/utils/fileUpload.utils';

import { emitToUser, isUserOnline } from '@/socket';

/**
 * Emit an event once to every participant's personal room (`user:<id>`).
 * Every connected socket joins its user room, so this reaches all devices exactly once.
 * (Emitting to the conversation room as well would deliver duplicates.)
 */
const emitToParticipants = async (
  conversationId: string | Types.ObjectId,
  event: string,
  payload: unknown,
  excludeUserId?: string,
) => {
  const participants = await ConversationParticipant.find({ conversationId }).select('userId');
  participants.forEach((p) => {
    const pid = p.userId.toString();
    if (excludeUserId && pid === excludeUserId.toString()) return;
    emitToUser(pid, event, payload);
  });
};

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

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

    // Only look inside my 1-on-1 conversations. (Matching any shared conversation could pick a
    // group the two users share, miss the real 1-on-1 and create a duplicate.)
    const myParticipants = await ConversationParticipant.find({ userId: currentUserId }).select(
      'conversationId',
    );
    const myIndividualConvIds = (
      await Conversation.find({
        _id: { $in: myParticipants.map((p) => p.conversationId) },
        type: { $ne: 'GROUP' },
      }).select('_id')
    ).map((c) => c._id);

    const match = await ConversationParticipant.findOne({
      conversationId: { $in: myIndividualConvIds },
      userId: targetUserId,
    });

    let conversation = match ? await Conversation.findById(match.conversationId) : null;

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

    const myParticipants = await ConversationParticipant.find({ userId })
      .select('conversationId lastReadAt markedUnread')
      .lean();
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

    // Unread count per conversation FOR THIS USER: messages from others after my lastReadAt.
    // Conversations read before lastReadAt existed fall back to the message isRead flag.
    const markedUnreadSet = new Set(
      myParticipants.filter((p) => p.markedUnread).map((p) => p.conversationId.toString()),
    );
    const unreadAgg = await Message.aggregate([
      {
        $match: {
          senderId: { $ne: new Types.ObjectId(userId) },
          $or: myParticipants.map((p) =>
            p.lastReadAt
              ? { conversationId: p.conversationId, createdAt: { $gt: p.lastReadAt } }
              : { conversationId: p.conversationId, isRead: false },
          ),
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
        lastSenderId: conv.lastSenderId || null,
        time: formatRelativeTime(conv.lastMessageTime || conv.updatedAt),
        unreadCount,
        markedUnread: markedUnreadSet.has(conv._id.toString()),
        isUnread: unreadCount > 0 || markedUnreadSet.has(conv._id.toString()),
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

    // Socket messages bypass the REST Zod schema, so validate the uploaded link here too
    if (imageUrl && !isHttpUrl(imageUrl)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'imageUrl must be the http(s) URL returned by POST /chats/upload-attachment',
      );
    }
    if (attachmentsJson) {
      try {
        JSON.parse(attachmentsJson);
      } catch {
        throw new AppError(StatusCodes.BAD_REQUEST, 'attachmentsJson must be a valid JSON string');
      }
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

    const sentAt = message.createdAt || new Date();
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: previewText,
      lastMessageTime: sentAt,
      lastSenderId: new Types.ObjectId(senderId),
    });

    // The sender has obviously seen the conversation up to their own message
    await ConversationParticipant.updateOne(
      { conversationId, userId: senderId },
      { $set: { lastReadAt: sentAt, markedUnread: false } },
    );

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

    // Real-time events: exactly once per participant via their personal room (all their devices).
    const allParticipants = await ConversationParticipant.find({ conversationId }).select('userId');
    allParticipants.forEach((p) => {
      const isSender = p.userId.toString() === senderId.toString();
      emitToUser(p.userId.toString(), 'new_message', formattedMessage);
      emitToUser(p.userId.toString(), 'conversation_updated', {
        conversationId,
        lastMessage: previewText,
        lastMessageTime: sentAt,
        lastSenderId: senderId,
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

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    const skip = (safePage - 1) * safeLimit;

    // Page 1 = the NEWEST messages. Older history is loaded with page 2, 3, ...
    // Each page is returned oldest -> newest so it can be rendered top to bottom.
    const [total, newestFirst] = await Promise.all([
      Message.countDocuments({ conversationId }),
      Message.find({ conversationId })
        .populate('senderId', '_id name fullName email role avatar')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
    ]);
    const messages = newestFirst.reverse();

    // Opening the latest page means the user has read the conversation
    const markedReadNow = safePage === 1;
    if (markedReadNow) {
      await this.markMessagesAsRead(conversationId, currentUserId);
    }

    const data = messages.map((msg: any) => {
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
        isRead: !isMe && markedReadNow ? true : msg.isRead,
        isMe,
        time: new Date(msg.createdAt || Date.now()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        createdAt: msg.createdAt,
      };
    });

    return {
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
        hasMore: skip + messages.length < total,
      },
      data,
    };
  }

  /**
   * Explicitly mark messages in a conversation as read
   */
  async markMessagesAsRead(conversationId: string, currentUserId: string) {
    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid conversation ID is required');
    }

    const participant = await ConversationParticipant.findOne({
      conversationId,
      userId: currentUserId,
    });
    if (!participant) {
      throw new AppError(StatusCodes.FORBIDDEN, 'You are not a participant in this conversation');
    }

    const readAt = new Date();
    const result = await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: new Types.ObjectId(currentUserId) },
        isRead: false,
      },
      { $set: { isRead: true } },
    );

    // Per-user read position + clear a manual "mark as unread"
    participant.lastReadAt = readAt;
    participant.markedUnread = false;
    await participant.save();

    // Read receipt to every participant (sender sees ticks, reader's other devices clear the badge)
    await emitToParticipants(conversationId, 'messages_read', {
      conversationId,
      readerId: currentUserId,
      readAt,
      modifiedCount: result.modifiedCount,
    });

    return {
      success: true,
      conversationId,
      modifiedCount: result.modifiedCount,
      unreadCount: 0,
      markedUnread: false,
    };
  }

  /**
   * Mark a conversation as unread for the current user only (like "Mark as unread" in WhatsApp).
   * Does not touch message read receipts seen by the other participants.
   */
  async markConversationAsUnread(conversationId: string, currentUserId: string) {
    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid conversation ID is required');
    }

    const participant = await ConversationParticipant.findOne({
      conversationId,
      userId: currentUserId,
    });
    if (!participant) {
      throw new AppError(StatusCodes.FORBIDDEN, 'You are not a participant in this conversation');
    }

    participant.markedUnread = true;
    await participant.save();

    // Sync the badge across this user's own devices
    emitToUser(currentUserId.toString(), 'conversation_unread', {
      conversationId,
      markedUnread: true,
    });

    return { success: true, conversationId, markedUnread: true, isUnread: true };
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
