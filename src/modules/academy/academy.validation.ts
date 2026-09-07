import { z } from 'zod';

export const createAcademyProfileZodSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    name: z.string().min(2),
    category: z.string().min(2),
    country: z.string().min(2),
    city: z.string().min(2),
    logo: z.string().optional(),
    description: z.string().optional(),
  }),
});

export const createTeamZodSchema = z.object({
  body: z.object({
    teamName: z.string().min(2),
    ageGroup: z.string().min(2),
  }),
});

export const createGameReportZodSchema = z.object({
  body: z.object({
    playerId: z.string().min(1),
    matchName: z.string().min(2),
    matchDate: z.string().or(z.date()),
    overallPerformanceScore: z.number().min(1).max(10),
    goals: z.number().optional(),
    assists: z.number().optional(),
    passes: z.number().optional(),
    price: z.number().optional(),
  }),
});
