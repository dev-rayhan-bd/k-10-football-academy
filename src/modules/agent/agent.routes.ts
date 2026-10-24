import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import { createAgentProfileZodSchema, createSuccessStoryZodSchema } from './agent.validation';
import {
  createAgentProfile,
  getMyAgentProfile,
  updateMyAgentProfile,
  getAgentProfile,
  uploadVerificationDoc,
  getVerificationDocs,
  createSuccessStory,
  getSuccessStories,
} from './agent.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

// ==========================================
// 1. AGENT PROFILE & CREDENTIALS
// ==========================================
router.get('/profile', auth('AGENT', 'SUPER_ADMIN'), getMyAgentProfile);
router.patch('/profile', auth('AGENT', 'SUPER_ADMIN'), upload.any() as any, updateMyAgentProfile);

router.get('/agent-profile', auth('AGENT', 'SUPER_ADMIN'), getMyAgentProfile);
router.patch(
  '/agent-profile',
  auth('AGENT', 'SUPER_ADMIN'),
  upload.any() as any,
  updateMyAgentProfile,
);

router.post(
  '/',
  auth(),
  upload.any() as any,
  validateRequest(createAgentProfileZodSchema),
  createAgentProfile,
);

// ==========================================
// 2. DOCUMENT UPLOADS FOR VERIFICATION
// ==========================================
router.post('/documents', auth('AGENT', 'SUPER_ADMIN'), upload.any() as any, uploadVerificationDoc);
router.get('/documents', auth('AGENT', 'SUPER_ADMIN'), getVerificationDocs);

router.post(
  '/:agentId/documents',
  auth('SUPER_ADMIN', 'AGENT'),
  upload.any() as any,
  uploadVerificationDoc,
);
router.get('/:agentId/documents', auth('SUPER_ADMIN', 'AGENT'), getVerificationDocs);

// ==========================================
// 3. SUCCESS STORIES
// ==========================================
router.post(
  '/success-stories',
  auth('SUPER_ADMIN', 'AGENT', 'COACH'),
  validateRequest(createSuccessStoryZodSchema),
  createSuccessStory,
);
router.get('/success-stories', getSuccessStories);

// Profile by ID
router.get('/:id', getAgentProfile);

export const AgentRoutes = router;
