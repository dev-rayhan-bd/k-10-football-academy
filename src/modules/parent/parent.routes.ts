import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createParentProfileZodSchema,
  linkChildZodSchema,
  createParentMatchReportZodSchema,
} from './parent.validation';
import {
  createParentProfile,
  getParentProfile,
  linkChild,
  getChildren,
  createMatchReport,
  getMatchReports,
} from './parent.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

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
