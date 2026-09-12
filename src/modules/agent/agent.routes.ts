import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createAgentProfileZodSchema,
  uploadVerificationDocZodSchema,
  createSuccessStoryZodSchema,
} from './agent.validation';
import {
  createAgentProfile,
  getAgentProfile,
  uploadVerificationDoc,
  getVerificationDocs,
  createSuccessStory,
  getSuccessStories,
} from './agent.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

router.post(
  '/',
  auth(),
  upload.any() as any,
  validateRequest(createAgentProfileZodSchema),
  createAgentProfile,
);
router.get('/:id', getAgentProfile);

router.post(
  '/:agentId/documents',
  auth('SUPER_ADMIN', 'AGENT'),
  upload.any() as any,
  validateRequest(uploadVerificationDocZodSchema),
  uploadVerificationDoc,
);
router.get('/:agentId/documents', auth('SUPER_ADMIN', 'AGENT'), getVerificationDocs);

router.post(
  '/success-stories',
  auth('SUPER_ADMIN', 'AGENT', 'COACH'),
  validateRequest(createSuccessStoryZodSchema),
  createSuccessStory,
);
router.get('/success-stories', getSuccessStories);

export const AgentRoutes = router;
