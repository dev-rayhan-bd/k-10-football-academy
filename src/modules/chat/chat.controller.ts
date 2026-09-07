import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { chatService } from './chat.service';

export const startConversation = catchAsync(async (req: Request, res: Response) => {
  const currentUserId = (req as any).user?.id || req.body.userId;
  const result = await chatService.getOrCreateConversation(currentUserId, req.body.participantId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Conversation retrieved or created',
    data: result,
  });
});

export const getConversations = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || req.params.userId;
  const result = await chatService.getUserConversations(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Conversations fetched successfully',
    data: result,
  });
});

export const sendMessage = catchAsync(async (req: Request, res: Response) => {
  const senderId = (req as any).user?.id || req.body.senderId;
  const result = await chatService.sendMessage(senderId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Message sent successfully',
    data: result,
  });
});

export const getMessages = catchAsync(async (req: Request, res: Response) => {
  const result = await chatService.getMessages(req.params.conversationId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Messages fetched successfully',
    data: result,
  });
});
