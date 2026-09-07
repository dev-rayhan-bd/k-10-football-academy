import { z } from 'zod';

export const createAgentProfileZodSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    licenseId: z.string().optional(),
    certifications: z.string().optional(),
  }),
});

export const uploadVerificationDocZodSchema = z.object({
  body: z.object({
    documentType: z.enum(['LICENSE_CERTIFICATE', 'NATIONAL_ID_PASSPORT', 'ASSOCIATION_MEMBERSHIP']),
    fileUrl: z.string().url('Must be a valid file URL'),
  }),
});

export const createSuccessStoryZodSchema = z.object({
  body: z.object({
    storyTitle: z.string().min(3),
    category: z.enum(['TRANSFER_ACHIEVEMENT', 'SIGNING_ACHIEVEMENT', 'AGENT_MILESTONE']),
    image: z.string().optional(),
  }),
});
