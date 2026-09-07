import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createAcademyProfileZodSchema,
  createTeamZodSchema,
  createGameReportZodSchema,
} from './academy.validation';
import {
  createAcademyProfile,
  getAcademyProfile,
  getAllAcademyProfiles,
  createTeam,
  getTeams,
  createGameReport,
  getGameReports,
} from './academy.controller';

const router = Router();

router.post('/', auth(), validateRequest(createAcademyProfileZodSchema), createAcademyProfile);
router.get('/', getAllAcademyProfiles);
router.get('/:id', getAcademyProfile);

router.post(
  '/:academyId/teams',
  auth('SUPER_ADMIN', 'ACADEMY'),
  validateRequest(createTeamZodSchema),
  createTeam,
);
router.get('/:academyId/teams', getTeams);

router.post(
  '/:academyId/reports',
  auth('SUPER_ADMIN', 'ACADEMY', 'COACH'),
  validateRequest(createGameReportZodSchema),
  createGameReport,
);
router.get('/:academyId/reports', getGameReports);

export const AcademyRoutes = router;
