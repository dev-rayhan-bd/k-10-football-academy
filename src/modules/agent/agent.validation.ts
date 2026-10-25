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
    fileUrl: z.string().url('Must be a valid file URL').optional(),
  }),
});

export const StoryCategoryZodEnum = z.enum([
  'Transfer Achievement',
  'Signing Achievement',
  'Agent Milestone',
  'Academy Milestone',
  'TRANSFER_ACHIEVEMENT',
  'SIGNING_ACHIEVEMENT',
  'AGENT_MILESTONE',
  'ACADEMY_MILESTONE',
]);

export const SignedClubAchievementZodEnum = z.enum([
  'Benfica Academy - Trial Secured',
  'Chelsea Youth - Contract Signed',
]);

export const createSuccessStoryZodSchema = z.object({
  body: z.object({
    storyTitle: z.string().optional(),
    title: z.string().optional(),
    category: z.union([StoryCategoryZodEnum, z.string()]).optional(),
    playerName: z.string().optional(),
    position: z.string().optional(),
    previousAcademy: z.string().optional(),
    date: z.union([z.string(), z.date()]).optional(),
    signedClub: z.union([SignedClubAchievementZodEnum, z.string()]).optional(),
    achievement: z.string().optional(),
    storyContent: z.string().optional(),
    content: z.string().optional(),
    image: z.string().optional(),
    photo: z.string().optional(),
    coverImage: z.string().optional(),
    data: z.string().optional(),
  }),
});
