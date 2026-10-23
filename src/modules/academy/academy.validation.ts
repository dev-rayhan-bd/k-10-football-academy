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

// ==========================================
// EXTRA EVENTS VALIDATIONS (SCREENSHOTS)
// ==========================================
export const createExtraEventZodSchema = z.object({
  body: z
    .object({
      eventName: z.string({ required_error: 'Event name is required' }).min(2),
      eventType: z.string({ required_error: 'Event type is required' }).min(2),
      group: z.string({ required_error: 'Group is required' }).min(2),
      ageGroup: z.string({ required_error: 'Age group is required' }).min(1),
      targetAttendees: z
        .string({ required_error: 'Target attendees / player type is required' })
        .min(2),
      eventDate: z.string({ required_error: 'Event date is required' }).or(z.date()),
      eventEndDate: z.string().or(z.date()).optional(),
      formattedDateRange: z.string().optional(),
      startTime: z.string({ required_error: 'Start time is required' }),
      endTime: z.string({ required_error: 'End time is required' }),
      registrationDeadline: z
        .string({ required_error: 'Registration deadline is required' })
        .or(z.date()),
      venueName: z.string({ required_error: 'Venue name is required' }).min(2),
      venueAddress: z.string({ required_error: 'Venue address is required' }).min(2),
      registrationFee: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional()
        .default(0),
      currency: z.string().optional().default('£'),
      maxCapacity: z.number().or(z.string().regex(/^\d+$/).transform(Number)).optional(),
      description: z.string({ required_error: 'Event description is required' }).min(5),
      requirements: z.string().optional(),
      contactPerson: z.string({ required_error: 'Contact person is required' }).min(2),
      contactPhone: z.string({ required_error: 'Contact phone is required' }).min(5),
      contactEmail: z.string({ required_error: 'Contact email is required' }).email(),
      bannerImage: z.string().optional(),
      status: z.enum(['OPEN', 'CLOSING SOON', 'CLOSED']).optional().default('OPEN'),
    })
    .passthrough(),
});

export const updateExtraEventZodSchema = z.object({
  body: z
    .object({
      eventName: z.string().min(2).optional(),
      eventType: z.string().min(2).optional(),
      group: z.string().min(2).optional(),
      ageGroup: z.string().min(1).optional(),
      targetAttendees: z.string().min(2).optional(),
      eventDate: z.string().or(z.date()).optional(),
      eventEndDate: z.string().or(z.date()).optional(),
      formattedDateRange: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      registrationDeadline: z.string().or(z.date()).optional(),
      venueName: z.string().min(2).optional(),
      venueAddress: z.string().min(2).optional(),
      registrationFee: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional(),
      currency: z.string().optional(),
      maxCapacity: z.number().or(z.string().regex(/^\d+$/).transform(Number)).optional(),
      description: z.string().min(5).optional(),
      requirements: z.string().optional(),
      contactPerson: z.string().min(2).optional(),
      contactPhone: z.string().min(5).optional(),
      contactEmail: z.string().email().optional(),
      bannerImage: z.string().optional(),
      status: z.enum(['OPEN', 'CLOSING SOON', 'CLOSED']).optional(),
    })
    .passthrough(),
});

export const registerExtraEventParticipantZodSchema = z.object({
  body: z
    .object({
      name: z.string({ required_error: 'Participant name is required' }).min(2),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      teamName: z.string().optional(),
      paidAmount: z.number().optional(),
      paymentStatus: z.enum(['PAID', 'PENDING', 'FREE']).optional(),
    })
    .passthrough(),
});

// ==========================================
// ACADEMY SPONSORS VALIDATIONS (SCREENSHOTS)
// ==========================================
export const createAcademySponsorZodSchema = z.object({
  body: z
    .object({
      companyName: z.string({ required_error: 'Company name is required' }).min(2),
      contactPerson: z.string({ required_error: 'Contact person is required' }).min(2),
      email: z.string({ required_error: 'Email is required' }).email(),
      phone: z.string({ required_error: 'Phone number is required' }).min(5),
      fullAddress: z.string({ required_error: 'Full address is required' }).min(2),
      sponsorshipType: z.string({ required_error: 'Sponsorship type is required' }).min(2),
      sponsorshipStatus: z
        .enum(['ACTIVE', 'EXPIRING SOON', 'EXPIRED', 'PENDING', 'TERMINATED'])
        .optional()
        .default('ACTIVE'),
      contractValue: z.number({ required_error: 'Contract value is required' }).or(
        z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .transform(Number),
      ),
      currency: z.string().optional().default('$'),
      paymentStatus: z
        .enum(['PAID', 'PENDING', 'PARTIALLY_PAID', 'OVERDUE'])
        .optional()
        .default('PENDING'),
      startDate: z.string({ required_error: 'Start date / time is required' }).or(z.date()),
      endDate: z.string({ required_error: 'End date / time is required' }).or(z.date()),
      formattedContractPeriod: z.string().optional(),
      sponsorshipDescription: z
        .string({ required_error: 'Sponsorship description is required' })
        .min(5),
      benefitsAndDeliverables: z.string().optional(),
      logo: z.string().optional(),
    })
    .passthrough(),
});

export const updateAcademySponsorZodSchema = z.object({
  body: z
    .object({
      companyName: z.string().min(2).optional(),
      contactPerson: z.string().min(2).optional(),
      email: z.string().email().optional(),
      phone: z.string().min(5).optional(),
      fullAddress: z.string().min(2).optional(),
      sponsorshipType: z.string().min(2).optional(),
      sponsorshipStatus: z
        .enum(['ACTIVE', 'EXPIRING SOON', 'EXPIRED', 'PENDING', 'TERMINATED'])
        .optional(),
      contractValue: z
        .number()
        .or(
          z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
        )
        .optional(),
      currency: z.string().optional(),
      paymentStatus: z.enum(['PAID', 'PENDING', 'PARTIALLY_PAID', 'OVERDUE']).optional(),
      startDate: z.string().or(z.date()).optional(),
      endDate: z.string().or(z.date()).optional(),
      formattedContractPeriod: z.string().optional(),
      sponsorshipDescription: z.string().min(5).optional(),
      benefitsAndDeliverables: z.string().optional(),
      logo: z.string().optional(),
    })
    .passthrough(),
});

// ==========================================
// ACADEMY NEWS VALIDATIONS (SCREENSHOTS)
// ==========================================
export const createAcademyNewsZodSchema = z
  .object({
    body: z
      .object({
        articleTitle: z.string().optional(),
        category: z.string().optional(),
        author: z.string().optional().default('Admin'),
        publishDate: z.string().or(z.date()).optional(),
        fullArticle: z.string().optional(),
        excerpt: z.string().optional(),
        featuredImage: z.string().optional(),
        tags: z
          .array(z.string())
          .or(
            z.string().transform((val) =>
              val
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            ),
          )
          .optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
        visibility: z.enum(['PUBLIC', 'PRIVATE']).optional().default('PUBLIC'),
        status: z.enum(['PUBLISHED', 'DRAFT', 'BIN']).optional().default('PUBLISHED'),
        sendPushNotification: z.boolean().optional().default(false),
      })
      .passthrough(),
  })
  .superRefine((data, ctx) => {
    const b = data.body;
    const isDraft = b.status === 'DRAFT';

    if (isDraft) {
      // Draft mode: allow saving even with just a single field / draft title
      if (!b.articleTitle || b.articleTitle.trim().length === 0) {
        b.articleTitle = 'Untitled Draft';
      }
    } else {
      // Published mode: full strict validation applies
      if (!b.articleTitle || b.articleTitle.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Article title is required (minimum 2 characters)',
          path: ['body', 'articleTitle'],
        });
      }
      if (!b.category || b.category.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Category is required',
          path: ['body', 'category'],
        });
      }
      if (!b.fullArticle || b.fullArticle.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Full article content is required (minimum 5 characters)',
          path: ['body', 'fullArticle'],
        });
      }
    }
  });

export const updateAcademyNewsZodSchema = z.object({
  body: z
    .object({
      articleTitle: z.string().min(1).optional(),
      category: z.string().optional(),
      author: z.string().optional(),
      publishDate: z.string().or(z.date()).optional(),
      fullArticle: z.string().optional(),
      excerpt: z.string().optional(),
      featuredImage: z.string().optional(),
      tags: z
        .array(z.string())
        .or(
          z.string().transform((val) =>
            val
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        )
        .optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
      status: z.enum(['PUBLISHED', 'DRAFT', 'BIN']).optional(),
      sendPushNotification: z.boolean().optional(),
    })
    .passthrough(),
});

// ==========================================
// ACADEMY SUCCESS STORY VALIDATIONS (SCREENSHOTS)
// ==========================================
export const createAcademySuccessStoryZodSchema = z.object({
  body: z
    .object({
      storyTitle: z.string({ required_error: 'Story title is required' }).min(2),
      playerName: z.string().optional(),
      position: z.string().optional(),
      currentAcademy: z.string().optional(),
      date: z.string().or(z.date()).optional(),
      category: z.string({ required_error: 'Category is required' }).min(2),
      photo: z.string().optional(),
      storyContent: z.string().optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional().default('PENDING'),
    })
    .passthrough(),
});

export const updateAcademySuccessStoryZodSchema = z.object({
  body: z
    .object({
      storyTitle: z.string().min(2).optional(),
      playerName: z.string().optional(),
      position: z.string().optional(),
      currentAcademy: z.string().optional(),
      date: z.string().or(z.date()).optional(),
      category: z.string().optional(),
      photo: z.string().optional(),
      storyContent: z.string().optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
      rejectionReason: z.string().optional(),
    })
    .passthrough(),
});

export const updateSuccessStoryStatusZodSchema = z.object({
  body: z
    .object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED'], {
        required_error: 'Status is required (PENDING, APPROVED, REJECTED)',
      }),
      rejectionReason: z.string().optional(),
    })
    .passthrough(),
});

export const notifyCoachCvValidationZodSchema = z.object({
  body: z
    .object({
      playerId: z.string({ required_error: 'Player ID is required' }),
      coachId: z.string().optional(),
      message: z.string().optional(),
    })
    .passthrough(),
});
