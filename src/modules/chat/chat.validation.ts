import { z } from 'zod';

export const createConversationZodSchema = z.object({
  body: z.object({
    participantId: z.string().min(1, 'Target participant ID is required'),
  }),
});

export const sendMessageZodSchema = z.object({
  body: z.object({
    conversationId: z.string().min(1),
    text: z.string().optional(),
    attachmentsJson: z.string().optional(),
  }),
});
