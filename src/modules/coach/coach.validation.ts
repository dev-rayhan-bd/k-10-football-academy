import { z } from 'zod';

export const createCoachProfileZodSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
    coachType: z.enum(['INDIVIDUAL_COACH', 'CLUB_COACH']),
    fullName: z.string().min(2),
    title: z.string().min(2),
    yearsExperience: z.number().min(0),
    licenseStatus: z.string().min(1),
    speciality: z.string().min(1),
    additionalNotes: z.string().optional(),
  }),
});

export const updateCoachProfileZodSchema = z.object({
  body: z.object({
    fullName: z.string().optional(),
    title: z.string().optional(),
    yearsExperience: z.number().optional(),
    licenseStatus: z.string().optional(),
    speciality: z.string().optional(),
    status: z.enum(['AVAILABLE', 'CONTRACTED', 'ACTIVE', 'INACTIVE']).optional(),
    additionalNotes: z.string().optional(),
  }),
});

export const createTacticalFormationZodSchema = z.object({
  body: z.object({
    formationSlot: z.number().min(1).max(3),
    formationName: z.string().min(1),
    positionsJson: z.string().min(2),
  }),
});

export const createCoachTestimonialZodSchema = z.object({
  body: z.object({
    authorName: z.string().min(2),
    authorRole: z.string().min(2),
    authorAvatar: z.string().optional(),
    rating: z.number().min(1).max(5),
    comment: z.string().min(5),
  }),
});
