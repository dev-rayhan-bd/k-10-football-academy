import { z } from 'zod';

const userRoleEnum = z.enum([
  'SUPER_ADMIN',
  'ADMIN',
  'AGENT',
  'ACADEMY',
  'CLUB',
  'COACH',
  'PLAYER',
  'GUARDIAN',
  'SCOUT',
]);
const userStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']);

export const createUserZodSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    role: userRoleEnum.optional().default('PLAYER'),
    status: userStatusEnum.optional().default('ACTIVE'),
    avatar: z.string().optional(),
    phone: z.string().optional(),
    coverPhoto: z.string().optional(),
    accountManagedBy: z.enum(['ATHLETE', 'PARENT']).optional(),
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
