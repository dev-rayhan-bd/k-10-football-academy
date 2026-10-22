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
router.get('/:academyId/teams', getTeams);

router.get('/:id', getAcademyProfile);

router.post(
  '/:academyId/reports',
  auth('SUPER_ADMIN', 'ACADEMY', 'COACH'),
  validateRequest(createGameReportZodSchema),
  createGameReport,
);
router.get('/:academyId/reports', getGameReports);

export const AcademyRoutes = router;
