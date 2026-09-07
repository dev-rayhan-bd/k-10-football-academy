import { z } from 'zod';

export const createClubProfileZodSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    name: z.string().min(2),
    clubType: z.string().min(2),
    establishedYear: z.number().min(1800).max(2030),
    country: z.string().min(2),
    league: z.string().min(2),
    logo: z.string().optional(),
  }),
});

export const addClubAchievementZodSchema = z.object({
  body: z.object({
    year: z.number().min(1800).max(2030),
    championship: z.string().min(2),
    venue: z.string().optional(),
  }),
});

export const addClubFavouriteZodSchema = z.object({
  body: z.object({
    targetType: z.enum(['PLAYER', 'COACH']),
    targetPlayerId: z.string().optional(),
    targetCoachId: z.string().optional(),
  }),
});
