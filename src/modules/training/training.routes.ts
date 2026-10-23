import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createTrainingSessionZodSchema,
  updateTrainingSessionZodSchema,
  saveAttendanceZodSchema,
} from './training.validation';
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
} from './training.controller';

const router = Router();

// Dropdowns for Modal
router.get('/form-meta', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getTrainingFormMeta);
router.get('/:academyId/form-meta', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getTrainingFormMeta);
router.get('/teams', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getTeamsDropdown);
router.get('/:academyId/teams', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getTeamsDropdown);
router.get('/coaches', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getCoachesDropdown);
router.get('/:academyId/coaches', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getCoachesDropdown);

// Session List / Grid (Screenshot 1)
router.get('/', auth('ACADEMY', 'COACH', 'SUPER_ADMIN', 'PLAYER', 'PARENT'), getTrainingSessions);
router.get(
  '/academy/:academyId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN', 'PLAYER', 'PARENT'),
  getTrainingSessions,
);
router.get(
  '/:academyId/sessions',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN', 'PLAYER', 'PARENT'),
  getTrainingSessions,
);

// Create Session (Screenshots 2, 3, 4)
router.post(
  '/',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(createTrainingSessionZodSchema),
  createTrainingSession,
);
router.post(
  '/:academyId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(createTrainingSessionZodSchema),
  createTrainingSession,
);

// Attendance Sheet & Save Attendance (Screenshot 5)
router.get('/:sessionId/attendance', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), getSessionAttendance);
router.put(
  '/:sessionId/attendance',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(saveAttendanceZodSchema),
  saveAttendance,
);
router.post(
  '/:sessionId/attendance',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(saveAttendanceZodSchema),
  saveAttendance,
);

// Session Details, Edit, Delete
router.get('/:sessionId', auth(), getTrainingSessionById);
router.patch(
  '/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(updateTrainingSessionZodSchema),
  updateTrainingSession,
);
router.put(
  '/:sessionId',
  auth('ACADEMY', 'COACH', 'SUPER_ADMIN'),
  validateRequest(updateTrainingSessionZodSchema),
  updateTrainingSession,
);
router.delete('/:sessionId', auth('ACADEMY', 'COACH', 'SUPER_ADMIN'), deleteTrainingSession);

export const TrainingRoutes = router;
