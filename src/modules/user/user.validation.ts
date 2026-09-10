import { z } from 'zod';

const userRoleEnum = z.enum([
  'SUPER_ADMIN',
  'ADMIN',
  'AGENT',
  'ACADEMY',
  'CLUB',
  'COACH',
  'PLAYER',
  'PARENT',
  'GUARDIAN',
  'SCOUT',
]);
const userStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']);

export const createUserZodSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
      confirmPassword: z.string().optional(),
      name: z.string().min(2, 'Name must be at least 2 characters'),
      role: userRoleEnum.optional().default('PLAYER'),
      status: userStatusEnum.optional().default('ACTIVE'),
      avatar: z.string().optional(),
      phone: z.string().optional(),
      coverPhoto: z.string().optional(),
      accountManagedBy: z.enum(['ATHLETE', 'PARENT']).optional(),

      // Coach details from Signup Form
      yearsExperience: z.union([z.number(), z.string()]).optional(),
      licenseStatus: z.string().optional(),
      coachingLicenseLevel: z.string().optional(),
      preferredFormation: z.string().optional(),

      // Player details from Signup Form
      dateOfBirth: z.string().optional(),
      position: z.string().optional(),
      height: z.union([z.number(), z.string()]).optional(),
      currentClub: z.string().optional(),

      // Academy details from Signup Form
      academyName: z.string().optional(),
      location: z.string().optional(),
      registrationId: z.string().optional(),
      academySize: z.string().optional(),
      estimatedAcademySize: z.string().optional(),

      // Club details from Signup Form
      clubName: z.string().optional(),
      title: z.string().optional(),
      league: z.string().optional(),
      leagueTier: z.string().optional(),
      country: z.string().optional(),

      // Agent details from Signup Form
      licenseId: z.string().optional(),
      fifaLicenseNumber: z.string().optional(),
      agencyName: z.string().optional(),
      countryOfOperation: z.string().optional(),

      // Parent details from Signup Form
      linkedChildName: z.string().optional(),
      linkedChildEmail: z
        .string()
        .email('Invalid child email address')
        .optional()
        .or(z.literal('')),
      relationship: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      // Role: COACH
      if (data.role === 'COACH') {
        if (data.yearsExperience === undefined || data.yearsExperience === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Years of experience is required for Coach registration',
            path: ['yearsExperience'],
          });
        }
        if (!data.licenseStatus && !data.coachingLicenseLevel) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Coaching license level is required for Coach registration',
            path: ['licenseStatus'],
          });
        }
        if (!data.preferredFormation) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Preferred formation is required for Coach registration',
            path: ['preferredFormation'],
          });
        }
      }

      // Role: PLAYER
      if (data.role === 'PLAYER') {
        if (!data.dateOfBirth) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Date of birth is required for Player registration',
            path: ['dateOfBirth'],
          });
        }
        if (!data.position) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Position is required for Player registration',
            path: ['position'],
          });
        }
      }

      // Role: ACADEMY
      if (data.role === 'ACADEMY') {
        if (!data.academyName && !data.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Academy name is required for Academy registration',
            path: ['academyName'],
          });
        }
        if (!data.location) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Location (city, country) is required for Academy registration',
            path: ['location'],
          });
        }
        if (!data.registrationId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Registration / License ID is required for Academy registration',
            path: ['registrationId'],
          });
        }
        if (!data.estimatedAcademySize && !data.academySize) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Estimated academy size is required for Academy registration',
            path: ['estimatedAcademySize'],
          });
        }
      }

      // Role: CLUB
      if (data.role === 'CLUB') {
        if (!data.clubName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Club name is required for Club registration',
            path: ['clubName'],
          });
        }
        if (!data.title) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Title is required for Club registration',
            path: ['title'],
          });
        }
        if (!data.league && !data.leagueTier) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'League tier is required for Club registration',
            path: ['leagueTier'],
          });
        }
        if (!data.country) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Country is required for Club registration',
            path: ['country'],
          });
        }
      }

      // Role: AGENT
      if (data.role === 'AGENT') {
        if (!data.fifaLicenseNumber && !data.licenseId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'FIFA / FA license number is required for Agent registration',
            path: ['fifaLicenseNumber'],
          });
        }
        if (!data.agencyName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Agency name is required for Agent registration',
            path: ['agencyName'],
          });
        }
        if (!data.countryOfOperation && !data.country) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Country of operation is required for Agent registration',
            path: ['countryOfOperation'],
          });
        }
      }

      // Role: PARENT / GUARDIAN
      if (data.role === 'PARENT' || (data.role as string) === 'GUARDIAN') {
        if (!data.linkedChildName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Linked child name is required for Parent registration',
            path: ['linkedChildName'],
          });
        }
        if (!data.relationship) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Relationship (Father, Mother, Legal Guardian) is required for Parent registration',
            path: ['relationship'],
          });
        }
      }
    }),
});

export const loginUserZodSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const updateUserZodSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').optional(),
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    role: userRoleEnum.optional(),
    status: userStatusEnum.optional(),
    avatar: z.string().optional(),
    phone: z.string().optional(),
    coverPhoto: z.string().optional(),
  }),
});

export const verifyOtpZodSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  }),
});

export const resendOtpZodSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const refreshTokenZodSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const changePasswordZodSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(1, 'Old password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  }),
});

export const UserValidation = {
  createUserZodSchema,
  loginUserZodSchema,
  updateUserZodSchema,
  verifyOtpZodSchema,
  resendOtpZodSchema,
  refreshTokenZodSchema,
  changePasswordZodSchema,
};
