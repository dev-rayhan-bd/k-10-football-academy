import { Router } from 'express';
import { auth, optionalAuth } from '@/middlewares/auth.middleware';
import { upload } from '@/middlewares/multer';
import { validateRequest } from '@/middlewares/validateRequest';
import {
  uploadMedia,
  getMyMedia,
  getUserMedia,
  updateMedia,
  deleteMedia,
} from './media.controller';
import { createMediaZodSchema, updateMediaZodSchema } from './media.validation';

const router = Router();

// 1. Upload media (any authenticated role: Player, Coach, Club, Academy, Parent, Agent, etc.)
router.post(
  '/upload',
  auth(),
  upload.any() as any,
  validateRequest(createMediaZodSchema),
  uploadMedia,
);

// 2. Get current user's media gallery (supports pagination, filtering by mediaType=IMAGE|VIDEO, searching)
router.get('/me', auth(), getMyMedia);

// 3. Get any user's public media gallery by userId, playerId, coachId, or clubId
router.get('/user/:userId', optionalAuth(), getUserMedia);

// 4. Update media item
router.patch(
  '/:id',
  auth(),
  upload.any() as any,
  validateRequest(updateMediaZodSchema),
  updateMedia,
);

// 5. Delete media item
router.delete('/:id', auth(), deleteMedia);

export const MediaRoutes = router;
