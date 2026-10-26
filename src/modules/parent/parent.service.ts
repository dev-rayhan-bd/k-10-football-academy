import { IParentProfile } from './parent.interface';
import { parentProfileService } from './services/parent-profile.service';
import { parentChildrenService } from './services/parent-children.service';
import { parentMatchReportService } from './services/parent-match-report.service';
import { parentTrainingService } from './services/parent-training.service';
import { parentOverviewService } from './services/parent-overview.service';

/**
 * Enterprise Facade: ParentService
 * Delegates directly to domain subservices while maintaining 100% identical public signatures and responses.
 */
export class ParentService {
  // --- ParentProfileService Delegates ---

  async switchProfile(parentId: string, childUserId: string) {
    return await parentProfileService.switchProfile(parentId, childUserId);
  }

  async switchToParent(
    childUserId: string,
    targetParentUserId?: string,
    tokenParentUserId?: string,
  ) {
    return await parentProfileService.switchToParent(
      childUserId,
      targetParentUserId,
      tokenParentUserId,
    );
  }

  async createProfile(payload: Partial<IParentProfile>) {
    return await parentProfileService.createProfile(payload);
  }

  async getProfileById(id: string) {
    return await parentProfileService.getProfileById(id);
  }

  async getAllParents(query: any = {}) {
    return await parentProfileService.getAllParents(query);
  }

  // --- ParentChildrenService Delegates ---

  async linkChild(
    parentId: string,
    payload: {
      childPlayerId?: string;
      childUserId?: string;
      relationshipType: 'FATHER' | 'MOTHER' | 'GUARDIAN';
    },
  ) {
    return await parentChildrenService.linkChild(parentId, payload);
  }

  async createChild(parentId: string, payload: any) {
    return await parentChildrenService.createChild(parentId, payload);
  }

  async getChildren(parentId: string) {
    return await parentChildrenService.getChildren(parentId);
  }

  // --- ParentMatchReportService Delegates ---

  async createMatchReport(parentId: string, payload: any, user?: any) {
    return await parentMatchReportService.createMatchReport(parentId, payload, user);
  }

  async getMatchReports(parentId: string) {
    return await parentMatchReportService.getMatchReports(parentId);
  }

  async requestMatchReportReview(
    parentId: string,
    reportId: string,
    payload: any = {},
    user?: any,
  ) {
    return await parentMatchReportService.requestMatchReportReview(
      parentId,
      reportId,
      payload,
      user,
    );
  }

  async verifyMatchReportPayment(sessionId?: string, reportId?: string) {
    return await parentMatchReportService.verifyMatchReportPayment(sessionId, reportId);
  }

  async finalizePaidParentMatchReport(reportId: string, transactionId?: string) {
    return await parentMatchReportService.finalizePaidParentMatchReport(reportId, transactionId);
  }

  // --- ParentTrainingService Delegates ---

  async getChildTrainingSessions(
    userId: string,
    query: {
      childPlayerId?: string;
      date?: string;
      upcomingOnly?: string;
      pastOnly?: string;
      type?: string;
      page?: string | number;
      limit?: string | number;
    } = {},
  ) {
    return await parentTrainingService.getChildTrainingSessions(userId, query);
  }

  async submitParentRsvp(
    userId: string,
    sessionId: string,
    payload: {
      childPlayerId?: string;
      rsvpStatus: string;
      notes?: string;
    },
  ) {
    return await parentTrainingService.submitParentRsvp(userId, sessionId, payload);
  }

  // --- ParentOverviewService Delegates ---

  async getParentOverview(userId: string, query: { childPlayerId?: string } = {}) {
    return await parentOverviewService.getParentOverview(userId, query);
  }
}

export const parentService = new ParentService();
