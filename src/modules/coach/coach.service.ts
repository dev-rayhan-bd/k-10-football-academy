import {
  ICoachProfile,
  ITacticalFormation,
  ICoachTestimonial,
  ICoachAnalyticsResponse,
} from './coach.interface';
import { coachCvService } from './services/coach-cv.service';
import { coachProfileService } from './services/coach-profile.service';
import { coachCvValidationService } from './services/coach-cv-validation.service';
import { coachAnalyticsService } from './services/coach-analytics.service';
import { coachSquadService } from './services/coach-squad.service';
import { coachEvaluationsService } from './services/coach-evaluations.service';

/**
 * Enterprise Facade: CoachService
 * Delegates directly to domain subservices while maintaining 100% identical public signatures and responses.
 */
export class CoachService {
  // --- CV Delegates ---
  async getCoachCV(id: string, viewer?: { userId?: string; role?: string }) {
    return coachCvService.getCoachCV(id, viewer);
  }

  async getMyCV(userId: string) {
    return coachCvService.getCoachCV('me', { userId });
  }

  // --- CoachProfileService Delegates ---

  async createProfile(payload: Partial<ICoachProfile>) {
    return await coachProfileService.createProfile(payload);
  }

  async getProfileById(id: string) {
    return await coachProfileService.getProfileById(id);
  }

  async getMyProfile(userId: string) {
    return await coachProfileService.getMyProfile(userId);
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    return await coachProfileService.getAllProfiles(query);
  }

  async updateProfile(identifier: string, rawPayload: any) {
    return await coachProfileService.updateProfile(identifier, rawPayload);
  }

  async updateMyProfile(userId: string, payload: any) {
    return await coachProfileService.updateMyProfile(userId, payload);
  }

  async requestRevalidation(identifier: string) {
    return await coachProfileService.requestRevalidation(identifier);
  }

  async deleteClub(identifier: string, clubId: string) {
    return await coachProfileService.deleteClub(identifier, clubId);
  }

  async getDocuments(identifier: string) {
    return await coachProfileService.getDocuments(identifier);
  }

  async addDocument(
    identifier: string,
    payload: { title: string; fileUrl: string; fileType?: string },
  ) {
    return await coachProfileService.addDocument(identifier, payload);
  }

  async deleteDocument(identifier: string, docId: string) {
    return await coachProfileService.deleteDocument(identifier, docId);
  }

  async getTestimonials(identifier: string) {
    return await coachProfileService.getTestimonials(identifier);
  }

  async addTestimonial(identifier: string, payload: Partial<ICoachTestimonial>) {
    return await coachProfileService.addTestimonial(identifier, payload);
  }

  async updateTestimonial(
    identifier: string,
    testimonialId: string,
    payload: Partial<ICoachTestimonial>,
  ) {
    return await coachProfileService.updateTestimonial(identifier, testimonialId, payload);
  }

  async deleteTestimonial(identifier: string, testimonialId: string) {
    return await coachProfileService.deleteTestimonial(identifier, testimonialId);
  }

  async getTacticalFormations(coachId: string) {
    return await coachProfileService.getTacticalFormations(coachId);
  }

  async saveTacticalFormation(coachId: string, payload: Partial<ITacticalFormation>) {
    return await coachProfileService.saveTacticalFormation(coachId, payload);
  }

  // --- CoachCvValidationService Delegates ---

  async validatePlayerCV(
    coachUserId: string,
    playerId: string,
    payload: {
      physicalSkills?: Record<string, number>;
      technicalSkills?: Record<string, number>;
      attributes?: Record<string, number>;
      coachFeedback?: string;
      certificateNote?: string;
    },
  ) {
    return await coachCvValidationService.validatePlayerCV(coachUserId, playerId, payload);
  }

  async getPlayerCvValidationsDashboard(userId: string, query: Record<string, unknown> = {}) {
    return await coachCvValidationService.getPlayerCvValidationsDashboard(userId, query);
  }

  // --- CoachAnalyticsService Delegates ---

  async getCoachAnalytics(coachIdentifier: string): Promise<ICoachAnalyticsResponse> {
    return await coachAnalyticsService.getCoachAnalytics(coachIdentifier);
  }

  // --- CoachSquadService Delegates ---

  async getMyTeamsSquad(userId: string, query: Record<string, unknown> = {}) {
    return await coachSquadService.getMyTeamsSquad(userId, query);
  }

  async tickPlayerAttendance(
    userId: string,
    payload: {
      playerId: string;
      sessionId?: string;
      teamId?: string;
      date?: string;
      isIn?: boolean;
      status?: 'PRESENT' | 'LATE' | 'ABSENT' | 'UNMARKED' | 'EXCUSED';
      time?: string;
      notes?: string;
    },
  ) {
    return await coachSquadService.tickPlayerAttendance(userId, payload);
  }

  async bulkUpdateCoachAttendance(
    userId: string,
    payload: {
      sessionId?: string;
      teamId?: string;
      date?: string;
      markAll?: 'PRESENT' | 'ABSENT' | 'CLEAR' | 'UNMARKED';
      attendances?: Array<{
        playerId: string;
        isIn?: boolean;
        status?: 'PRESENT' | 'LATE' | 'ABSENT' | 'UNMARKED' | 'EXCUSED';
        notes?: string;
        time?: string;
      }>;
    },
  ) {
    return await coachSquadService.bulkUpdateCoachAttendance(userId, payload);
  }

  async getCoachTrainingSessions(userId: string, query: Record<string, unknown> = {}) {
    return await coachSquadService.getCoachTrainingSessions(userId, query);
  }

  async updatePlayerFitnessStatus(userId: string, playerId: string, status: 'ACTIVE' | 'INJURED') {
    return await coachSquadService.updatePlayerFitnessStatus(userId, playerId, status);
  }

  // --- CoachEvaluationsService Delegates ---

  async getPlayerEvaluationsDashboard(userId: string, query: Record<string, unknown> = {}) {
    return await coachEvaluationsService.getPlayerEvaluationsDashboard(userId, query);
  }

  async getPlayerEvaluationDetails(userId: string, targetId: string) {
    return await coachEvaluationsService.getPlayerEvaluationDetails(userId, targetId);
  }

  async getPlayerEvaluationProgressPdfData(userId?: string, targetId?: string) {
    return await coachEvaluationsService.getPlayerEvaluationProgressPdfData(userId, targetId);
  }

  async submitPlayerEvaluation(userId: string, targetId: string, payload: any) {
    return await coachEvaluationsService.submitPlayerEvaluation(userId, targetId, payload);
  }
}

export const coachService = new CoachService();
