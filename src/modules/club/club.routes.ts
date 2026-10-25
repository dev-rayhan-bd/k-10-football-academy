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
  getScoutingBoardPlayers,
  getScoutingBoardCoaches,
  toggleScoutingFavourite,
  shareScoutingProfile,
  getClubCvsLibrary,
  toggleLikePlayerCv,
  sharePlayerCv,
  getClubSuccessStories,
  getClubSuccessStoryById,
  createClubSuccessStory,
  updateClubSuccessStory,
  deleteClubSuccessStory,
  reviewClubSuccessStory,
  getClubAnalytics,
  recordPlayerView,
  getClubDashboard,
} from './club.controller';

import { upload } from '@/middlewares/multer';
import { requireClubOrAgentAccess } from '@/middlewares/clubAgentGate.middleware';

const router = Router();

// ==========================================
// 0. CLUB DASHBOARD (SCREENSHOTS 1 TO 5 - REAL-TIME DB)
// ==========================================
router.get('/dashboard', auth('CLUB', 'SUPER_ADMIN'), requireClubOrAgentAccess(), getClubDashboard);
router.get(
  '/dashboard-analytics',
  auth('CLUB', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getClubDashboard,
);

// ==========================================
// 1. CLUB PROFILE (Accessible before approval to upload credentials)
// ==========================================
router.get('/profile', auth('CLUB', 'SUPER_ADMIN'), getMyClubProfile);
router.get('/club-profile', auth('CLUB', 'SUPER_ADMIN'), getMyClubProfile);
router.patch('/profile', auth('CLUB', 'SUPER_ADMIN'), upload.any() as any, updateMyClubProfile);
router.patch(
  '/club-profile',
  auth('CLUB', 'SUPER_ADMIN'),
  upload.any() as any,
  updateMyClubProfile,
);

// ==========================================
// 2. SCOUTING BOARD (SCREENSHOTS 1 & 2)
// ==========================================
router.get(
  '/scouting-board',
  auth('CLUB', 'AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getScoutingBoard,
);
router.get(
  '/scouting-board/players',
  auth('CLUB', 'AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getScoutingBoardPlayers,
);
router.get(
  '/scouting-board/coaches',
  auth('CLUB', 'AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getScoutingBoardCoaches,
);
router.post(
  '/scouting-board/favourite',
  auth('CLUB', 'AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  toggleScoutingFavourite,
);
router.post(
  '/scouting-board/share',
  auth('CLUB', 'AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  shareScoutingProfile,
);

// ==========================================
// 3. CVS LIBRARY (SCREENSHOT 3)
// ==========================================
router.get(
  '/cvs-library',
  auth('CLUB', 'AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getClubCvsLibrary,
);
router.post(
  '/cvs-library/:playerId/like',
  auth('CLUB', 'AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  toggleLikePlayerCv,
);
router.post(
  '/cvs-library/:playerId/share',
  auth('CLUB', 'AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  sharePlayerCv,
);

// ==========================================
// 4. SUCCESS STORIES (SCREENSHOTS 4 & 5)
// ==========================================
router.get(
  '/success-stories',
  auth('CLUB', 'SUPER_ADMIN', 'ADMIN'),
  requireClubOrAgentAccess(),
  getClubSuccessStories,
);
router.get(
  '/success-stories/:id',
  auth('CLUB', 'SUPER_ADMIN', 'ADMIN'),
  requireClubOrAgentAccess(),
  getClubSuccessStoryById,
);
router.post(
  '/success-stories',
  auth('CLUB', 'SUPER_ADMIN', 'ADMIN'),
  requireClubOrAgentAccess(),
  upload.any() as any,
  createClubSuccessStory,
);
router.patch(
  '/success-stories/:id',
  auth('CLUB', 'SUPER_ADMIN', 'ADMIN'),
  requireClubOrAgentAccess(),
  upload.any() as any,
  updateClubSuccessStory,
);
router.delete(
  '/success-stories/:id',
  auth('CLUB', 'SUPER_ADMIN', 'ADMIN'),
  requireClubOrAgentAccess(),
  deleteClubSuccessStory,
);
router.patch('/success-stories/:id/status', auth('SUPER_ADMIN', 'ADMIN'), reviewClubSuccessStory);

// ==========================================
// 5. CLUB ANALYTICS (SCREENSHOTS 2 & 3)
// ==========================================
router.get('/analytics', auth('CLUB', 'SUPER_ADMIN'), requireClubOrAgentAccess(), getClubAnalytics);
router.post(
  '/analytics/view-player/:playerId',
  auth('CLUB', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  recordPlayerView,
);

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
