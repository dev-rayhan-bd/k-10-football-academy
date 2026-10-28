import { z } from 'zod';

export const createConversationZodSchema = z.object({
  body: z
    .object({
      type: z.enum(['INDIVIDUAL', 'GROUP']).optional().default('INDIVIDUAL'),
      participantId: z.string().optional(),
      participantIds: z
        .union([z.array(z.string()), z.string()])
        .optional()
        .transform((val) => {
          if (!val) return undefined;
          if (Array.isArray(val)) return val;
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed.startsWith('[')) {
              try {
                return JSON.parse(trimmed) as string[];
              } catch {
                return trimmed
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
              }
            }
            return trimmed
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          }
          return undefined;
        }),
      name: z.string().optional(),
      avatar: z.string().optional(),
    })
    .refine(
      (data) =>
        data.participantId ||
        (Array.isArray(data.participantIds) && data.participantIds.length > 0),
      {
        message: 'participantId or participantIds array is required',
      },
    ),
});

export const getConversationsZodSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const sendMessageZodSchema = z.object({
  body: z
    .object({
      conversationId: z.string().optional(),
      receiverId: z.string().optional(),
      participantId: z.string().optional(),
      text: z.string().optional(),
      imageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
      attachmentsJson: z.string().optional(),
    })
    .refine((data) => data.conversationId || data.receiverId || data.participantId, {
      message: 'Either conversationId or receiverId (target user ID) must be provided',
    })
    .refine((data) => data.text || data.imageUrl || data.attachmentsJson, {
      message: 'Message must contain text, an image URL, or attachments',
    }),
});

export const markReadZodSchema = z.object({
  params: z.object({
    conversationId: z.string().min(1, 'Conversation ID is required'),
  }),
});

export const getContactsZodSchema = z.object({
  query: z.object({
    role: z.string().optional(),
    search: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});
