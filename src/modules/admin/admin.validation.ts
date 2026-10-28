import { z } from 'zod';

export const updateUserStatusZodSchema = z.object({
  body: z
    .object({
      status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
      action: z.enum(['BLOCK', 'UNBLOCK', 'ACTIVATE', 'DEACTIVATE']).optional(),
      isBlocked: z.boolean().optional(),
      reason: z.string().trim().max(500).optional(),
    })
    .optional(),
});

export const createMembershipPlanZodSchema = z.object({
  body: z
    .object({
      planName: z.string().trim().min(1).optional(),
      title: z.string().trim().min(1).optional(),
      name: z.string().trim().min(1).optional(),
      planCategory: z.union([z.string(), z.array(z.string())]).optional(),
      targetRole: z.string().trim().optional(),
      category: z.string().trim().optional(),
      features: z.union([z.array(z.string()), z.string()]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      isActive: z.boolean().optional(),
      active: z.boolean().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
      price: z.union([z.number(), z.string()]).optional(),
      planPrice: z.union([z.number(), z.string()]).optional(),
      currency: z.string().optional(),
      billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
      isDefaultPricing: z.boolean().optional(),
      defaultPricing: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
      const resolvedName = data.planName || data.title || data.name;
      if (!resolvedName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Plan Name (planName or title) is required',
          path: ['planName'],
        });
      }
      const rawPrice = data.price ?? data.planPrice;
      if (
        rawPrice === undefined ||
        rawPrice === '' ||
        isNaN(Number(rawPrice)) ||
        Number(rawPrice) < 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid Plan Price (price or planPrice) is required',
          path: ['price'],
        });
      }
    }),
});

export const updateMembershipPlanZodSchema = z.object({
  body: z.object({
    planName: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    planCategory: z.union([z.string(), z.array(z.string())]).optional(),
    targetRole: z.string().trim().optional(),
    category: z.string().trim().optional(),
    features: z.union([z.array(z.string()), z.string()]).optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    active: z.boolean().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    action: z.enum(['ACTIVATE', 'DEACTIVATE', 'TOGGLE']).optional(),
    price: z.union([z.number(), z.string()]).optional(),
    planPrice: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
    isDefaultPricing: z.boolean().optional(),
    defaultPricing: z.boolean().optional(),
  }),
});

export const grantMembershipZodSchema = z.object({
  body: z.object({
    userId: z.string().trim().min(1, 'Selected user ID (userId) is required'),
    category: z
      .enum(['PLAYER', 'COACH', 'ACADEMY', 'CLUB', 'AGENT'])
      .or(z.string().trim())
      .optional(),
    userCategory: z.string().trim().optional(),
    duration: z.union([z.string(), z.number()]).optional(),
    membershipDuration: z.union([z.string(), z.number()]).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

export const AdminValidation = {
  updateUserStatusZodSchema,
  createMembershipPlanZodSchema,
  updateMembershipPlanZodSchema,
  grantMembershipZodSchema,
};
