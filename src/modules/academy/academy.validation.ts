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
    teamName: z.string().min(2, 'Team name must have at least 2 characters'),
    ageGroup: z.string().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    coachIds: z.array(z.string()).max(2, 'Maximum 2 coaches allowed per team').optional(),
    playerIds: z.array(z.string()).max(18, 'Maximum 18 players allowed per team').optional(),
  }),
});

export const updateTeamZodSchema = z.object({
  body: z.object({
    teamName: z.string().min(2).optional(),
    ageGroup: z.string().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    coachIds: z.array(z.string()).max(2, 'Maximum 2 coaches allowed per team').optional(),
    playerIds: z.array(z.string()).max(18, 'Maximum 18 players allowed per team').optional(),
  }),
});

export const assignCoachZodSchema = z.object({
  body: z.object({
    coachId: z.string().min(1, 'Coach ID is required'),
    role: z.string().optional(),
  }),
});

export const assignPlayerZodSchema = z.object({
  body: z.object({
    playerId: z.string().min(1, 'Player ID is required'),
  }),
});

export const upgradePlanZodSchema = z.object({
  body: z.object({
    plan: z.enum(['FREE', 'BASIC', 'PRO', 'PREMIUM']),
    maxTeams: z.number().min(1).optional(),
  }),
});

export const purchasePlanZodSchema = z.object({
  body: z.object({
    plan: z.enum(['FREE', 'BASIC', 'PRO', 'PREMIUM']).default('PREMIUM'),
    paymentMethod: z.string().optional(),
    price: z.number().optional(),
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

export const inviteCoachZodSchema = z.object({
  body: z.object({
    coachId: z.string().optional(),
    coachEmail: z.string().email().optional(),
    role: z.string().optional(),
    message: z.string().optional(),
  }),
});

export const requestCoachAffiliationZodSchema = z.object({
  body: z.object({
    academyId: z.string().min(1),
    message: z.string().optional(),
  }),
});

export const respondAffiliationZodSchema = z.object({
  body: z.object({
    action: z.enum(['APPROVE', 'REJECT']),
    responseNote: z.string().optional(),
  }),
});

export const createTransferRequestZodSchema = z.object({
  body: z
    .object({
      playerId: z.string({ required_error: 'Player ID from dropdown is required' }),
      targetAcademyId: z.string({ required_error: 'Target Academy ID from dropdown is required' }),
      transferType: z.string().default('OUTGOING'),
      fullName: z.string().optional(),
      athleteName: z.string().optional(),
      reason: z.string().optional(),
    })
    .passthrough(),
});

export const respondTransferRequestZodSchema = z.object({
  body: z
    .object({
      status: z.enum(['APPROVED', 'REJECTED']).optional(),
      responseNote: z.string().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});

export const onboardParentZodSchema = z.object({
  body: z
    .object({
      firstName: z.string({ required_error: 'First name is required' }).min(1),
      lastName: z.string({ required_error: 'Last name is required' }).min(1),
      relationship: z.string().optional().default('Guardian'),
      occupation: z.string().optional(),
      email: z.string({ required_error: 'Email address is required' }).email(),
      primaryPhone: z.string({ required_error: 'Primary phone is required' }).min(1),
      alternatePhone: z.string().optional(),
      streetAddress: z.string().optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
      linkedPlayerIds: z.array(z.string()).optional().default([]),
      notes: z.string().optional(),
    })
    .passthrough(),
});

export const createFeePaymentZodSchema = z.object({
  body: z
    .object({
      playerId: z.string({ required_error: 'Player ID is required' }),
      feeType: z.string().optional().default('Monthly Fee'),
      amount: z.number({ required_error: 'Amount is required' }).or(
        z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .transform(Number),
      ),
      paymentDate: z.string().or(z.date()).optional(),
      status: z.enum(['PAID', 'UNPAID', 'PENDING']).optional().default('PAID'),
      paymentMethod: z
        .enum(['CASH', 'CARD', 'STRIPE', 'BANK_TRANSFER', 'OTHER'])
        .optional()
        .default('CASH'),
      notes: z.string().optional(),
    })
    .passthrough(),
});

export const updateFeePaymentStatusZodSchema = z.object({
  body: z
    .object({
      status: z.enum(['PAID', 'UNPAID', 'PENDING']),
      paymentMethod: z.enum(['CASH', 'CARD', 'STRIPE', 'BANK_TRANSFER', 'OTHER']).optional(),
      notes: z.string().optional(),
    })
    .passthrough(),
});

export const createFinanceTransactionZodSchema = z.object({
  body: z
    .object({
      playerId: z.string({ required_error: 'Player ID is required' }),
      transactionType: z.string().optional().default('Game Report'),
      cost: z.number().or(
        z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .transform(Number),
      ),
      commissionAcademy: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional(),
      transactionDate: z.string().or(z.date()).optional(),
      status: z.enum(['COMPLETED', 'PENDING', 'REJECTED']).optional().default('COMPLETED'),
      notes: z.string().optional(),
    })
    .passthrough(),
});

export const updateFinanceTransactionStatusZodSchema = z.object({
  body: z
    .object({
      status: z.enum(['COMPLETED', 'PENDING', 'REJECTED']),
      notes: z.string().optional(),
    })
    .passthrough(),
});

export const createAcademyMatchZodSchema = z.object({
  body: z
    .object({
      matchTitle: z.string({ required_error: 'Match title is required' }).min(2),
      ourTeamId: z.string({ required_error: 'Our team ID is required' }),
      opponentTeam: z.string({ required_error: 'Opponent team name is required' }).min(2),
      matchType: z.string().optional().default('Friendly'),
      competitionName: z.string().optional(),
      homeOrAway: z.string().optional().default('HOME GROUND'),
      venueName: z.string({ required_error: 'Venue name is required' }).min(2),
      venueAddress: z.string({ required_error: 'Venue address is required' }).min(2),
      matchDate: z.string({ required_error: 'Match date is required' }).or(z.date()),
      kickOffTime: z.string({ required_error: 'Kick-off time is required' }),
      referees: z.string().optional(),
      travelRequired: z.boolean().optional().default(false),
      transportCost: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional()
        .default(0),
      groundCost: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional()
        .default(0),
      mealsCost: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional()
        .default(0),
      otherCosts: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional()
        .default(0),
      notes: z.string().optional(),
      status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional().default('SCHEDULED'),
    })
    .passthrough(),
});

export const updateAcademyMatchZodSchema = z.object({
  body: z
    .object({
      matchTitle: z.string().min(2).optional(),
      ourTeamId: z.string().optional(),
      opponentTeam: z.string().min(2).optional(),
      matchType: z.string().optional(),
      competitionName: z.string().optional(),
      homeOrAway: z.string().optional(),
      venueName: z.string().min(2).optional(),
      venueAddress: z.string().min(2).optional(),
      matchDate: z.string().or(z.date()).optional(),
      kickOffTime: z.string().optional(),
      referees: z.string().optional(),
      travelRequired: z.boolean().optional(),
      transportCost: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional(),
      groundCost: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional(),
      mealsCost: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional(),
      otherCosts: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional(),
      notes: z.string().optional(),
      status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
    })
    .passthrough(),
});
