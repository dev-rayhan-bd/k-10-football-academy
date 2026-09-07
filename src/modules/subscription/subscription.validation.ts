import { z } from 'zod';

export const createPlanZodSchema = z.object({
  body: z.object({
    title: z.string().min(2),
    targetRole: z.string().min(2),
    price: z.number().positive(),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']),
  }),
});

export const subscribeZodSchema = z.object({
  body: z.object({
    planId: z.string().min(1, 'Plan ID is required'),
  }),
});
