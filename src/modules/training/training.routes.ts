import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import { createTrainingSessionZodSchema, updateAttendanceZodSchema } from './training.validation';
import {
  createTrainingSession,
  getTrainingSessions,
  markAttendance,
  getSessionAttendance,
} from './training.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

router.post(
  '/',
  auth('SUPER_ADMIN', 'ACADEMY', 'COACH'),
  upload.any() as any,
  validateRequest(createTrainingSessionZodSchema),
  createTrainingSession,
);
router.get('/academy/:academyId', getTrainingSessions);

router.post(
  '/:sessionId/attendance',
  auth(),
  validateRequest(updateAttendanceZodSchema),
  markAttendance,
);
router.get('/:sessionId/attendance', auth(), getSessionAttendance);

export const TrainingRoutes = router;
