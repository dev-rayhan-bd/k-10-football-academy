import { z } from 'zod';

export const createParentProfileZodSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    contactPhone: z.string().min(5),
  }),
});

export const linkChildZodSchema = z.object({
  body: z.object({
    childPlayerId: z.string().min(1),
    relationshipType: z.enum(['FATHER', 'MOTHER', 'GUARDIAN']),
  }),
});

export const createParentMatchReportZodSchema = z.object({
  body: z.object({
    childPlayerId: z.string().min(1),
    opponentTeam: z.string().min(2),
    matchDate: z.string().or(z.date()),
    plottedEventsJson: z.string().optional(),
    requestCoachReview: z.boolean().optional(),
  }),
});
