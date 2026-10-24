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
  getScoutingBoard,
  toggleScoutingFavourite,
  shareScoutingProfile,
  getClubCvsLibrary,
  toggleLikePlayerCv,
  sharePlayerCv,
  getClubSuccessStories,
  createClubSuccessStory,
  updateClubSuccessStory,
  deleteClubSuccessStory,
  getClubAnalytics,
  recordPlayerView,
} from './club.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

// ==========================================
// 1. CLUB PROFILE
// ==========================================
router.get('/profile', auth('CLUB', 'SUPER_ADMIN'), getMyClubProfile);
router.patch('/profile', auth('CLUB', 'SUPER_ADMIN'), upload.any() as any, updateMyClubProfile);

// ==========================================
// 2. SCOUTING BOARD (SCREENSHOTS 1 & 2)
// ==========================================
router.get('/scouting-board', auth('CLUB', 'SUPER_ADMIN'), getScoutingBoard);
router.post('/scouting-board/favourite', auth('CLUB', 'SUPER_ADMIN'), toggleScoutingFavourite);
router.post('/scouting-board/share', auth('CLUB', 'SUPER_ADMIN'), shareScoutingProfile);

// ==========================================
// 3. CVS LIBRARY (SCREENSHOT 3)
// ==========================================
router.get('/cvs-library', auth('CLUB', 'SUPER_ADMIN'), getClubCvsLibrary);
router.post('/cvs-library/:playerId/like', auth('CLUB', 'SUPER_ADMIN'), toggleLikePlayerCv);
router.post('/cvs-library/:playerId/share', auth('CLUB', 'SUPER_ADMIN'), sharePlayerCv);

// ==========================================
// 4. SUCCESS STORIES (SCREENSHOTS 4 & 5)
// ==========================================
router.get('/success-stories', auth('CLUB', 'SUPER_ADMIN'), getClubSuccessStories);
router.post(
  '/success-stories',
  auth('CLUB', 'SUPER_ADMIN'),
  upload.any() as any,
  createClubSuccessStory,
);
router.patch(
  '/success-stories/:id',
  auth('CLUB', 'SUPER_ADMIN'),
  upload.any() as any,
  updateClubSuccessStory,
);
router.delete('/success-stories/:id', auth('CLUB', 'SUPER_ADMIN'), deleteClubSuccessStory);

// ==========================================
// 5. CLUB ANALYTICS (SCREENSHOTS 2 & 3)
// ==========================================
router.get('/analytics', auth('CLUB', 'SUPER_ADMIN'), getClubAnalytics);
router.post('/analytics/view-player/:playerId', auth('CLUB', 'SUPER_ADMIN'), recordPlayerView);

// ==========================================
// GENERAL / ADMIN CLUB ROUTES
// ==========================================
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
