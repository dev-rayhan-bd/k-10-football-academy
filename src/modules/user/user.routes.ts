import { Router } from 'express';
import { userController } from './user.controller';
import { UserValidation } from './user.validation';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import { upload } from '@/middlewares/multer';
import { authRateLimiter, searchRateLimiter } from '@/config/rateLimit.config';

const router = Router();

// Public Authentication Routes (Protected with strict Auth Rate Limiter to prevent Brute-force attacks)
router.post(
  '/register',
  authRateLimiter,
  upload.single('avatar') as any,
  validateRequest(UserValidation.createUserZodSchema),
  userController.register,
);

router.post(
  '/login',
  authRateLimiter,
  validateRequest(UserValidation.loginUserZodSchema),
  userController.login,
);

router.post(
  '/verify-otp',
  authRateLimiter,
  validateRequest(UserValidation.verifyOtpZodSchema),
  userController.verifyOtp,
);

router.post(
  '/resend-otp',
  authRateLimiter,
  validateRequest(UserValidation.resendOtpZodSchema),
  userController.resendOtp,
);

router.post(
  '/forgot-password',
  authRateLimiter,
  validateRequest(UserValidation.forgotPasswordZodSchema),
  userController.forgotPassword,
);

router.post(
  '/reset-password',
  authRateLimiter,
  validateRequest(UserValidation.resetPasswordZodSchema),
  userController.resetPassword,
);

router.post(
  '/refresh-token',
  validateRequest(UserValidation.refreshTokenZodSchema),
  userController.refreshToken,
);

// Protected Authentication Routes
router.post('/logout', auth(), userController.logout);
router.post(
  '/change-password',
  auth(),
  validateRequest(UserValidation.changePasswordZodSchema),
  userController.changePassword,
);

router.get('/me', auth(), userController.getProfile);

// Resource-Intensive Search/Query Route (Protected with Search Rate Limiter)
router.get('/search', auth('ADMIN', 'SUPER_ADMIN'), searchRateLimiter, userController.getAll);

// Admin / Super Admin routes
router.get('/', auth('ADMIN', 'SUPER_ADMIN'), userController.getAll);
router.get('/:id', auth('ADMIN', 'SUPER_ADMIN'), userController.getById);
router.patch(
  '/:id',
  auth('ADMIN', 'SUPER_ADMIN'),
  validateRequest(UserValidation.updateUserZodSchema),
  userController.update,
);
router.delete('/:id', auth('SUPER_ADMIN'), userController.delete);

export const UserRoutes = router;
