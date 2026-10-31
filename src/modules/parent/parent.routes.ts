import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth, optionalAuth } from '@/middlewares/auth.middleware';
import {
  createParentProfileZodSchema,
  linkChildZodSchema,
  createParentMatchReportZodSchema,
  requestMatchReportReviewZodSchema,
  switchProfileZodSchema,
  parentRsvpZodSchema,
} from './parent.validation';
import {
  createParentProfile,
  getParentProfile,
  getAllParents,
  linkChild,
  createChild,
  getChildren,
  getMyChildren,
  createMatchReport,
  getMatchReports,
  requestMatchReportReview,
  verifyMatchReportPayment,
  switchProfile,
  switchToParent,
  getChildTrainingSessions,
  submitParentRsvp,
  getParentOverview,
} from './parent.controller';
import {
  getParentEventFees,
  payEventFee,
  verifyEventFeePayment,
  downloadInvoicePdf,
} from '@/modules/invoice/invoice.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

// ==========================================
// GUARDIAN / PARENT OVERVIEW (AGGREGATED DASHBOARD)
// ==========================================
router.get('/overview', auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'), getParentOverview);

// ==========================================
// PARENT TRAINING SESSIONS & RSVP (TWO-WAY ATTENDANCE)
// ==========================================
router.get(
  '/training-sessions',
  auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  getChildTrainingSessions,
);
router.post(
  '/sessions/:sessionId/rsvp',
  auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  validateRequest(parentRsvpZodSchema),
  submitParentRsvp,
);
router.patch(
  '/sessions/:sessionId/rsvp',
  auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  validateRequest(parentRsvpZodSchema),
  submitParentRsvp,
);
router.post(
  '/attendance/rsvp',
  auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  validateRequest(parentRsvpZodSchema),
  submitParentRsvp,
);

router.post(
  '/switch-profile',
  auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  validateRequest(switchProfileZodSchema),
  switchProfile,
);

router.post(
  '/switch-to-parent',
  auth('PLAYER', 'PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  switchToParent,
);

router.get('/my-children', auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'), getMyChildren);

router.post(
  '/create-child',
  auth('SUPER_ADMIN', 'PARENT', 'GUARDIAN'),
  upload.any() as any,
  createChild,
);

router.post(
  '/link-child',
  auth('SUPER_ADMIN', 'PARENT', 'GUARDIAN'),
  validateRequest(linkChildZodSchema),
  linkChild,
);

// ==========================================
// PARENT MATCH REPORTS & COACH REVIEWS
// ==========================================
router.get('/reports/verify-payment', optionalAuth(), verifyMatchReportPayment);
router.post(
  '/reports',
  auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  validateRequest(createParentMatchReportZodSchema),
  createMatchReport,
);
router.get('/reports', auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'), getMatchReports);
router.post(
  '/reports/:reportId/request-review',
  auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  validateRequest(requestMatchReportReviewZodSchema),
  requestMatchReportReview,
);

// ==========================================
// PARENT FEES & PAYMENTS (EVENT ENTRY FEES ONLY)
// ==========================================
router.get('/fees/verify-payment', optionalAuth(), verifyEventFeePayment);
router.get('/fees', auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'), getParentEventFees);
router.post('/fees/:id/pay', auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'), payEventFee);
router.get('/fees/:id/invoice', auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'), downloadInvoicePdf);

router.post(
  '/',
  auth(),
  upload.any() as any,
  validateRequest(createParentProfileZodSchema),
  createParentProfile,
);
router.get('/', auth(), getAllParents);
router.get('/:id', getParentProfile);

router.post(
  '/:parentId/children',
  auth('SUPER_ADMIN', 'PARENT', 'GUARDIAN'),
  validateRequest(linkChildZodSchema),
  linkChild,
);
router.get('/:parentId/children', auth('SUPER_ADMIN', 'PARENT', 'GUARDIAN'), getChildren);

export const ParentRoutes = router;
