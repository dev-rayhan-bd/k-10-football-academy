import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createParentProfileZodSchema,
  linkChildZodSchema,
  createParentMatchReportZodSchema,
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
  switchProfile,
  switchToParent,
  getChildTrainingSessions,
  submitParentRsvp,
} from './parent.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

// ==========================================
// PARENT TRAINING SESSIONS & RSVP (TWO-WAY ATTENDANCE)
// ==========================================
router.get(
  '/training-sessions',
  auth('PARENT', 'GUARDIAN', 'SUPER_ADMIN'),
  getChildTrainingSessions,
);
router.get(
  '/me/training-sessions',
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

router.post('/switch-back', auth('PLAYER', 'PARENT', 'GUARDIAN', 'SUPER_ADMIN'), switchToParent);

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

router.post(
  '/:parentId/reports',
  auth('SUPER_ADMIN', 'PARENT', 'GUARDIAN'),
  validateRequest(createParentMatchReportZodSchema),
  createMatchReport,
);
router.get('/:parentId/reports', auth('SUPER_ADMIN', 'PARENT', 'GUARDIAN'), getMatchReports);

export const ParentRoutes = router;
