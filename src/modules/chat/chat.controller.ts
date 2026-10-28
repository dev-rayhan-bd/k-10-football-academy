import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { chatService } from './chat.service';
import { AppError } from '@/utils/AppError';

export const startConversation = catchAsync(async (req: Request, res: Response) => {
  const currentUserId = (req as any).user?.userId || (req as any).user?.id || req.body.userId;

  let avatarUrl = req.body.avatar;
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    const avatarFile =
      (req.files as any[]).find((f: any) => f.fieldname === 'avatar') || req.files[0];
    const uploaded = await chatService.uploadAttachment(avatarFile);
    avatarUrl = uploaded.url;
  } else if ((req as any).file) {
    const uploaded = await chatService.uploadAttachment((req as any).file);
    avatarUrl = uploaded.url;
  }

  const payload = {
    ...req.body,
    avatar: avatarUrl || req.body.avatar || '',
  };

  const result = await chatService.getOrCreateConversation(currentUserId, payload);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Conversation retrieved or created successfully',
    data: result,
  });
});

export const getConversations = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?.id || req.params.userId;
  const result = await chatService.getUserConversations(userId, req.query as any);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Conversations fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

export const sendMessage = catchAsync(async (req: Request, res: Response) => {
  const senderId = (req as any).user?.userId || (req as any).user?.id || req.body.senderId;

  // Support file upload directly inside sendMessage if multipart is used
  let imageUrl = req.body.imageUrl;
  if (!imageUrl && req.files && Array.isArray(req.files) && req.files.length > 0) {
    const file = req.files[0];
    const uploaded = await chatService.uploadAttachment(file);
    if (uploaded.isImage) {
      imageUrl = uploaded.url;
    }
  } else if (!imageUrl && (req as any).file) {
    const file = (req as any).file;
    const uploaded = await chatService.uploadAttachment(file);
    if (uploaded.isImage) {
      imageUrl = uploaded.url;
    }
  }

  const result = await chatService.sendMessage(senderId, {
    conversationId: req.body.conversationId,
    text: req.body.text,
    imageUrl,
    attachmentsJson: req.body.attachmentsJson,
    receiverId: req.body.receiverId,
  });

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Message sent successfully',
    data: result,
  });
});

export const getMessages = catchAsync(async (req: Request, res: Response) => {
  const currentUserId = (req as any).user?.userId || (req as any).user?.id;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 100;

  const result = await chatService.getMessages(
    req.params.conversationId,
    currentUserId,
    page,
    limit,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Messages fetched successfully',
    data: result,
  });
});

export const markMessagesAsRead = catchAsync(async (req: Request, res: Response) => {
  const currentUserId = (req as any).user?.userId || (req as any).user?.id;
  const result = await chatService.markMessagesAsRead(req.params.conversationId, currentUserId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Messages marked as read',
    data: result,
  });
});

export const uploadChatAttachment = catchAsync(async (req: Request, res: Response) => {
  let file: Express.Multer.File | undefined = undefined;

  if ((req as any).file) {
    file = (req as any).file;
  } else if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    file = req.files[0];
  }

  if (!file) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Please upload a file or image (file field)');
  }

  const result = await chatService.uploadAttachment(file);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Chat attachment uploaded to storage successfully',
    data: result,
  });
});

export const getContacts = catchAsync(async (req: Request, res: Response) => {
  const currentUserId = (req as any).user?.userId || (req as any).user?.id;
  const result = await chatService.getContacts(currentUserId, req.query as any);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Contacts directory fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});
