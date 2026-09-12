import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createCoachProfileZodSchema,
  updateCoachProfileZodSchema,
  createTacticalFormationZodSchema,
  createCoachTestimonialZodSchema,
} from './coach.validation';
import {
  createCoachProfile,
  getCoachProfile,
  getAllCoachProfiles,
  updateCoachProfile,
  saveTacticalFormation,
  getTacticalFormations,
  addTestimonial,
  getTestimonials,
} from './coach.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

router.post(
  '/',
  auth(),
  upload.any() as any,
  validateRequest(createCoachProfileZodSchema),
  createCoachProfile,
);
router.get('/', getAllCoachProfiles);
router.get('/:id', getCoachProfile);
router.patch(
  '/:id',
  auth(),
  upload.any() as any,
  validateRequest(updateCoachProfileZodSchema),
  updateCoachProfile,
);

router.post(
  '/:coachId/formations',
  auth('SUPER_ADMIN', 'COACH'),
  validateRequest(createTacticalFormationZodSchema),
  saveTacticalFormation,
);
router.get('/:coachId/formations', getTacticalFormations);

router.post(
  '/:coachId/testimonials',
  auth(),
  validateRequest(createCoachTestimonialZodSchema),
  addTestimonial,
);
router.get('/:coachId/testimonials', getTestimonials);

export const CoachRoutes = router;
