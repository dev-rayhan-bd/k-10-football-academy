import { AppError } from '@/utils/AppError';
import { IAgentProfile, IVerificationDocument, ISuccessStory } from './agent.interface';
import { AgentProfile, VerificationDocument, SuccessStory } from './agent.model';

export class AgentService {
  async createProfile(payload: Partial<IAgentProfile>) {
    const existing = await AgentProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Agent profile already exists');
    }
    return AgentProfile.create(payload);
  }

  async getProfileById(id: string) {
    const profile = await AgentProfile.findById(id).populate('userId', 'name email avatar phone');
    if (!profile) {
      throw new AppError(404, 'Agent profile not found');
    }
    return profile;
  }

  async uploadVerificationDocument(agentId: string, payload: Partial<IVerificationDocument>) {
    return VerificationDocument.create({ ...payload, agentId });
  }

  async getVerificationDocuments(agentId: string) {
    return VerificationDocument.find({ agentId });
  }

  async createSuccessStory(creatorId: string, payload: Partial<ISuccessStory>) {
    return SuccessStory.create({ ...payload, creatorId });
  }

  async getSuccessStories(filter: Record<string, unknown> = {}) {
    return SuccessStory.find(filter).populate('creatorId', 'name email avatar');
  }
}

export const agentService = new AgentService();
