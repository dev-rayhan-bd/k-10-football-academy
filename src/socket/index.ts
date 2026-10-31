import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { UserModel } from '@/modules/user/user.model';
import { logger } from '@/utils/logger';
import { chatService } from '@/modules/chat/chat.service';
import { ConversationParticipant } from '@/modules/chat/chat.model';

let io: SocketIOServer | null = null;

const onlineUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

export const initSocket = (server: HttpServer): SocketIOServer => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Allow all origins or configure with allowed origins
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Authentication Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const queryToken =
        typeof socket.handshake.query?.token === 'string'
          ? socket.handshake.query.token
          : undefined;

      const authHeader =
        socket.handshake.auth?.token || socket.handshake.headers?.authorization || queryToken;

      if (!authHeader) {
        return next(new Error('Authentication token required'));
      }

      const rawToken = String(authHeader).trim();
      const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken;

      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as { userId: string };
      if (!decoded || !decoded.userId) {
        return next(new Error('Invalid token payload'));
      }

      const user = await UserModel.findById(decoded.userId).select(
        '_id name fullName email role status avatar currentClub',
      );

      if (!user) {
        return next(new Error('User associated with token not found'));
      }

      if (user.status === 'BLOCKED') {
        return next(new Error('User account is suspended'));
      }

      socket.data.user = {
        _id: user._id.toString(),
        userId: user._id.toString(),
        name: user.name || (user as any).fullName || 'User',
        fullName: (user as any).fullName || user.name || 'User',
        role: user.role,
        email: user.email,
        avatar: user.avatar || '',
        currentClub: user.currentClub || '',
      };

      next();
    } catch (err: any) {
      logger.warn(`Socket authentication error: ${err.message}`);
      next(new Error(`Authentication failed: ${err.message}`));
    }
  });

  // Connection Handler
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    const userId = user.userId;

    // Track user socket ID
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Join personal user room for direct user notifications & conversation updates
    socket.join(`user:${userId}`);

    logger.info(
      `🔌 Socket connected: ${user.name} (${user.role}) [User: ${userId}, Socket: ${socket.id}]`,
    );

    // Broadcast online status to interested listeners
    io?.emit('user_online', { userId, status: 'online' });

    const parseSocketPayload = (data: any): any => {
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch {
          return { conversationId: data };
        }
      }
      return data || {};
    };

    // 1. Start or Retrieve Conversation (1-on-1 or Group) via Socket
    const handleStartConversation = async (raw: any, callback?: (res: any) => void) => {
      try {
        const data = parseSocketPayload(raw);
        const conversation = await chatService.getOrCreateConversation(userId, data);
        const convId = conversation.id || (conversation as any)._id?.toString();

        if (convId) {
          socket.join(`conversation:${convId}`);
        }

        socket.emit('conversation_started', { success: true, data: conversation });
        callback?.({ success: true, data: conversation });
      } catch (err: any) {
        logger.error(`❌ Socket start_conversation error for user ${userId}: ${err.message}`);
        socket.emit('chat_error', { event: 'start_conversation', message: err.message });
        callback?.({ success: false, message: err.message });
      }
    };

    socket.on('start_conversation', handleStartConversation);
    socket.on('create_conversation', handleStartConversation);

    // 2. Join Conversation Room
    socket.on('join_conversation', async (raw: any, callback?: (res: any) => void) => {
      try {
        const data = parseSocketPayload(raw);
        const conversationId = data.conversationId || data.conversation_id || data.conversationID;
        if (!conversationId) {
          callback?.({ success: false, message: 'conversationId required' });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        logger.info(`User ${userId} joined room conversation:${conversationId}`);

        // Emit confirmation event to the socket client
        socket.emit('joined_conversation', {
          conversationId,
          success: true,
          message: `Successfully joined room conversation:${conversationId}`,
        });

        callback?.({ success: true, conversationId });
      } catch (err: any) {
        callback?.({ success: false, message: err.message });
      }
    });

    // 3. Leave Conversation Room
    socket.on('leave_conversation', (raw: any) => {
      const data = parseSocketPayload(raw);
      const conversationId = data.conversationId || data.conversation_id || data.conversationID;
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
        logger.debug(`User ${userId} left room conversation:${conversationId}`);
      }
    });

    // 4. Send Message via Socket
    socket.on('send_message', async (raw: any, callback?: (res: any) => void) => {
      try {
        const data = parseSocketPayload(raw);
        const message = await chatService.sendMessage(userId, data);
        if (message.conversationId) {
          socket.join(`conversation:${message.conversationId}`);
        }
        socket.emit('message_sent', { success: true, data: message });
        callback?.({ success: true, data: message });
      } catch (err: any) {
        logger.error(`❌ Socket send_message error for user ${userId}: ${err.message}`);
        socket.emit('chat_error', { event: 'send_message', message: err.message });
        callback?.({ success: false, message: err.message });
      }
    });

    // 4. Real-time Typing Indicator
    socket.on('typing', async (raw: any) => {
      const data = parseSocketPayload(raw);
      const conversationId = data.conversationId || data.conversation_id || data.conversationID;
      if (conversationId) {
        const typingPayload = {
          conversationId,
          user: {
            _id: user._id,
            name: user.name,
            role: user.role,
            avatar: user.avatar,
          },
        };

        logger.info(`⌨️  User typing in ${conversationId}: ${user.name}`);

        // Always emit to calling socket so single-client testing (Postman) receives live event
        socket.emit('user_typing', typingPayload);

        // Broadcast to conversation room
        io?.to(`conversation:${conversationId}`).emit('user_typing', typingPayload);

        // Also emit directly to other participant's personal room
        const otherParticipant = await ConversationParticipant.findOne({
          conversationId,
          userId: { $ne: user._id },
        });

        if (otherParticipant) {
          emitToUser(otherParticipant.userId.toString(), 'user_typing', typingPayload);
        }
      }
    });

    socket.on('stop_typing', async (raw: any) => {
      const data = parseSocketPayload(raw);
      const conversationId = data.conversationId || data.conversation_id || data.conversationID;
      if (conversationId) {
        const stopPayload = {
          conversationId,
          userId: user._id,
        };

        socket.emit('user_stop_typing', stopPayload);

        io?.to(`conversation:${conversationId}`).emit('user_stop_typing', stopPayload);

        const otherParticipant = await ConversationParticipant.findOne({
          conversationId,
          userId: { $ne: user._id },
        });

        if (otherParticipant) {
          emitToUser(otherParticipant.userId.toString(), 'user_stop_typing', stopPayload);
        }
      }
    });

    // 5. Mark Messages As Read
    const handleMarkAsRead = async (raw: any, callback?: (res: any) => void) => {
      try {
        const data = parseSocketPayload(raw);
        const conversationId = data.conversationId || data.conversation_id || data.conversationID;
        if (conversationId) {
          const res = await chatService.markMessagesAsRead(conversationId, userId);
          callback?.({
            success: true,
            conversationId,
            modifiedCount: res.modifiedCount,
          });
        }
      } catch (err: any) {
        callback?.({ success: false, message: err.message });
      }
    };

    socket.on('mark_as_read', handleMarkAsRead);
    socket.on('mark_read', handleMarkAsRead);
    socket.on('read_message', handleMarkAsRead);

    // Disconnect
    socket.on('disconnect', () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io?.emit('user_offline', { userId, status: 'offline' });
        }
      }
      logger.info(`🔌 Socket disconnected: ${user.name} [User: ${userId}, Socket: ${socket.id}]`);
    });
  });

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet. Call initSocket first.');
  }
  return io;
};

export const emitToUser = (userId: string, event: string, data: any): void => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

export const emitToConversation = (conversationId: string, event: string, data: any): void => {
  if (io) {
    io.to(`conversation:${conversationId}`).emit(event, data);
  }
};

export const isUserOnline = (userId: string): boolean => {
  const sockets = onlineUsers.get(userId);
  return Boolean(sockets && sockets.size > 0);
};

export const getOnlineUserIds = (): string[] => {
  return Array.from(onlineUsers.keys());
};
