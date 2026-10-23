import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth, optionalAuth } from '@/middlewares/auth.middleware';
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
  createFeePaymentZodSchema,
  updateFeePaymentStatusZodSchema,
  createFinanceTransactionZodSchema,
  updateFinanceTransactionStatusZodSchema,
  createAcademyMatchZodSchema,
  updateAcademyMatchZodSchema,
  createExtraEventZodSchema,
  updateExtraEventZodSchema,
  registerExtraEventParticipantZodSchema,
  createAcademySponsorZodSchema,
  updateAcademySponsorZodSchema,
  createAcademyNewsZodSchema,
  updateAcademyNewsZodSchema,
  createAcademySuccessStoryZodSchema,
  updateAcademySuccessStoryZodSchema,
  updateSuccessStoryStatusZodSchema,
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
  getFeesPayments,
  createFeePayment,
  updateFeePaymentStatus,
  getFeesPaymentsExport,
  getFinanceCommittee,
  createFinanceTransaction,
  updateFinanceTransactionStatus,
  getMatchesMeta,
  getMatches,
  getMatchById,
  createMatch,
  updateMatch,
  deleteMatch,
  getExtraEventsMeta,
  getExtraEvents,
  getExtraEventById,
  createExtraEvent,
  updateExtraEvent,
  deleteExtraEvent,
  registerForExtraEvent,
  getSponsorsMeta,
  getSponsors,
  getSponsorById,
  createSponsor,
  updateSponsor,
  deleteSponsor,
  getAcademyNewsMeta,
  getAcademyNews,
  getAcademyNewsById,
  createAcademyNews,
  updateAcademyNews,
  toggleNewsVisibility,
  moveNewsToBin,
  restoreNewsFromBin,
  deleteNewsPermanently,
  getSuccessStoriesMeta,
  getSuccessStories,
  getSuccessStoryById,
  createSuccessStory,
  updateSuccessStory,
  updateSuccessStoryStatus,
  deleteSuccessStory,
} from './academy.controller';

import {
  createTrainingSessionZodSchema,
  updateTrainingSessionZodSchema,
  saveAttendanceZodSchema,
} from '@/modules/training/training.validation';
import {
  getTrainingFormMeta,
  getTeamsDropdown,
  getCoachesDropdown,
  createTrainingSession,
  getTrainingSessions,
  getTrainingSessionById,
  updateTrainingSession,
  deleteTrainingSession,
  getSessionAttendance,
  saveAttendance,
} from '@/modules/training/training.controller';

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

// ==========================================
// TRAINING SESSIONS (ACADEMY DASHBOARD)
// ==========================================
router.get(
  '/training-sessions/form-meta',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTrainingFormMeta,
);
router.get('/training-sessions/teams', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getTeamsDropdown);
router.get(
  '/training-sessions/coaches',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getCoachesDropdown,
);
router.get(
  '/training-sessions',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN', 'PLAYER', 'PARENT'),
  getTrainingSessions,
);
router.post(
  '/training-sessions',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(createTrainingSessionZodSchema),
  createTrainingSession,
);
router.get(
  '/training-sessions/:sessionId/attendance',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getSessionAttendance,
);
router.put(
  '/training-sessions/:sessionId/attendance',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(saveAttendanceZodSchema),
  saveAttendance,
);
router.post(
  '/training-sessions/:sessionId/attendance',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(saveAttendanceZodSchema),
  saveAttendance,
);
router.get(
  '/training-sessions/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN', 'PLAYER', 'PARENT'),
  getTrainingSessionById,
);
router.patch(
  '/training-sessions/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(updateTrainingSessionZodSchema),
  updateTrainingSession,
);
router.put(
  '/training-sessions/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(updateTrainingSessionZodSchema),
  updateTrainingSession,
);
router.delete(
  '/training-sessions/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  deleteTrainingSession,
);

// Route aliases with :academyId in path
router.get(
  '/:academyId/training-sessions/form-meta',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTrainingFormMeta,
);
router.get(
  '/:academyId/training-sessions/teams',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getTeamsDropdown,
);
router.get(
  '/:academyId/training-sessions/coaches',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getCoachesDropdown,
);
router.get(
  '/:academyId/training-sessions',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN', 'PLAYER', 'PARENT'),
  getTrainingSessions,
);
router.post(
  '/:academyId/training-sessions',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(createTrainingSessionZodSchema),
  createTrainingSession,
);
router.get(
  '/:academyId/training-sessions/:sessionId/attendance',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  getSessionAttendance,
);
router.put(
  '/:academyId/training-sessions/:sessionId/attendance',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(saveAttendanceZodSchema),
  saveAttendance,
);
router.post(
  '/:academyId/training-sessions/:sessionId/attendance',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(saveAttendanceZodSchema),
  saveAttendance,
);
router.get(
  '/:academyId/training-sessions/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN', 'PLAYER', 'PARENT'),
  getTrainingSessionById,
);
router.patch(
  '/:academyId/training-sessions/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(updateTrainingSessionZodSchema),
  updateTrainingSession,
);
router.put(
  '/:academyId/training-sessions/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(updateTrainingSessionZodSchema),
  updateTrainingSession,
);
router.delete(
  '/:academyId/training-sessions/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  deleteTrainingSession,
);

// ==========================================
// FEES & PAYMENTS ROUTES (SCREENSHOT 1)
// ==========================================
router.get('/fees-payments/export', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getFeesPaymentsExport);
router.get(
  '/:academyId/fees-payments/export',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH'),
  getFeesPaymentsExport,
);
router.get('/fees-payments', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getFeesPayments);
router.get('/:academyId/fees-payments', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getFeesPayments);
router.post(
  '/fees-payments',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createFeePaymentZodSchema),
  createFeePayment,
);
router.post(
  '/:academyId/fees-payments',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createFeePaymentZodSchema),
  createFeePayment,
);
router.patch(
  '/fees-payments/:id/status',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateFeePaymentStatusZodSchema),
  updateFeePaymentStatus,
);
router.patch(
  '/:academyId/fees-payments/:id/status',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateFeePaymentStatusZodSchema),
  updateFeePaymentStatus,
);

// ==========================================
// FINANCE COMMITTEE ROUTES (SCREENSHOT 2)
// ==========================================
router.get('/finance-committee', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getFinanceCommittee);
router.get(
  '/:academyId/finance-committee',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH'),
  getFinanceCommittee,
);
router.post(
  '/finance-committee/transactions',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createFinanceTransactionZodSchema),
  createFinanceTransaction,
);
router.post(
  '/:academyId/finance-committee/transactions',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createFinanceTransactionZodSchema),
  createFinanceTransaction,
);
router.patch(
  '/finance-committee/transactions/:id/status',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateFinanceTransactionStatusZodSchema),
  updateFinanceTransactionStatus,
);
router.patch(
  '/:academyId/finance-committee/transactions/:id/status',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateFinanceTransactionStatusZodSchema),
  updateFinanceTransactionStatus,
);

// ==========================================
// MATCHES & MATCH SCHEDULE ROUTES (SCREENSHOTS)
// ==========================================
router.get('/matches/meta', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getMatchesMeta);
router.get('/:academyId/matches/meta', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getMatchesMeta);

router.get('/matches', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getMatches);
router.get('/:academyId/matches', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getMatches);

router.post(
  '/matches',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createAcademyMatchZodSchema),
  createMatch,
);
router.post(
  '/:academyId/matches',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createAcademyMatchZodSchema),
  createMatch,
);

router.get('/matches/:id', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getMatchById);
router.get('/:academyId/matches/:id', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getMatchById);

router.patch(
  '/matches/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateAcademyMatchZodSchema),
  updateMatch,
);
router.patch(
  '/:academyId/matches/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateAcademyMatchZodSchema),
  updateMatch,
);

router.delete('/matches/:id', auth('ACADEMY', 'SUPER_ADMIN'), deleteMatch);
router.delete('/:academyId/matches/:id', auth('ACADEMY', 'SUPER_ADMIN'), deleteMatch);

// ==========================================
// EXTRA EVENTS ROUTES (SCREENSHOTS)
// ==========================================
router.get('/extra-events/meta', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getExtraEventsMeta);
router.get(
  '/:academyId/extra-events/meta',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH'),
  getExtraEventsMeta,
);

router.get('/extra-events', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getExtraEvents);
router.get('/:academyId/extra-events', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getExtraEvents);

router.post(
  '/extra-events',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(createExtraEventZodSchema),
  createExtraEvent,
);
router.post(
  '/:academyId/extra-events',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(createExtraEventZodSchema),
  createExtraEvent,
);

router.get('/extra-events/:id', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getExtraEventById);
router.get(
  '/:academyId/extra-events/:id',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH'),
  getExtraEventById,
);

router.patch(
  '/extra-events/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(updateExtraEventZodSchema),
  updateExtraEvent,
);
router.patch(
  '/:academyId/extra-events/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(updateExtraEventZodSchema),
  updateExtraEvent,
);

router.delete('/extra-events/:id', auth('ACADEMY', 'SUPER_ADMIN'), deleteExtraEvent);
router.delete('/:academyId/extra-events/:id', auth('ACADEMY', 'SUPER_ADMIN'), deleteExtraEvent);

router.post(
  '/extra-events/:id/register',
  optionalAuth(),
  validateRequest(registerExtraEventParticipantZodSchema),
  registerForExtraEvent,
);
router.post(
  '/:academyId/extra-events/:id/register',
  optionalAuth(),
  validateRequest(registerExtraEventParticipantZodSchema),
  registerForExtraEvent,
);

// ==========================================
// ACADEMY SPONSORS ROUTES (SCREENSHOTS)
// ==========================================
router.get('/sponsors/meta', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getSponsorsMeta);
router.get('/:academyId/sponsors/meta', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getSponsorsMeta);

router.get('/sponsors', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getSponsors);
router.get('/:academyId/sponsors', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getSponsors);

router.post(
  '/sponsors',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createAcademySponsorZodSchema),
  createSponsor,
);
router.post(
  '/:academyId/sponsors',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(createAcademySponsorZodSchema),
  createSponsor,
);

router.get('/sponsors/:id', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getSponsorById);
router.get('/:academyId/sponsors/:id', auth('ACADEMY', 'SUPER_ADMIN', 'COACH'), getSponsorById);

router.patch(
  '/sponsors/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateAcademySponsorZodSchema),
  updateSponsor,
);
router.patch(
  '/:academyId/sponsors/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateAcademySponsorZodSchema),
  updateSponsor,
);

router.delete('/sponsors/:id', auth('ACADEMY', 'SUPER_ADMIN'), deleteSponsor);
router.delete('/:academyId/sponsors/:id', auth('ACADEMY', 'SUPER_ADMIN'), deleteSponsor);

// ==========================================
// ACADEMY NEWS ROUTES (SCREENSHOTS)
// ==========================================
router.get(
  '/academy-news/meta',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getAcademyNewsMeta,
);
router.get(
  '/:academyId/academy-news/meta',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getAcademyNewsMeta,
);

router.get(
  '/academy-news',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getAcademyNews,
);
router.get(
  '/:academyId/academy-news',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getAcademyNews,
);

router.post(
  '/academy-news',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(createAcademyNewsZodSchema),
  createAcademyNews,
);
router.post(
  '/:academyId/academy-news',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(createAcademyNewsZodSchema),
  createAcademyNews,
);

router.get(
  '/academy-news/:id',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getAcademyNewsById,
);
router.get(
  '/:academyId/academy-news/:id',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getAcademyNewsById,
);

router.patch(
  '/academy-news/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(updateAcademyNewsZodSchema),
  updateAcademyNews,
);
router.patch(
  '/:academyId/academy-news/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(updateAcademyNewsZodSchema),
  updateAcademyNews,
);

router.patch(
  '/academy-news/:id/toggle-visibility',
  auth('ACADEMY', 'SUPER_ADMIN'),
  toggleNewsVisibility,
);
router.patch(
  '/:academyId/academy-news/:id/toggle-visibility',
  auth('ACADEMY', 'SUPER_ADMIN'),
  toggleNewsVisibility,
);

router.patch('/academy-news/:id/bin', auth('ACADEMY', 'SUPER_ADMIN'), moveNewsToBin);
router.patch('/:academyId/academy-news/:id/bin', auth('ACADEMY', 'SUPER_ADMIN'), moveNewsToBin);

router.patch('/academy-news/:id/restore', auth('ACADEMY', 'SUPER_ADMIN'), restoreNewsFromBin);
router.patch(
  '/:academyId/academy-news/:id/restore',
  auth('ACADEMY', 'SUPER_ADMIN'),
  restoreNewsFromBin,
);

router.delete('/academy-news/:id', auth('ACADEMY', 'SUPER_ADMIN'), deleteNewsPermanently);
router.delete(
  '/:academyId/academy-news/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  deleteNewsPermanently,
);

// ==========================================
// ACADEMY SUCCESS STORY ROUTES (SCREENSHOTS)
// ==========================================
router.get(
  '/success-stories/meta',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getSuccessStoriesMeta,
);
router.get(
  '/:academyId/success-stories/meta',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getSuccessStoriesMeta,
);

router.get(
  '/success-stories',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getSuccessStories,
);
router.get(
  '/:academyId/success-stories',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getSuccessStories,
);

router.post(
  '/success-stories',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(createAcademySuccessStoryZodSchema),
  createSuccessStory,
);
router.post(
  '/:academyId/success-stories',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(createAcademySuccessStoryZodSchema),
  createSuccessStory,
);

router.get(
  '/success-stories/:id',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getSuccessStoryById,
);
router.get(
  '/:academyId/success-stories/:id',
  auth('ACADEMY', 'SUPER_ADMIN', 'COACH', 'PLAYER', 'PARENT'),
  getSuccessStoryById,
);

router.patch(
  '/success-stories/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(updateAcademySuccessStoryZodSchema),
  updateSuccessStory,
);
router.patch(
  '/:academyId/success-stories/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  upload.any() as any,
  validateRequest(updateAcademySuccessStoryZodSchema),
  updateSuccessStory,
);

router.patch(
  '/success-stories/:id/status',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateSuccessStoryStatusZodSchema),
  updateSuccessStoryStatus,
);
router.patch(
  '/:academyId/success-stories/:id/status',
  auth('ACADEMY', 'SUPER_ADMIN'),
  validateRequest(updateSuccessStoryStatusZodSchema),
  updateSuccessStoryStatus,
);

router.delete('/success-stories/:id', auth('ACADEMY', 'SUPER_ADMIN'), deleteSuccessStory);
router.delete(
  '/:academyId/success-stories/:id',
  auth('ACADEMY', 'SUPER_ADMIN'),
  deleteSuccessStory,
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
