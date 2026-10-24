import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createClubProfileZodSchema,
  addClubAchievementZodSchema,
  addClubFavouriteZodSchema,
} from './club.validation';
import {
  getMyClubProfile,
  updateMyClubProfile,
  createClubProfile,
  getClubProfile,
  getAllClubProfiles,
  addAchievement,
  getAchievements,
  addFavourite,
  getFavourites,
} from './club.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

// ==========================================
// AUTHENTICATED CLUB PROFILE (FOR CLUB ROLE)
// ==========================================
router.get('/profile', auth('CLUB', 'SUPER_ADMIN'), getMyClubProfile);
router.get('/my-profile', auth('CLUB', 'SUPER_ADMIN'), getMyClubProfile);
router.get('/club-profile', auth('CLUB', 'SUPER_ADMIN'), getMyClubProfile);

router.patch('/profile', auth('CLUB', 'SUPER_ADMIN'), upload.any() as any, updateMyClubProfile);
router.patch('/my-profile', auth('CLUB', 'SUPER_ADMIN'), upload.any() as any, updateMyClubProfile);
router.patch(
  '/club-profile',
  auth('CLUB', 'SUPER_ADMIN'),
  upload.any() as any,
  updateMyClubProfile,
);
router.put('/profile', auth('CLUB', 'SUPER_ADMIN'), upload.any() as any, updateMyClubProfile);
router.put('/club-profile', auth('CLUB', 'SUPER_ADMIN'), upload.any() as any, updateMyClubProfile);

router.post(
  '/',
  auth(),
  upload.any() as any,
  validateRequest(createClubProfileZodSchema),
  createClubProfile,
);
router.get('/', getAllClubProfiles);
router.get('/:id', getClubProfile);

router.post(
  '/:clubId/achievements',
  auth('SUPER_ADMIN', 'CLUB'),
  validateRequest(addClubAchievementZodSchema),
  addAchievement,
);
router.get('/:clubId/achievements', getAchievements);

router.post(
  '/:clubId/favourites',
  auth('SUPER_ADMIN', 'CLUB'),
  validateRequest(addClubFavouriteZodSchema),
  addFavourite,
);
router.get('/:clubId/favourites', auth('SUPER_ADMIN', 'CLUB'), getFavourites);

export const ClubRoutes = router;
