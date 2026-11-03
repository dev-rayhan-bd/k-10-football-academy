import { Router } from 'express';
import { cmsController } from './cms.controller';
import { auth } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validateRequest';
import { savePolicyZodSchema } from './cms.validation';

const router = Router();

// ==========================================
// Public CMS Policy Endpoints (For Mobile / Web / Portal)
// ==========================================

// Get list of all current active policies
router.get('/policies', cmsController.getAllActivePolicies);

// Get single active policy by type or slug (e.g. TERMS_AND_CONDITIONS, PRIVACY_POLICY, terms-and-conditions)
router.get('/policies/:type', cmsController.getActivePolicy);

// Get specific archived/historical version of a policy
router.get('/policies/:type/version/:version', cmsController.getPolicyVersion);

// ==========================================
// Super Admin / Admin Policy Management Endpoints
// ==========================================

// List all policy documents with filtering and pagination
router.get('/admin/policies', auth('SUPER_ADMIN', 'ADMIN'), cmsController.adminGetAllPolicies);

// Get single policy document by Type or ID (Always returns the latest updated version by default; or specific version if ?version=... is provided)
router.get('/admin/policies/:type', auth('SUPER_ADMIN', 'ADMIN'), cmsController.adminGetPolicy);

// Single Canonical Endpoint to Save or Publish Policy:
// - isMajorUpdate: false -> In-place update for typo/minor edits (No new version)
// - isMajorUpdate: true  -> Major version release (1.0 -> 2.0)
router.post(
  '/admin/policies',
  auth('SUPER_ADMIN', 'ADMIN'),
  validateRequest(savePolicyZodSchema),
  cmsController.adminSavePolicy,
);

// Delete policy document (Draft / Non-current versions only)
router.delete('/admin/policies/:id', auth('SUPER_ADMIN', 'ADMIN'), cmsController.adminDeletePolicy);

export const CmsRoutes = router;
