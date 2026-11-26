import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createConversationZodSchema,
  getConversationsZodSchema,
  sendMessageZodSchema,
  markReadZodSchema,
  getContactsZodSchema,
} from './chat.validation';
import {
  startConversation,
  getConversations,
  sendMessage,
  getMessages,
  markMessagesAsRead,
  markConversationAsUnread,
  uploadChatAttachment,
  getContacts,
  getConversationDetails,
  updateGroupConversation,
  deleteGroupConversation,
} from './chat.controller';
import { upload } from '@/middlewares/multer';

const router = Router();

// ==========================================
// 1. CONVERSATION MANAGEMENT
// ==========================================
router.post(
  '/conversations',
  auth(),
  upload.any() as any,
  validateRequest(createConversationZodSchema),
  startConversation,
);
router.get('/conversations', auth(), validateRequest(getConversationsZodSchema), getConversations);
// Group details + members (any member), edit name/image and delete (group admin only)
router.get('/conversations/:conversationId', auth(), getConversationDetails);
router.patch(
  '/conversations/:conversationId',
  auth(),
  upload.any() as any,
  updateGroupConversation,
);
router.delete('/conversations/:conversationId', auth(), deleteGroupConversation);

// ==========================================
// 2. CONTACTS DIRECTORY FOR NEW CHATS (+ NEW CHAT)
// ==========================================
router.get('/contacts', auth(), validateRequest(getContactsZodSchema), getContacts);

// ==========================================
// 3. ATTACHMENT UPLOAD (CLOUDINARY / AWS S3)
// ==========================================
router.post('/upload-attachment', auth(), upload.any() as any, uploadChatAttachment);

// ==========================================
// 4. REAL-TIME MESSAGING
// ==========================================
router.post(
  '/messages',
  auth(),
  upload.any() as any,
  validateRequest(sendMessageZodSchema),
  sendMessage,
);
router.get('/messages/:conversationId', auth(), getMessages);
router.patch(
  '/messages/:conversationId/read',
  auth(),
  validateRequest(markReadZodSchema),
  markMessagesAsRead,
);
router.patch(
  '/messages/:conversationId/unread',
  auth(),
  validateRequest(markReadZodSchema),
  markConversationAsUnread,
);

export const ChatRoutes = router;
