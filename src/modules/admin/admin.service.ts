/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRole } from '@/modules/user/user.interface';
import {
  IAdminListQuery,
  IAdminPaymentQuery,
  IAdminAnalyticsQuery,
  IAdminDashboardQuery,
} from './services/admin.utils';
import { adminMonitoringService } from './services/admin-monitoring.service';
import { adminUserActionsService } from './services/admin-user-actions.service';
import { adminMembershipService } from './services/admin-membership.service';
import { adminApprovalsService } from './services/admin-approvals.service';
import { adminPaymentsService } from './services/admin-payments.service';
import { adminAnalyticsService } from './services/admin-analytics.service';
import { adminDashboardService } from './services/admin-dashboard.service';

export { IAdminListQuery, IAdminPaymentQuery, IAdminAnalyticsQuery, IAdminDashboardQuery };

/**
 * Enterprise Facade: AdminService
 * Delegates cleanly to focused domain sub-services:
 * - AdminMonitoringService (Players, Coaches, Academies, Agents, Clubs)
 * - AdminUserActionsService (View Details, Block/Unblock, Delete User & Profile)
 * - AdminMembershipService (Membership Plans & Direct Premium Grants)
 * - AdminApprovalsService (Agent/Club Registration Approvals & Unified Success Stories)
 * - AdminPaymentsService (Platform Revenue, Subscriptions, Game Reports, Commissions & Spend Ledger)
 */
export class AdminService {
  // --- 0. Super Admin Central Dashboard ---
  async getDashboard(query: IAdminDashboardQuery) {
    return adminDashboardService.getDashboard(query);
  }

  // --- 1. Platform Entity Monitoring Tables ---
  async getPlayers(query: IAdminListQuery) {
    return adminMonitoringService.getPlayers(query);
  }

  async getCoaches(query: IAdminListQuery) {
    return adminMonitoringService.getCoaches(query);
  }

  async getAcademies(query: IAdminListQuery) {
    return adminMonitoringService.getAcademies(query);
  }

  async getAgents(query: IAdminListQuery) {
    return adminMonitoringService.getAgents(query);
  }

  async getClubs(query: IAdminListQuery) {
    return adminMonitoringService.getClubs(query);
  }

  // --- 2. Universal User & Entity Row Actions ---
  async resolveTargetById(id: string) {
    return adminUserActionsService.resolveTargetById(id);
  }

  async getUserDetailsById(id: string) {
    return adminUserActionsService.getUserDetailsById(id);
  }

  async updateUserStatus(
    id: string,
    payload: {
      status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
      action?: 'BLOCK' | 'UNBLOCK' | 'ACTIVATE' | 'DEACTIVATE';
      isBlocked?: boolean;
      reason?: string;
    } = {},
    requester?: { userId: string; role: UserRole },
  ) {
    return adminUserActionsService.updateUserStatus(id, payload, requester);
  }

  async deleteUserAndProfile(id: string, requester?: { userId: string; role: UserRole }) {
    return adminUserActionsService.deleteUserAndProfile(id, requester);
  }

  // --- 3. Membership Plans & Direct Grants ---
  async getMembershipPlans(query: IAdminListQuery) {
    return adminMembershipService.getMembershipPlans(query);
  }

  async createMembershipPlan(payload: any) {
    return adminMembershipService.createMembershipPlan(payload);
  }

  async updateMembershipPlan(id: string, payload: any) {
    return adminMembershipService.updateMembershipPlan(id, payload);
  }

  async deleteMembershipPlan(id: string) {
    return adminMembershipService.deleteMembershipPlan(id);
  }

  async getMembershipGrants(query: IAdminListQuery) {
    return adminMembershipService.getMembershipGrants(query);
  }

  async grantMembership(
    payload: {
      userId: string;
      category?: string;
      userCategory?: string;
      duration?: string | number;
      membershipDuration?: string | number;
      startDate?: string;
      endDate?: string;
    },
    adminUserId?: string,
  ) {
    return adminMembershipService.grantMembership(payload, adminUserId);
  }

  async revokeMembershipGrant(id: string) {
    return adminMembershipService.revokeMembershipGrant(id);
  }

  // --- 4. Approvals (Agent & Club Registration) & Unified Success Stories ---
  async getApprovals(query: IAdminListQuery) {
    return adminApprovalsService.getApprovals(query);
  }

  async getApprovalDetailsById(id: string) {
    return adminApprovalsService.getApprovalDetailsById(id);
  }

  async decideApproval(
    id: string,
    payload: {
      status?: 'APPROVED' | 'REJECTED';
      action?: 'APPROVE' | 'REJECT';
      reviewNotes?: string;
      rejectionReason?: string;
      adminReviewNotes?: string;
    },
  ) {
    return adminApprovalsService.decideApproval(id, payload);
  }

  async getSuccessStories(query: IAdminListQuery) {
    return adminApprovalsService.getSuccessStories(query);
  }

  async getSuccessStoryById(storyId: string) {
    return adminApprovalsService.getSuccessStoryById(storyId);
  }

  async decideSuccessStory(
    storyId: string,
    payload: {
      status?: 'APPROVED' | 'REJECTED';
      action?: 'APPROVE' | 'REJECT';
      reviewNotes?: string;
      rejectionReason?: string;
      adminReviewNotes?: string;
    },
  ) {
    return adminApprovalsService.decideSuccessStory(storyId, payload);
  }

  // --- 5. Payments, Revenue, Commissions & Spend Ledger ---
  async getPayments(query: IAdminPaymentQuery) {
    return adminPaymentsService.getPayments(query);
  }

  async getPaymentById(id: string) {
    return adminPaymentsService.getPaymentById(id);
  }

  async createPayment(payload: any, adminUserId?: string) {
    return adminPaymentsService.createPayment(payload, adminUserId);
  }

  async updatePayment(id: string, payload: any, adminUserId?: string) {
    return adminPaymentsService.updatePayment(id, payload, adminUserId);
  }

  // --- 6. Platform Analytics (MongoDB $lookup & $facet Aggregation) ---
  async getAnalytics(query: IAdminAnalyticsQuery) {
    return adminAnalyticsService.getAnalytics(query);
  }
}

export const adminService = new AdminService();
