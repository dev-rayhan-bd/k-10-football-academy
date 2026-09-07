import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createClubProfileZodSchema,
  addClubAchievementZodSchema,
  addClubFavouriteZodSchema,
} from './club.validation';
import {
  createClubProfile,
  getClubProfile,
  getAllClubProfiles,
  addAchievement,
  getAchievements,
  addFavourite,
  getFavourites,
} from './club.controller';

const router = Router();

router.post('/', auth(), validateRequest(createClubProfileZodSchema), createClubProfile);
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
