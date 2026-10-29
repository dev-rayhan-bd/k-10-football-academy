import { Router } from 'express';
import { auth } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validateRequest';
import { adminController } from './admin.controller';
import { AdminValidation } from './admin.validation';

const router = Router();

// Strictly restrict all Super Admin / Admin management endpoints
router.use(auth('SUPER_ADMIN', 'ADMIN'));

// 0. Super Admin Central Dashboard
router.get('/dashboard', adminController.getDashboard);

// 1. Platform Entity Monitoring Tables
router.get('/players', adminController.getPlayers);
router.get('/coaches', adminController.getCoaches);
router.get('/academies', adminController.getAcademies);
router.get('/agents', adminController.getAgents);
router.get('/clubs', adminController.getClubs);

// 2. Universal Row Actions (View Details, Block/Unblock Status, Delete User & Profile)
router.get('/users/:id', adminController.getUserDetails);
router.patch(
  '/users/:id/status',
  validateRequest(AdminValidation.updateUserStatusZodSchema),
  adminController.updateUserStatus,
);
router.delete('/users/:id', adminController.deleteUser);

// 3. Membership Plans Management (Add Plan, List Plans, Edit Plan / Deactivate, Delete Plan)
router.get('/membership-plans', adminController.getMembershipPlans);
router.post(
  '/membership-plans',
  validateRequest(AdminValidation.createMembershipPlanZodSchema),
  adminController.createMembershipPlan,
);
router.patch(
  '/membership-plans/:id',
  validateRequest(AdminValidation.updateMembershipPlanZodSchema),
  adminController.updateMembershipPlan,
);
router.delete('/membership-plans/:id', adminController.deleteMembershipPlan);

// 4. Grant Membership Management (Grant Premium Access, Active Grants + Dropdown Users, Revoke Grant)
router.get('/membership-grants', adminController.getMembershipGrants);
router.post(
  '/membership-grants',
  validateRequest(AdminValidation.grantMembershipZodSchema),
  adminController.grantMembership,
);
router.delete('/membership-grants/:id', adminController.revokeMembershipGrant);

// 5. Approvals & Verifications (Agents & Clubs Registration Applications)
router.get('/approvals', adminController.getApprovals);
router.get('/approvals/:id', adminController.getApprovalDetails);
router.patch(
  '/approvals/:id',
  validateRequest(AdminValidation.reviewDecisionZodSchema),
  adminController.decideApproval,
);

// 6. Success Stories Management (Unified across Academies, Agents, Clubs)
router.get('/success-stories', adminController.getSuccessStories);
router.get('/success-stories/:id', adminController.getSuccessStoryDetails);
router.patch(
  '/success-stories/:id',
  validateRequest(AdminValidation.reviewDecisionZodSchema),
  adminController.decideSuccessStory,
);

// 7. Platform Payments, Revenue, Commission & Spend Ledger
router.get('/payments', adminController.getPayments);
router.get('/payments/:id', adminController.getPaymentDetails);
router.post(
  '/payments',
  validateRequest(AdminValidation.createPaymentZodSchema),
  adminController.createPayment,
);
router.patch(
  '/payments/:id',
  validateRequest(AdminValidation.updatePaymentZodSchema),
  adminController.updatePayment,
);

// 8. Platform Analytics (Top Cards, User Growth by Role, Role Distribution, Revenue Breakdown)
router.get('/analytics', adminController.getAnalytics);

export const AdminRoutes = router;
