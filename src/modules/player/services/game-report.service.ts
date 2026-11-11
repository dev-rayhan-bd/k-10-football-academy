import { parseTimerInput } from './game-report/game-report.utils';
import { gameReportSelfService } from './game-report/game-report-self.service';
import { gameReportPaymentService } from './game-report/game-report-payment.service';
import { gameReportCoachService } from './game-report/game-report-coach.service';
import { gameReportQueryService } from './game-report/game-report-query.service';
import { gameReportAccessLinkService } from './game-report/game-report-access-link.service';

// Export parseTimerInput for external callers (such as player-match.service.ts)
export { parseTimerInput };

/**
 * GameReportService Facade
 * Orchestrates sub-modules: Self Service, Payment/Stripe Service, Coach Review Service, and Query Service.
 * Preserves 100% backward compatibility with all existing controllers, routes, and services.
 */
export class GameReportService {
  /**
   * Flow 1: "I Will Complete It" (Player submits all steps 1-5 directly)
   */
  async createSelfGameReport(userId: string, payload: any, currentUser?: any) {
    return gameReportSelfService.createSelfGameReport(userId, payload, currentUser);
  }

  /**
   * Flow 1 - Step 2: Parent / Player submits 36 performance indicators after payment ($3.99)
   */
  async completeSelfGameReport(userId: string, reportId: string, payload: any, currentUser?: any) {
    return gameReportSelfService.completeSelfGameReport(userId, reportId, payload, currentUser);
  }

  /**
   * Flow 2 - Step A: "Request From Coach" (Screen 1 & 2 + Coach Selection & $3.99 Payment checkout session)
   */
  async requestCoachGameReport(userId: string, payload: any) {
    return gameReportPaymentService.requestCoachGameReport(userId, payload);
  }

  /**
   * Finalize Paid Game Report (Called by Stripe Webhook and Payment Verification endpoint)
   */
  async finalizePaidGameReport(reportId: string, transactionId?: string) {
    return gameReportPaymentService.finalizePaidGameReport(reportId, transactionId);
  }

  /**
   * Handle Stripe Webhook Events
   */
  async handleStripeWebhook(event: any) {
    return gameReportPaymentService.handleStripeWebhook(event);
  }

  /**
   * Verify Payment Session (Real-time check directly from Stripe API)
   */
  async verifyPayment(sessionId?: string, reportId?: string) {
    return gameReportPaymentService.verifyPayment(sessionId, reportId);
  }

  /**
   * Flow 2 - Step B: Coach Completes Match Report (Screen 3, 4, 5 with 24 counters and markers)
   */
  async completeCoachGameReport(reportId: string, coachUser: any, payload: any) {
    return gameReportCoachService.completeCoachGameReport(reportId, coachUser, payload);
  }

  /**
   * Action on Game Report Request (Accept, Reject, Schedule, Cancel)
   */
  async updateGameReportStatus(reportId: string, user: any, payload: any) {
    return gameReportCoachService.updateGameReportStatus(reportId, user, payload);
  }

  /**
   * Get Reports Assigned to Coach for Evaluation
   */
  async getCoachPendingReports(coachEmail: string, query: Record<string, unknown> = {}) {
    return gameReportCoachService.getCoachPendingReports(coachEmail, query);
  }

  /**
   * Get Coach Game Reports Dashboard (Screen: Game Reports with 4 Cards & Table)
   */
  async getCoachAllGameReports(
    coachUser: { userId: string; email: string },
    query: Record<string, unknown> = {},
  ) {
    return gameReportCoachService.getCoachAllGameReports(coachUser, query);
  }

  /**
   * Get Player's Game Reports with Stats Cards, Filtering (ALL, PAID, PENDING), and Pagination
   */
  async getPlayerGameReports(
    userIdOrPlayerId: string,
    query: {
      page?: number | string;
      limit?: number | string;
      status?: string;
      filter?: string;
      searchTerm?: string;
    },
  ) {
    return gameReportQueryService.getPlayerGameReports(userIdOrPlayerId, query);
  }

  /**
   * Get Specific Game Report Details for Side Drawer
   */
  async getGameReportDetails(userIdOrPlayerId: string, reportId: string) {
    return gameReportQueryService.getGameReportDetails(userIdOrPlayerId, reportId);
  }

  /**
   * Option B: View Game Report by Secure Token (Zero account required for external evaluator)
   */
  async getReportByAccessLink(token: string) {
    return gameReportAccessLinkService.getReportByToken(token);
  }

  /**
   * Option B: External Evaluator Responds (ACCEPT or REJECT)
   */
  async respondToAccessLink(token: string, payload: any) {
    return gameReportAccessLinkService.respondToAccessLink(token, payload);
  }

  /**
   * Option B: External Evaluator Submits 36 Performance Indicators (Generates PDF + CV Integration)
   */
  async submitReportByAccessLink(token: string, payload: any) {
    return gameReportAccessLinkService.submitReportByToken(token, payload);
  }

  /**
   * Re-assign Rejected Game Report to another Coach / Person WITHOUT extra payment ($0 charge)
   */
  async reassignGameReport(userId: string, reportId: string, payload: any) {
    return gameReportAccessLinkService.reassignGameReport(userId, reportId, payload);
  }
}

export const gameReportService = new GameReportService();
