import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createParentProfileZodSchema,
  linkChildZodSchema,
  createParentMatchReportZodSchema,
  switchProfileZodSchema,
} from './parent.validation';
import {
  createParentProfile,
  getParentProfile,
  linkChild,
  getChildren,
  getMyChildren,
  createMatchReport,
  getMatchReports,
  switchProfile,
  switchToParent,
} from './parent.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

router.post(
  '/switch-profile',
  auth('GUARDIAN', 'SUPER_ADMIN'),
  validateRequest(switchProfileZodSchema),
  switchProfile,
);

router.post('/switch-to-parent', auth('PLAYER', 'GUARDIAN', 'SUPER_ADMIN'), switchToParent);

router.post('/switch-back', auth('PLAYER', 'GUARDIAN', 'SUPER_ADMIN'), switchToParent);

router.get('/my-children', auth('GUARDIAN', 'SUPER_ADMIN'), getMyChildren);

router.post(
  '/link-child',
  auth('SUPER_ADMIN', 'GUARDIAN'),
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
router.get('/:id', getParentProfile);

router.post(
  '/:parentId/children',
  auth('SUPER_ADMIN', 'GUARDIAN'),
  validateRequest(linkChildZodSchema),
  linkChild,
);
router.get('/:parentId/children', auth('SUPER_ADMIN', 'GUARDIAN'), getChildren);

router.post(
  '/:parentId/reports',
  auth('SUPER_ADMIN', 'GUARDIAN'),
  validateRequest(createParentMatchReportZodSchema),
  createMatchReport,
);
router.get('/:parentId/reports', auth('SUPER_ADMIN', 'GUARDIAN'), getMatchReports);

export const ParentRoutes = router;
