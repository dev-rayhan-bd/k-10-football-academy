import { IAgentProfile, IVerificationDocument } from './agent.interface';
import { agentProfileService } from './services/agent-profile.service';
import { agentStoriesService } from './services/agent-stories.service';
import { agentAnalyticsService } from './services/agent-analytics.service';

/**
 * Enterprise Facade: AgentService
 * Delegates directly to domain subservices while maintaining 100% identical public signatures and responses.
 */
export class AgentService {
  // --- AgentProfileService Delegates ---

  async getMyAgentProfile(userId: string) {
    return await agentProfileService.getMyAgentProfile(userId);
  }

  async updateMyAgentProfile(userId: string, rawPayload: any) {
    return await agentProfileService.updateMyAgentProfile(userId, rawPayload);
  }

  async createProfile(payload: Partial<IAgentProfile>) {
    return await agentProfileService.createProfile(payload);
  }

  async getProfileById(id: string) {
    return await agentProfileService.getProfileById(id);
  }

  async uploadVerificationDocument(
    agentIdOrUserId: string,
    payload: Partial<IVerificationDocument>,
  ) {
    return await agentProfileService.uploadVerificationDocument(agentIdOrUserId, payload);
  }

  async getVerificationDocuments(agentIdOrUserId: string) {
    return await agentProfileService.getVerificationDocuments(agentIdOrUserId);
  }

  // --- AgentStoriesService Delegates ---

  async createSuccessStory(creatorId: string, payload: any, creatorRole: string = 'AGENT') {
    return await agentStoriesService.createSuccessStory(creatorId, payload, creatorRole);
  }

  async getSuccessStories(query: any = {}, callerUser?: any) {
    return await agentStoriesService.getSuccessStories(query, callerUser);
  }

  async getSuccessStoryById(storyId: string, callerUser?: any) {
    return await agentStoriesService.getSuccessStoryById(storyId, callerUser);
  }

  async updateSuccessStory(
    userId: string,
    storyId: string,
    payload: any,
    userRole: string = 'AGENT',
  ) {
    return await agentStoriesService.updateSuccessStory(userId, storyId, payload, userRole);
  }

  async deleteSuccessStory(userId: string, storyId: string, userRole: string = 'AGENT') {
    return await agentStoriesService.deleteSuccessStory(userId, storyId, userRole);
  }

  async reviewSuccessStory(
    storyId: string,
    status: 'APPROVED' | 'REJECTED',
    adminReviewNotes?: string,
  ) {
    return await agentStoriesService.reviewSuccessStory(storyId, status, adminReviewNotes);
  }

  // --- AgentAnalyticsService Delegates ---

  async getAgentDashboard(userId: string, query: any = {}) {
    return await agentAnalyticsService.getAgentDashboard(userId, query);
  }

  async getAgentAnalytics(userId: string, query: any = {}) {
    return await agentAnalyticsService.getAgentAnalytics(userId, query);
  }
}

export const agentService = new AgentService();
