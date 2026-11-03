import { z } from 'zod';

export const policyTypeEnum = z.enum([
  'TERMS_AND_CONDITIONS',
  'PRIVACY_POLICY',
  'MEDIA_CONSENT',
  'COOKIE_POLICY',
]);

// Single canonical validation schema for Save/Publish policy
export const savePolicyZodSchema = z.object({
  body: z.object({
    type: policyTypeEnum.default('TERMS_AND_CONDITIONS'),
    title: z.string().min(3, 'Title must be at least 3 characters').optional(),
    content: z.string().min(10, 'Content must be at least 10 characters'),
    version: z.string().optional(),
    isMajorUpdate: z.boolean().optional().default(false),
    isPublished: z.boolean().optional().default(true),
    effectiveDate: z.string().optional(),
    summaryOfChanges: z.string().optional(),
  }),
});
