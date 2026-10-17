import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth, optionalAuth } from '@/middlewares/auth.middleware';
import {
  createPlayerProfileZodSchema,
  updatePlayerProfileZodSchema,
  updatePlayerAttributesZodSchema,
  createMatchRecordZodSchema,
} from './player.validation';
import {
  createPlayerProfile,
  getPlayerProfile,
  getAllPlayerProfiles,
  updatePlayerProfile,
  updatePlayerAttributes,
  getPlayerAttributes,
  addMatchRecord,
  getMatchRecords,
  uploadHighlightVideo,
  uploadMediaGallery,
  getMediaGallery,
  addClubInterest,
} from './player.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

router.post(
  '/',
  auth(),
  upload.any() as any,
  validateRequest(createPlayerProfileZodSchema),
  createPlayerProfile,
);
router.get('/', getAllPlayerProfiles);
router.get('/me', auth(), getPlayerProfile);
router.patch(
  '/me',
  auth(),
  upload.any() as any,
  validateRequest(updatePlayerProfileZodSchema),
  updatePlayerProfile,
);

// Dedicated /me sub-routes (takes player identity directly from Token)
router.get('/me/attributes', auth(), getPlayerAttributes);
router.patch(
  '/me/attributes',
  auth(),
  validateRequest(updatePlayerAttributesZodSchema),
  updatePlayerAttributes,
);
router.get('/me/matches', auth(), getMatchRecords);
router.post('/me/matches', auth(), validateRequest(createMatchRecordZodSchema), addMatchRecord);
router.get('/me/media', auth(), getMediaGallery);
router.post('/me/media', auth(), upload.any() as any, uploadMediaGallery);
router.post('/me/videos', auth(), upload.any() as any, uploadHighlightVideo);

router.get('/:id', optionalAuth(), getPlayerProfile);
router.patch(
  '/:id',
  auth(),
  upload.any() as any,
  validateRequest(updatePlayerProfileZodSchema),
  updatePlayerProfile,
);

router.post(
  '/:playerId/videos',
  auth('SUPER_ADMIN', 'COACH', 'PLAYER'),
  upload.any() as any,
  uploadHighlightVideo,
);

router.post(
  '/:playerId/media',
  auth('SUPER_ADMIN', 'COACH', 'PLAYER'),
  upload.any() as any,
  uploadMediaGallery,
);

router.get('/:playerId/media', optionalAuth(), getMediaGallery);

router.get('/:playerId/attributes', optionalAuth(), getPlayerAttributes);
router.patch(
  '/:playerId/attributes',
  auth('SUPER_ADMIN', 'COACH', 'PLAYER'),
  validateRequest(updatePlayerAttributesZodSchema),
  updatePlayerAttributes,
);

router.post(
  '/:playerId/matches',
  auth('SUPER_ADMIN', 'COACH', 'PLAYER'),
  validateRequest(createMatchRecordZodSchema),
  addMatchRecord,
);
router.get('/:playerId/matches', optionalAuth(), getMatchRecords);
router.post('/:playerId/interest', auth('SUPER_ADMIN', 'CLUB', 'COACH', 'PLAYER'), addClubInterest);

export const PlayerRoutes = router;
