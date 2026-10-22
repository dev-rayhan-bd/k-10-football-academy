import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth, optionalAuth } from '@/middlewares/auth.middleware';
import { upload } from '@/middlewares/multer';
import {
  createCoachProfileZodSchema,
  updateCoachProfileZodSchema,
  createCoachTestimonialZodSchema,
  updateCoachTestimonialZodSchema,
} from './coach.validation';
import {
  getMyCoachCV,
  getCoachCV,
  createCoachProfile,
  getMyCoachProfile,
  getCoachProfile,
  getAllCoachProfiles,
  updateMyCoachProfile,
  updateCoachProfile,
  requestRevalidation,
  deleteMyClub,
  getMyDocuments,
  uploadMyDocument,
  deleteMyDocument,
  getMyTestimonials,
  addMyTestimonial,
  updateMyTestimonial,
  deleteMyTestimonial,
  getTacticalFormations,
  getTestimonials,
  addTestimonial,
  validatePlayerCV,
} from './coach.controller';

const router = Router();

// ==========================================
// 1. ROOT & LISTING (PUBLIC / QUERYBUILDER)
// ==========================================
router.post(
  '/',
  auth(),
  upload.any() as any,
  validateRequest(createCoachProfileZodSchema),
  createCoachProfile,
);
router.get('/', getAllCoachProfiles);

// ==========================================
// PLAYER CV VALIDATION BY REGISTERED COACH
// ==========================================
router.post('/players/:playerId/validate-cv', auth('COACH', 'SUPER_ADMIN'), validatePlayerCV);
router.post('/validate-player-cv', auth('COACH', 'SUPER_ADMIN'), validatePlayerCV);

// ==========================================
// 2. COACH CV & UNIFIED PROFILE (LIKE PLAYER CV)
// ==========================================
router.get('/me/cv', auth(), getMyCoachCV);
router.get('/my-cv', auth(), getMyCoachCV);
router.get('/my-profile', auth('COACH', 'SUPER_ADMIN'), getMyCoachProfile);
router.get('/me', auth(), getMyCoachProfile);

// Unified PATCH for profile & CV sections
router.patch(
  '/me',
  auth(),
  upload.any() as any,
  validateRequest(updateCoachProfileZodSchema),
  updateMyCoachProfile,
);

router.post('/me/revalidation', auth(), requestRevalidation);

// Club item delete
router.delete('/me/clubs/:clubId', auth(), deleteMyClub);

// ==========================================
// 3. CERTIFICATES & DOCUMENTS (DEDICATED CRUD)
// ==========================================
router.get('/me/documents', auth(), getMyDocuments);
router.post('/me/documents', auth(), upload.any() as any, uploadMyDocument);
router.delete('/me/documents/:docId', auth(), deleteMyDocument);

// ==========================================
// 4. TESTIMONIALS (DEDICATED CRUD)
// ==========================================
router.get('/me/testimonials', auth(), getMyTestimonials);
router.post(
  '/me/testimonials',
  auth(),
  upload.any() as any,
  validateRequest(createCoachTestimonialZodSchema),
  addMyTestimonial,
);
router.patch(
  '/me/testimonials/:testimonialId',
  auth(),
  upload.any() as any,
  validateRequest(updateCoachTestimonialZodSchema),
  updateMyTestimonial,
);
router.delete('/me/testimonials/:testimonialId', auth(), deleteMyTestimonial);

// ==========================================
// 5. PUBLIC / ID-BASED ROUTES
// ==========================================
router.get('/:id/cv', optionalAuth(), getCoachCV);
router.get('/:id', optionalAuth(), getCoachProfile);
router.patch(
  '/:id',
  auth(),
  upload.any() as any,
  validateRequest(updateCoachProfileZodSchema),
  updateCoachProfile,
);

// Backward-compatible formation & testimonial endpoints
router.get('/:coachId/formations', getTacticalFormations);
router.get('/:coachId/testimonials', getTestimonials);
router.post(
  '/:coachId/testimonials',
  auth(),
  upload.any() as any,
  validateRequest(createCoachTestimonialZodSchema),
  addTestimonial,
);

export const CoachRoutes = router;
