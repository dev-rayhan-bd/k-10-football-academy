import { AppError } from '@/utils/AppError';
import { IAgentProfile, IVerificationDocument, ISuccessStory } from './agent.interface';
import { AgentProfile, VerificationDocument, SuccessStory } from './agent.model';
import QueryBuilder from '@/builder/QueryBuilder';

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

  async getSuccessStories(query: Record<string, unknown> = {}) {
    const storyQuery = new QueryBuilder(
      SuccessStory.find().populate('creatorId', 'name email avatar'),
      query,
    )
      .search(['title', 'description', 'playerName'])
      .filter()
      .sort()
      .paginate();

    const result = await storyQuery.modelQuery;
    const meta = await storyQuery.countTotal();

    return {
      meta,
      result,
    };
  }
}

export const agentService = new AgentService();
