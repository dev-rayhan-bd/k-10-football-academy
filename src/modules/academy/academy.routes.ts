import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createAcademyProfileZodSchema,
  createTeamZodSchema,
  updateTeamZodSchema,
  assignCoachZodSchema,
  assignPlayerZodSchema,
  upgradePlanZodSchema,
  purchasePlanZodSchema,
  createGameReportZodSchema,
  inviteCoachZodSchema,
  requestCoachAffiliationZodSchema,
  respondAffiliationZodSchema,
  createTransferRequestZodSchema,
  respondTransferRequestZodSchema,
  onboardParentZodSchema,
} from './academy.validation';
import {
  createAcademyProfile,
  getAcademyProfile,
  getMyAcademyProfile,
  getAllAcademyProfiles,
  getCoachAndPlayersDashboard,
  getAvailableMembers,
  createTeam,
  getTeams,
  getTeamById,
  getTeamRoster,
  getAvailableCoachesForTeam,
  assignCoachToTeam,
  removeCoachFromTeam,
  getAvailablePlayersForTeam,
  assignPlayerToTeam,
  removePlayerFromTeam,
  updateTeam,
  deleteTeam,
  upgradePlan,
  purchasePremiumPlan,
  createPlanCheckoutSession,
  verifyStripePayment,
  createGameReport,
  getGameReports,
  getEvaluationDashboard,
  requestPlayerEvaluation,
  sendEvaluationReminder,
  submitPlayerEvaluation,
  getPlayerEvaluations,
  inviteCoach,
  requestCoachAffiliation,
  getAcademyCoaches,
  getCoachAffiliations,
  respondToCoachAffiliation,
  removeCoachAffiliation,
  getTransferRequestsDashboard,
  getTargetAcademiesForTransfer,
  getMyAcademyPlayersForTransfer,
  getTransferRequestById,
  createTransferRequest,
  respondToTransferRequest,
  approveTransferRequest,
  rejectTransferRequest,
  getAcademyParents,
  getAvailablePlayersForParentLinking,
  onboardParent,
  getAcademyParentById,
  updateAcademyParent,
  unlinkParentFromAcademy,
  linkPlayerToParent,
  unlinkPlayerFromParent,
} from './academy.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

router.post(
  '/',
  auth(),
  upload.any() as any,
  validateRequest(createAcademyProfileZodSchema),
  createAcademyProfile,
);
router.get('/', getAllAcademyProfiles);
router.get('/my-profile', auth('ACADEMY', 'SUPER_ADMIN'), getMyAcademyProfile);

// ==========================================
// 4-MONTH PLAYER EVALUATION & REMINDER FLOW
// ==========================================
router.get('/evaluations/dashboard', auth('ACADEMY', 'SUPER_ADMIN'), getEvaluationDashboard);
router.get(
  '/:academyId/evaluations/dashboard',
  auth('ACADEMY', 'SUPER_ADMIN'),
  getEvaluationDashboard,
);
router.get('/evaluations', auth(), getPlayerEvaluations);
router.post('/evaluations/request', auth('ACADEMY', 'SUPER_ADMIN'), requestPlayerEvaluation);
router.post(
  '/evaluations/:evaluationId/remind',
  auth('ACADEMY', 'SUPER_ADMIN'),
  sendEvaluationReminder,
);
router.post(
  '/evaluations/:evaluationId/submit',
  auth('COACH', 'SUPER_ADMIN'),
  submitPlayerEvaluation,
);

// ==========================================
// ACADEMY COACH AFFILIATION & APPROVAL FLOW
// ==========================================
router.post(
  '/coaches/invite',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(inviteCoachZodSchema),
  inviteCoach,
);
router.post(
  '/coaches/request',
  auth('COACH', 'SUPER_ADMIN'),
  validateRequest(requestCoachAffiliationZodSchema),
  requestCoachAffiliation,
);
router.get('/coaches/my-affiliations', auth('COACH', 'SUPER_ADMIN'), getCoachAffiliations);
router.get('/coaches', auth('ACADEMY', 'SUPER_ADMIN'), getAcademyCoaches);
router.get('/:academyId/coaches', auth('ACADEMY', 'SUPER_ADMIN'), getAcademyCoaches);
router.patch(
  '/coaches/:affiliationId/respond',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(respondAffiliationZodSchema),
  respondToCoachAffiliation,
);
router.delete('/coaches/:affiliationId', auth('ACADEMY', 'SUPER_ADMIN'), removeCoachAffiliation);

// ==========================================
// COACH AND PLAYERS DASHBOARD & TEAM ROSTER
// ==========================================
router.get('/coach-and-players', auth('ACADEMY', 'SUPER_ADMIN'), getCoachAndPlayersDashboard);
router.get(
  '/:academyId/coach-and-players',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'ADMIN'),
  getCoachAndPlayersDashboard,
);

router.get('/teams/available-members', auth('ACADEMY', 'SUPER_ADMIN'), getAvailableMembers);
router.get(
  '/:academyId/teams/available-members',
  auth('ACADEMY', 'SUPER_ADMIN'),
  getAvailableMembers,
);

router.post(
  '/teams',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createTeamZodSchema),
  createTeam,
);
router.get('/teams', auth('ACADEMY', 'SUPER_ADMIN'), getTeams);
router.get('/teams/:teamId', auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'ADMIN'), getTeamById);

// Team Roster & Members Assignment (Screenshots 3, 4, 5)
router.get(
  '/teams/:teamId/roster',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'ADMIN'),
  getTeamRoster,
);

// Coach Assignment for Team
router.get(
  '/teams/:teamId/available-coaches',
  auth('ACADEMY', 'SUPER_ADMIN'),
  getAvailableCoachesForTeam,
);
router.post(
  '/teams/:teamId/coaches',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(assignCoachZodSchema),
  assignCoachToTeam,
);
router.delete(
  '/teams/:teamId/coaches/:coachId',
  auth('ACADEMY', 'SUPER_ADMIN'),
  removeCoachFromTeam,
);

// Player Assignment for Team
router.get(
  '/teams/:teamId/available-players',
  auth('ACADEMY', 'SUPER_ADMIN'),
  getAvailablePlayersForTeam,
);
router.post(
  '/teams/:teamId/players',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(assignPlayerZodSchema),
  assignPlayerToTeam,
);
router.delete(
  '/teams/:teamId/players/:playerId',
  auth('ACADEMY', 'SUPER_ADMIN'),
  removePlayerFromTeam,
);

router.patch(
  '/teams/:teamId',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateTeamZodSchema),
  updateTeam,
);
router.delete('/teams/:teamId', auth('ACADEMY', 'SUPER_ADMIN'), deleteTeam);

// Available Coaches & Players (Without requiring teamId)
router.get('/available-coaches', auth('ACADEMY', 'SUPER_ADMIN'), getAvailableCoachesForTeam);
router.get('/available-players', auth('ACADEMY', 'SUPER_ADMIN'), getAvailablePlayersForTeam);

// Plan Purchase & Upgrade (Direct & Stripe Checkout)
router.post(
  '/plan/create-checkout-session',
  auth('ACADEMY', 'SUPER_ADMIN'),
  createPlanCheckoutSession,
);
router.post(
  '/:academyId/plan/create-checkout-session',
  auth('ACADEMY', 'SUPER_ADMIN'),
  createPlanCheckoutSession,
);

router.post('/plan/verify-payment', auth('ACADEMY', 'SUPER_ADMIN'), verifyStripePayment);
router.post('/:academyId/plan/verify-payment', auth('ACADEMY', 'SUPER_ADMIN'), verifyStripePayment);

router.post(
  '/plan/purchase',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(purchasePlanZodSchema),
  purchasePremiumPlan,
);
router.post(
  '/:academyId/plan/purchase',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(purchasePlanZodSchema),
  purchasePremiumPlan,
);
router.patch(
  '/plan/upgrade',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(upgradePlanZodSchema),
  upgradePlan,
);
router.patch(
  '/:academyId/plan/upgrade',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(upgradePlanZodSchema),
  upgradePlan,
);

router.post(
  '/:academyId/teams',
  auth('SUPER_ADMIN', 'ACADEMY'),
  validateRequest(createTeamZodSchema),
  createTeam,
);
// ==========================================
// TRANSFER REQUESTS (ACROSS TEAMS & ACADEMIES)
// ==========================================
router.get(
  '/transfer-requests/dashboard',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTransferRequestsDashboard,
);
router.get(
  '/transfer-requests',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTransferRequestsDashboard,
);
router.get(
  '/transfer-requests/target-academies',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTargetAcademiesForTransfer,
);
router.get(
  '/transfer-requests/my-players',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getMyAcademyPlayersForTransfer,
);
router.get(
  '/transfer-requests/:id',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTransferRequestById,
);
router.post(
  '/transfer-requests',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(createTransferRequestZodSchema),
  createTransferRequest,
);
router.patch(
  '/transfer-requests/:id/status',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(respondTransferRequestZodSchema),
  respondToTransferRequest,
);
router.post(
  '/transfer-requests/:id/approve',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  approveTransferRequest,
);
router.post(
  '/transfer-requests/:id/reject',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  rejectTransferRequest,
);
router.post(
  '/transfer-requests/:id/cancel',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  rejectTransferRequest,
);

// Route aliases with :academyId in path
router.get(
  '/:academyId/transfer-requests',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTransferRequestsDashboard,
);
router.get(
  '/:academyId/transfer-requests/target-academies',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTargetAcademiesForTransfer,
);
router.get(
  '/:academyId/transfer-requests/my-players',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getMyAcademyPlayersForTransfer,
);

// ==========================================
// PARENT MANAGEMENT (ACADEMY DASHBOARD)
// ==========================================
router.get('/parents', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getAcademyParents);
router.get(
  '/parents/available-players',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getAvailablePlayersForParentLinking,
);
router.post(
  '/parents',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(onboardParentZodSchema),
  onboardParent,
);
router.get('/parents/:id', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getAcademyParentById);
router.patch('/parents/:id', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), updateAcademyParent);
router.put('/parents/:id', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), updateAcademyParent);
router.delete('/parents/:id', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), unlinkParentFromAcademy);
router.post(
  '/parents/:id/link-player',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  linkPlayerToParent,
);
router.delete(
  '/parents/:id/players/:playerId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  unlinkPlayerFromParent,
);

// Route aliases with :academyId in path
router.get('/:academyId/parents', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getAcademyParents);
router.get(
  '/:academyId/parents/available-players',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getAvailablePlayersForParentLinking,
);
router.post(
  '/:academyId/parents',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(onboardParentZodSchema),
  onboardParent,
);
router.get(
  '/:academyId/parents/:id',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getAcademyParentById,
);
router.patch(
  '/:academyId/parents/:id',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  updateAcademyParent,
);
router.put('/:academyId/parents/:id', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), updateAcademyParent);
router.delete(
  '/:academyId/parents/:id',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  unlinkParentFromAcademy,
);
router.post(
  '/:academyId/parents/:id/link-player',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  linkPlayerToParent,
);
router.delete(
  '/:academyId/parents/:id/players/:playerId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  unlinkPlayerFromParent,
);

router.get('/:id', getAcademyProfile);

router.post(
  '/:academyId/reports',
  auth('SUPER_ADMIN', 'ACADEMY', 'COACH'),
  validateRequest(createGameReportZodSchema),
  createGameReport,
);
router.get('/:academyId/reports', getGameReports);

export const AcademyRoutes = router;
