import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import { createConversationZodSchema, sendMessageZodSchema } from './chat.validation';
import { startConversation, getConversations, sendMessage, getMessages } from './chat.controller';

const router = Router();

router.post(
  '/conversations',
  auth(),
  validateRequest(createConversationZodSchema),
  startConversation,
);
router.get('/conversations', auth(), getConversations);

router.post('/messages', auth(), validateRequest(sendMessageZodSchema), sendMessage);
router.get('/messages/:conversationId', auth(), getMessages);

export const ChatRoutes = router;
