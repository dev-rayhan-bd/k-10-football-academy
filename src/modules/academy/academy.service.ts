import { Types } from 'mongoose';
import { IAcademyProfile, ITeam, IGameReport, IPlayerEvaluation } from './academy.interface';
import { academyResolverService } from './services/academy-resolver.service';
import { academyTransferService } from './services/academy-transfer.service';
import { academyFinanceService } from './services/academy-finance.service';
import { academyProfileService } from './services/academy-profile.service';
import { academyTeamsService } from './services/academy-teams.service';
import { academyEvaluationsService } from './services/academy-evaluations.service';
import { academyCoachesService } from './services/academy-coaches.service';
import { academyParentsService } from './services/academy-parents.service';
import { academyMatchesService } from './services/academy-matches.service';
import { academyEventsService } from './services/academy-events.service';
import { academyMediaService } from './services/academy-media.service';
import { academyCvValidationService } from './services/academy-cv-validation.service';
import { academyDashboardService } from './services/academy-dashboard.service';

/**
 * Enterprise Facade: AcademyService
 * Delegates directly to domain subservices while maintaining 100% identical public signatures and responses.
 */
export class AcademyService {
  // --- Resolver Delegates ---
  async resolveAcademyProfile(identifier: string) {
    return academyResolverService.resolveAcademyProfile(identifier);
  }

  async resolveUserAcademy(user: any, academyIdentifier?: string) {
    return academyResolverService.resolveUserAcademy(user, academyIdentifier);
  }

  // --- Transfer Delegates ---
  async getTransferRequestsDashboard(user: any, academyIdentifier?: string) {
    return academyTransferService.getTransferRequestsDashboard(user, academyIdentifier);
  }
  async getTargetAcademiesForTransfer(user: any, academyIdentifier?: string) {
    return academyTransferService.getTargetAcademiesForTransfer(user, academyIdentifier);
  }
  async getMyAcademyPlayersForTransfer(user: any, academyIdentifier?: string) {
    return academyTransferService.getMyAcademyPlayersForTransfer(user, academyIdentifier);
  }
  async getTransferRequestById(id: string, user?: any) {
    return academyTransferService.getTransferRequestById(id, user);
  }
  async createTransferRequest(user: any, payload: any) {
    return academyTransferService.createTransferRequest(user, payload);
  }
  async respondToTransferRequest(
    id: string,
    user: any,
    status: 'APPROVED' | 'REJECTED',
    responseNote?: string,
  ) {
    return academyTransferService.respondToTransferRequest(id, user, status, responseNote);
  }

  // --- Finance Delegates ---
  async getFeesPayments(user: any, query: any = {}, academyIdentifier?: string) {
    return academyFinanceService.getFeesPayments(user, query, academyIdentifier);
  }
  async createFeePayment(user: any, payload: any, academyIdentifier?: string) {
    return academyFinanceService.createFeePayment(user, payload, academyIdentifier);
  }
  async updateFeePaymentStatus(
    paymentId: string,
    user: any,
    payload: any,
    academyIdentifier?: string,
  ) {
    return academyFinanceService.updateFeePaymentStatus(
      paymentId,
      user,
      payload,
      academyIdentifier,
    );
  }
  async getFeesPaymentsExport(user: any, query: any = {}, academyIdentifier?: string) {
    return academyFinanceService.getFeesPaymentsExport(user, query, academyIdentifier);
  }
  async getFinanceCommittee(user: any, query: any = {}, academyIdentifier?: string) {
    return academyFinanceService.getFinanceCommittee(user, query, academyIdentifier);
  }
  async createFinanceTransaction(user: any, payload: any, academyIdentifier?: string) {
    return academyFinanceService.createFinanceTransaction(user, payload, academyIdentifier);
  }
  async updateFinanceTransactionStatus(
    transactionId: string,
    user: any,
    payload: any,
    academyIdentifier?: string,
  ) {
    return academyFinanceService.updateFinanceTransactionStatus(
      transactionId,
      user,
      payload,
      academyIdentifier,
    );
  }

  // --- AcademyProfileService Delegates ---

  async createProfile(payload: Partial<IAcademyProfile>) {
    return await academyProfileService.createProfile(payload);
  }

  formatAcademyProfileResponse(profile: any) {
    return academyProfileService.formatAcademyProfileResponse(profile);
  }

  async getAcademyFeatureAccess(academyId: Types.ObjectId | string, currentPlan: string = 'FREE') {
    return await academyProfileService.getAcademyFeatureAccess(academyId, currentPlan);
  }

  async getProfileById(id: string) {
    return await academyProfileService.getProfileById(id);
  }

  async getMyProfile(userId: string) {
    return await academyProfileService.getMyProfile(userId);
  }

  async updateMyProfile(userId: string, payload: any) {
    return await academyProfileService.updateMyProfile(userId, payload);
  }

  async updateProfileById(id: string, payload: any, _updatingUserId?: string) {
    return await academyProfileService.updateProfileById(id, payload, _updatingUserId);
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    return await academyProfileService.getAllProfiles(query);
  }

  async upgradePlan(
    academyIdentifier: string,
    plan: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM',
    customMaxTeams?: number,
  ) {
    return await academyProfileService.upgradePlan(academyIdentifier, plan, customMaxTeams);
  }

  async activateAcademyPremiumPlan(academyId: string, transactionId?: string) {
    return await academyProfileService.activateAcademyPremiumPlan(academyId, transactionId);
  }

  async purchasePremiumPlan(
    academyIdentifier: string,
    _payload?: { plan?: string; paymentMethod?: string; price?: number },
  ) {
    return await academyProfileService.purchasePremiumPlan(academyIdentifier, _payload);
  }

  async createPlanCheckoutSession(
    academyIdentifier: string,
    payload?: { successUrl?: string; cancelUrl?: string; price?: number },
  ) {
    return await academyProfileService.createPlanCheckoutSession(academyIdentifier, payload);
  }

  async verifyStripePayment(sessionId: string) {
    return await academyProfileService.verifyStripePayment(sessionId);
  }

  async handleAcademyPlanStripeWebhook(eventObject: any) {
    return await academyProfileService.handleAcademyPlanStripeWebhook(eventObject);
  }

  // --- AcademyTeamsService Delegates ---

  async getCoachAndPlayersDashboard(academyIdentifier: string) {
    return await academyTeamsService.getCoachAndPlayersDashboard(academyIdentifier);
  }

  async getAvailableMembers(academyIdentifier: string) {
    return await academyTeamsService.getAvailableMembers(academyIdentifier);
  }

  async createTeam(
    academyIdentifier: string,
    payload: Partial<ITeam> & { coachIds?: string[]; playerIds?: string[] },
  ) {
    return await academyTeamsService.createTeam(academyIdentifier, payload);
  }

  async getTeams(academyIdentifier: string) {
    return await academyTeamsService.getTeams(academyIdentifier);
  }

  async getTeamById(teamId: string) {
    return await academyTeamsService.getTeamById(teamId);
  }

  async updateTeam(
    teamId: string,
    payload: Partial<ITeam> & { coachIds?: string[]; playerIds?: string[] },
  ) {
    return await academyTeamsService.updateTeam(teamId, payload);
  }

  async deleteTeam(teamId: string) {
    return await academyTeamsService.deleteTeam(teamId);
  }

  async getTeamRoster(teamId: string) {
    return await academyTeamsService.getTeamRoster(teamId);
  }

  async getAvailableCoachesForTeam(teamId: string, search?: string) {
    return await academyTeamsService.getAvailableCoachesForTeam(teamId, search);
  }

  async assignCoachToTeam(teamId: string, coachId: string, role?: string) {
    return await academyTeamsService.assignCoachToTeam(teamId, coachId, role);
  }

  async removeCoachFromTeam(teamId: string, coachId: string) {
    return await academyTeamsService.removeCoachFromTeam(teamId, coachId);
  }

  async getAvailablePlayersForTeam(teamId: string, search?: string) {
    return await academyTeamsService.getAvailablePlayersForTeam(teamId, search);
  }

  async assignPlayerToTeam(teamId: string, playerId: string) {
    return await academyTeamsService.assignPlayerToTeam(teamId, playerId);
  }

  async removePlayerFromTeam(teamId: string, playerId: string) {
    return await academyTeamsService.removePlayerFromTeam(teamId, playerId);
  }

  // --- AcademyEvaluationsService Delegates ---

  async createPlayerEvaluation(academyId: string, payload: Partial<IPlayerEvaluation>) {
    return await academyEvaluationsService.createPlayerEvaluation(academyId, payload);
  }

  async getPlayerEvaluations(academyId: string, playerId?: string) {
    return await academyEvaluationsService.getPlayerEvaluations(academyId, playerId);
  }

  async getAcademyPlayerEvaluationDashboard(
    academyIdentifier: string,
    query: Record<string, unknown> = {},
  ) {
    return await academyEvaluationsService.getAcademyPlayerEvaluationDashboard(
      academyIdentifier,
      query,
    );
  }

  async getAcademyPlayerEvaluationDetails(targetId: string, _academyIdentifier?: string) {
    return await academyEvaluationsService.getAcademyPlayerEvaluationDetails(
      targetId,
      _academyIdentifier,
    );
  }

  async getEvaluationDashboard(academyIdentifier: string) {
    return await academyEvaluationsService.getEvaluationDashboard(academyIdentifier);
  }

  async requestPlayerEvaluation(
    academyIdentifier: string,
    managerUserId: string,
    payload: { playerId: string; coachId: string; notes?: string },
  ) {
    return await academyEvaluationsService.requestPlayerEvaluation(
      academyIdentifier,
      managerUserId,
      payload,
    );
  }

  async sendEvaluationReminder(evaluationId: string, _managerUserId?: string) {
    return await academyEvaluationsService.sendEvaluationReminder(evaluationId, _managerUserId);
  }

  async submitPlayerEvaluation(
    evaluationId: string,
    coachUserId: string,
    payload: {
      technicalScore: number;
      physicalScore: number;
      mentalScore: number;
      overallRating?: number;
      coachFeedback?: string;
    },
  ) {
    return await academyEvaluationsService.submitPlayerEvaluation(
      evaluationId,
      coachUserId,
      payload,
    );
  }

  // --- AcademyCoachesService Delegates ---

  async inviteCoach(
    academyIdentifier: string,
    managerUserId: string,
    payload: { coachId?: string; coachEmail?: string; role?: string; message?: string },
  ) {
    return await academyCoachesService.inviteCoach(academyIdentifier, managerUserId, payload);
  }

  async requestCoachAffiliation(
    coachUserId: string,
    payload: { academyId: string; role?: string; message?: string },
  ) {
    return await academyCoachesService.requestCoachAffiliation(coachUserId, payload);
  }

  async getAcademyCoaches(academyIdentifier: string, status?: string) {
    return await academyCoachesService.getAcademyCoaches(academyIdentifier, status);
  }

  async getCoachAffiliations(coachUserId: string) {
    return await academyCoachesService.getCoachAffiliations(coachUserId);
  }

  async respondToCoachAffiliation(
    affiliationId: string,
    responderUserId: string,
    action: 'APPROVE' | 'REJECT',
    responseNote?: string,
  ) {
    return await academyCoachesService.respondToCoachAffiliation(
      affiliationId,
      responderUserId,
      action,
      responseNote,
    );
  }

  async removeCoachAffiliation(academyIdentifier: string, affiliationId: string) {
    return await academyCoachesService.removeCoachAffiliation(academyIdentifier, affiliationId);
  }

  // --- AcademyParentsService Delegates ---

  async getAcademyParents(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyParentsService.getAcademyParents(user, query, academyIdentifier);
  }

  async getAvailablePlayersForParentLinking(
    user: any,
    query: any = {},
    academyIdentifier?: string,
  ) {
    return await academyParentsService.getAvailablePlayersForParentLinking(
      user,
      query,
      academyIdentifier,
    );
  }

  async onboardParent(user: any, payload: any, academyIdentifier?: string) {
    return await academyParentsService.onboardParent(user, payload, academyIdentifier);
  }

  async getAcademyParentById(parentId: string, user: any, academyIdentifier?: string) {
    return await academyParentsService.getAcademyParentById(parentId, user, academyIdentifier);
  }

  async updateAcademyParent(parentId: string, user: any, payload: any, academyIdentifier?: string) {
    return await academyParentsService.updateAcademyParent(
      parentId,
      user,
      payload,
      academyIdentifier,
    );
  }

  async unlinkParentFromAcademy(parentId: string, user: any, academyIdentifier?: string) {
    return await academyParentsService.unlinkParentFromAcademy(parentId, user, academyIdentifier);
  }

  async linkPlayerToParent(
    parentId: string,
    playerId: string,
    relationship: string = 'Guardian',
    user?: any,
    academyIdentifier?: string,
  ) {
    return await academyParentsService.linkPlayerToParent(
      parentId,
      playerId,
      relationship,
      user,
      academyIdentifier,
    );
  }

  async unlinkPlayerFromParent(
    parentId: string,
    playerId: string,
    user?: any,
    academyIdentifier?: string,
  ) {
    return await academyParentsService.unlinkPlayerFromParent(
      parentId,
      playerId,
      user,
      academyIdentifier,
    );
  }

  // --- AcademyMatchesService Delegates ---

  async createGameReport(academyId: string, payload: Partial<IGameReport>) {
    return await academyMatchesService.createGameReport(academyId, payload);
  }

  async getGameReports(academyId: string) {
    return await academyMatchesService.getGameReports(academyId);
  }

  async getMatchesMeta(user: any, academyIdentifier?: string) {
    return await academyMatchesService.getMatchesMeta(user, academyIdentifier);
  }

  async getMatches(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyMatchesService.getMatches(user, query, academyIdentifier);
  }

  async getMatchById(id: string, user: any, academyIdentifier?: string) {
    return await academyMatchesService.getMatchById(id, user, academyIdentifier);
  }

  async createMatch(user: any, payload: any, academyIdentifier?: string) {
    return await academyMatchesService.createMatch(user, payload, academyIdentifier);
  }

  async updateMatch(id: string, user: any, payload: any, academyIdentifier?: string) {
    return await academyMatchesService.updateMatch(id, user, payload, academyIdentifier);
  }

  async deleteMatch(id: string, user: any, academyIdentifier?: string) {
    return await academyMatchesService.deleteMatch(id, user, academyIdentifier);
  }

  async getAcademyGameReportsDashboard(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyMatchesService.getAcademyGameReportsDashboard(
      user,
      query,
      academyIdentifier,
    );
  }

  // --- AcademyEventsService Delegates ---

  async getExtraEventsMeta(user: any, academyIdentifier?: string) {
    return await academyEventsService.getExtraEventsMeta(user, academyIdentifier);
  }

  async getExtraEvents(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyEventsService.getExtraEvents(user, query, academyIdentifier);
  }

  async getExtraEventById(id: string, user: any, academyIdentifier?: string) {
    return await academyEventsService.getExtraEventById(id, user, academyIdentifier);
  }

  async createExtraEvent(user: any, payload: any, academyIdentifier?: string) {
    return await academyEventsService.createExtraEvent(user, payload, academyIdentifier);
  }

  async updateExtraEvent(id: string, user: any, payload: any, academyIdentifier?: string) {
    return await academyEventsService.updateExtraEvent(id, user, payload, academyIdentifier);
  }

  async deleteExtraEvent(id: string, user: any, academyIdentifier?: string) {
    return await academyEventsService.deleteExtraEvent(id, user, academyIdentifier);
  }

  async registerForExtraEvent(
    id: string,
    user: any,
    participantData: any,
    academyIdentifier?: string,
  ) {
    return await academyEventsService.registerForExtraEvent(
      id,
      user,
      participantData,
      academyIdentifier,
    );
  }

  // --- AcademyMediaService Delegates ---

  async getSponsorsMeta(_user: any, _academyIdentifier?: string) {
    return await academyMediaService.getSponsorsMeta(_user, _academyIdentifier);
  }

  async getSponsors(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyMediaService.getSponsors(user, query, academyIdentifier);
  }

  async getSponsorById(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.getSponsorById(id, user, academyIdentifier);
  }

  async createSponsor(user: any, payload: any, academyIdentifier?: string) {
    return await academyMediaService.createSponsor(user, payload, academyIdentifier);
  }

  async updateSponsor(id: string, user: any, payload: any, academyIdentifier?: string) {
    return await academyMediaService.updateSponsor(id, user, payload, academyIdentifier);
  }

  async deleteSponsor(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.deleteSponsor(id, user, academyIdentifier);
  }

  async getAcademyNewsMeta(user: any, academyIdentifier?: string) {
    return await academyMediaService.getAcademyNewsMeta(user, academyIdentifier);
  }

  async getAcademyNews(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyMediaService.getAcademyNews(user, query, academyIdentifier);
  }

  async getAcademyNewsById(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.getAcademyNewsById(id, user, academyIdentifier);
  }

  async createAcademyNews(user: any, payload: any, academyIdentifier?: string) {
    return await academyMediaService.createAcademyNews(user, payload, academyIdentifier);
  }

  async updateAcademyNews(id: string, user: any, payload: any, academyIdentifier?: string) {
    return await academyMediaService.updateAcademyNews(id, user, payload, academyIdentifier);
  }

  async toggleNewsVisibility(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.toggleNewsVisibility(id, user, academyIdentifier);
  }

  async moveNewsToBin(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.moveNewsToBin(id, user, academyIdentifier);
  }

  async restoreNewsFromBin(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.restoreNewsFromBin(id, user, academyIdentifier);
  }

  async deleteNewsPermanently(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.deleteNewsPermanently(id, user, academyIdentifier);
  }

  async getSuccessStoriesMeta(user: any, academyIdentifier?: string) {
    return await academyMediaService.getSuccessStoriesMeta(user, academyIdentifier);
  }

  async getSuccessStories(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyMediaService.getSuccessStories(user, query, academyIdentifier);
  }

  async getSuccessStoryById(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.getSuccessStoryById(id, user, academyIdentifier);
  }

  async createSuccessStory(user: any, payload: any, academyIdentifier?: string) {
    return await academyMediaService.createSuccessStory(user, payload, academyIdentifier);
  }

  async updateSuccessStory(id: string, user: any, payload: any, academyIdentifier?: string) {
    return await academyMediaService.updateSuccessStory(id, user, payload, academyIdentifier);
  }

  async updateSuccessStoryStatus(
    id: string,
    user: any,
    status: string,
    rejectionReason?: string,
    academyIdentifier?: string,
  ) {
    return await academyMediaService.updateSuccessStoryStatus(
      id,
      user,
      status,
      rejectionReason,
      academyIdentifier,
    );
  }

  async deleteSuccessStory(id: string, user: any, academyIdentifier?: string) {
    return await academyMediaService.deleteSuccessStory(id, user, academyIdentifier);
  }

  // --- AcademyCvValidationService Delegates ---

  async getAcademyValidateCvDashboard(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyCvValidationService.getAcademyValidateCvDashboard(
      user,
      query,
      academyIdentifier,
    );
  }

  async notifyCoachForCvValidation(user: any, payload: any, academyIdentifier?: string) {
    return await academyCvValidationService.notifyCoachForCvValidation(
      user,
      payload,
      academyIdentifier,
    );
  }

  async getCvsLibrary(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyCvValidationService.getCvsLibrary(user, query, academyIdentifier);
  }

  async toggleLikePlayerCv(user: any, playerId: string, academyIdentifier?: string) {
    return await academyCvValidationService.toggleLikePlayerCv(user, playerId, academyIdentifier);
  }

  async sharePlayerCv(user: any, playerId: string, academyIdentifier?: string) {
    return await academyCvValidationService.sharePlayerCv(user, playerId, academyIdentifier);
  }

  async getPublicPlayerCv(playerId: string) {
    return await academyCvValidationService.getPublicPlayerCv(playerId);
  }

  // --- AcademyDashboardService Delegates ---

  async getAcademyAnalyticsReport(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyDashboardService.getAcademyAnalyticsReport(user, query, academyIdentifier);
  }

  async exportAcademyAnalyticsReport(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyDashboardService.exportAcademyAnalyticsReport(
      user,
      query,
      academyIdentifier,
    );
  }

  async getAcademyManagementDashboard(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyDashboardService.getAcademyManagementDashboard(
      user,
      query,
      academyIdentifier,
    );
  }

  async getAcademyPerformanceAnalytics(user: any, query: any = {}, academyIdentifier?: string) {
    return await academyDashboardService.getAcademyPerformanceAnalytics(
      user,
      query,
      academyIdentifier,
    );
  }
}

export const academyService = new AcademyService();
