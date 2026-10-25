import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth, optionalAuth } from '@/middlewares/auth.middleware';
import {
  requireClubOrAgentAccess,
  gateClubOrAgentIfAuthenticated,
} from '@/middlewares/clubAgentGate.middleware';
import { createAgentProfileZodSchema, createSuccessStoryZodSchema } from './agent.validation';
import {
  createAgentProfile,
  getMyAgentProfile,
  updateMyAgentProfile,
  getAgentProfile,
  uploadVerificationDoc,
  getVerificationDocs,
  createSuccessStory,
  getSuccessStories,
  getSuccessStoryById,
  updateSuccessStory,
  deleteSuccessStory,
  reviewSuccessStory,
  getAgentDashboard,
  getAgentScoutingBoard,
  getAgentScoutingBoardPlayers,
  getAgentScoutingBoardCoaches,
  toggleAgentScoutingFavourite,
  shareAgentScoutingProfile,
  getAgentCvsLibrary,
  toggleLikeAgentPlayerCv,
  shareAgentPlayerCv,
  getAgentAnalytics,
  recordAgentPlayerView,
} from './agent.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

// ==========================================
// 0. AGENT DASHBOARD & SCOUTING (GATEKEEPER ENFORCED)
// ==========================================
router.get(
  '/dashboard',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getAgentDashboard,
);
router.get(
  '/dashboard-analytics',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getAgentDashboard,
);

router.get(
  '/scouting-board',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getAgentScoutingBoard,
);
router.get(
  '/scouting-board/players',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getAgentScoutingBoardPlayers,
);
router.get(
  '/discover-players',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getAgentScoutingBoardPlayers,
);
router.post(
  '/discover-players/:playerId/like',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  toggleLikeAgentPlayerCv,
);
router.post(
  '/discover-players/:playerId/share',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  shareAgentPlayerCv,
);
router.get(
  '/scouting-board/coaches',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getAgentScoutingBoardCoaches,
);
router.post(
  '/scouting-board/favourite',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  toggleAgentScoutingFavourite,
);
router.post(
  '/scouting-board/share',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  shareAgentScoutingProfile,
);

router.get(
  '/cvs-library',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getAgentCvsLibrary,
);
router.post(
  '/cvs-library/:playerId/like',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  toggleLikeAgentPlayerCv,
);
router.post(
  '/cvs-library/:playerId/share',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  shareAgentPlayerCv,
);

// ==========================================
// 0.1 AGENT ANALYTICS (SCREENSHOT 1)
// ==========================================
router.get(
  '/analytics',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  getAgentAnalytics,
);
router.post(
  '/analytics/view-player/:playerId',
  auth('AGENT', 'SUPER_ADMIN'),
  requireClubOrAgentAccess(),
  recordAgentPlayerView,
);

// ==========================================
// 1. AGENT PROFILE & CREDENTIALS
// ==========================================
router.get('/profile', auth('AGENT', 'SUPER_ADMIN'), getMyAgentProfile);
router.patch('/profile', auth('AGENT', 'SUPER_ADMIN'), upload.any() as any, updateMyAgentProfile);

router.get('/agent-profile', auth('AGENT', 'SUPER_ADMIN'), getMyAgentProfile);
router.patch(
  '/agent-profile',
  auth('AGENT', 'SUPER_ADMIN'),
  upload.any() as any,
  updateMyAgentProfile,
);

router.post(
  '/',
  auth('AGENT', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(createAgentProfileZodSchema),
  createAgentProfile,
);

// ==========================================
// 2. DOCUMENT UPLOADS FOR VERIFICATION
// ==========================================
router.get('/license-verification', auth('AGENT', 'SUPER_ADMIN'), getVerificationDocs);
router.get('/documents', auth('AGENT', 'SUPER_ADMIN'), getVerificationDocs);
router.post('/documents', auth('AGENT', 'SUPER_ADMIN'), upload.any() as any, uploadVerificationDoc);

router.post(
  '/:agentId/documents',
  auth('SUPER_ADMIN', 'AGENT'),
  upload.any() as any,
  uploadVerificationDoc,
);
router.get('/:agentId/documents', auth('SUPER_ADMIN', 'AGENT'), getVerificationDocs);

// ==========================================
// 3. SUCCESS STORIES
// ==========================================
router.post(
  '/success-stories',
  auth('SUPER_ADMIN', 'AGENT', 'COACH'),
  requireClubOrAgentAccess(),
  upload.any() as any,
  validateRequest(createSuccessStoryZodSchema),
  createSuccessStory,
);
router.get('/success-stories', optionalAuth(), gateClubOrAgentIfAuthenticated(), getSuccessStories);
router.get(
  '/success-stories/:id',
  optionalAuth(),
  gateClubOrAgentIfAuthenticated(),
  getSuccessStoryById,
);
router.patch(
  '/success-stories/:id',
  auth('SUPER_ADMIN', 'AGENT', 'COACH'),
  requireClubOrAgentAccess(),
  upload.any() as any,
  updateSuccessStory,
);
router.delete(
  '/success-stories/:id',
  auth('SUPER_ADMIN', 'AGENT', 'COACH'),
  requireClubOrAgentAccess(),
  deleteSuccessStory,
);
router.patch('/success-stories/:id/status', auth('SUPER_ADMIN', 'ADMIN'), reviewSuccessStory);

// Profile by ID
router.get('/:id', optionalAuth(), gateClubOrAgentIfAuthenticated(), getAgentProfile);

export const AgentRoutes = router;
