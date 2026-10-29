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

export const reviewDecisionZodSchema = z.object({
  body: z
    .object({
      status: z.enum(['APPROVED', 'REJECTED']).optional(),
      action: z.enum(['APPROVE', 'REJECT', 'APPROVED', 'REJECTED']).optional(),
      reviewNotes: z.string().trim().optional(),
      rejectionReason: z.string().trim().optional(),
      adminReviewNotes: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      if (!data.status && !data.action) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Either status ("APPROVED" | "REJECTED") or action ("APPROVE" | "REJECT") is required',
          path: ['status'],
        });
      }
    }),
});

export const createPaymentZodSchema = z.object({
  body: z
    .object({
      paymentId: z.string().trim().optional(),
      paymentCode: z.string().trim().optional(),
      type: z.string().trim().optional(),
      paymentType: z.string().trim().optional(),
      category: z.string().trim().optional(),
      userId: z.string().trim().optional(),
      entityId: z.string().trim().optional(),
      userOrEntity: z.string().trim().optional(),
      userOrEntityName: z.string().trim().optional(),
      name: z.string().trim().optional(),
      email: z.string().trim().optional(),
      role: z.string().trim().optional(),
      amount: z.union([z.number(), z.string()]).optional(),
      grossAmount: z.union([z.number(), z.string()]).optional(),
      spend: z.union([z.number(), z.string()]).optional(),
      commissionPaid: z.union([z.number(), z.string()]).optional(),
      commission: z.union([z.number(), z.string()]).optional(),
      commissionRate: z.string().trim().optional(),
      commissionRecipient: z.string().trim().optional(),
      currency: z.string().trim().optional(),
      date: z.string().trim().optional(),
      paymentDate: z.string().trim().optional(),
      status: z
        .enum(['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED', 'CANCELLED', 'PAID', 'UNPAID'])
        .optional(),
      paymentMethod: z.string().trim().optional(),
      transactionId: z.string().trim().optional(),
      notes: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      const rawAmt = data.amount ?? data.grossAmount;
      if (rawAmt === undefined || rawAmt === '' || isNaN(Number(rawAmt)) || Number(rawAmt) < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid payment amount is required',
          path: ['amount'],
        });
      }
    }),
});

export const updatePaymentZodSchema = z.object({
  body: z.object({
    paymentId: z.string().trim().optional(),
    type: z.string().trim().optional(),
    paymentType: z.string().trim().optional(),
    category: z.string().trim().optional(),
    userOrEntity: z.string().trim().optional(),
    userOrEntityName: z.string().trim().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    grossAmount: z.union([z.number(), z.string()]).optional(),
    spend: z.union([z.number(), z.string()]).optional(),
    commissionPaid: z.union([z.number(), z.string()]).optional(),
    commission: z.union([z.number(), z.string()]).optional(),
    commissionRate: z.string().trim().optional(),
    commissionRecipient: z.string().trim().optional(),
    date: z.string().trim().optional(),
    paymentDate: z.string().trim().optional(),
    status: z
      .enum(['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED', 'CANCELLED', 'PAID', 'UNPAID'])
      .optional(),
    notes: z.string().trim().optional(),
  }),
});

export const AdminValidation = {
  updateUserStatusZodSchema,
  createMembershipPlanZodSchema,
  updateMembershipPlanZodSchema,
  grantMembershipZodSchema,
  reviewDecisionZodSchema,
  createPaymentZodSchema,
  updatePaymentZodSchema,
};
