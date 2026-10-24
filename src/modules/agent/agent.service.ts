import { AppError } from '@/utils/AppError';
import { IAgentProfile, IVerificationDocument, ISuccessStory } from './agent.interface';
import { AgentProfile, VerificationDocument, SuccessStory } from './agent.model';
import { UserModel } from '@/modules/user/user.model';
import { Notification } from '@/modules/notification/notification.model';
import { Types } from 'mongoose';

export class AgentService {
  async getMyAgentProfile(userId: string) {
    let profile = await AgentProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone country role',
    );
    if (!profile) {
      profile = await AgentProfile.create({ userId: new Types.ObjectId(userId) });
      profile = await AgentProfile.findById(profile._id).populate(
        'userId',
        'name email avatar phone country role',
      );
    }
    return profile;
  }

  async updateMyAgentProfile(userId: string, payload: Partial<IAgentProfile>) {
    const updated = await AgentProfile.findOneAndUpdate(
      { userId },
      { $set: payload },
      { new: true, upsert: true },
    ).populate('userId', 'name email avatar phone country role');

    // Keep UserModel in sync with license & document URLs
    const userUpdates: Record<string, unknown> = {};
    if (payload.fifaLicenseNumber) userUpdates.fifaLicenseNumber = payload.fifaLicenseNumber;
    if (payload.licenseId) userUpdates.fifaLicenseNumber = payload.licenseId;
    if (payload.agencyName) userUpdates.agencyName = payload.agencyName;
    if (payload.officialWebsite) userUpdates.officialWebsite = payload.officialWebsite;
    if ((payload as any).countryOfOperation)
      userUpdates.countryOfOperation = (payload as any).countryOfOperation;
    if ((payload as any).phone) userUpdates.phone = (payload as any).phone;
    if (payload.licenseCertificateDocument)
      userUpdates.licenseCertificateDocument = payload.licenseCertificateDocument;
    if (payload.identityDocument) userUpdates.identityDocument = payload.identityDocument;

    if (Object.keys(userUpdates).length > 0) {
      await UserModel.findByIdAndUpdate(userId, { $set: userUpdates });
    }

    if (
      payload.licenseCertificateDocument ||
      payload.identityDocument ||
      payload.associationMembershipDocument
    ) {
      const user = await UserModel.findById(userId);
      const admins = await UserModel.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } }).select(
        '_id role',
      );
      for (const admin of admins) {
        await Notification.create({
          recipientId: admin._id,
          recipientRole: admin.role,
          title: 'New Agent Verification Request',
          message: `${user?.name || 'A Football Agent'} has submitted FIFA license and verification documents for review.`,
          type: 'VERIFICATION',
          data: { userId, role: 'AGENT' },
        });
      }
    }

    return updated;
  }

  async createProfile(payload: Partial<IAgentProfile>) {
    const existing = await AgentProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Agent profile already exists');
    }
    return AgentProfile.create(payload);
  }

  async getProfileById(id: string) {
    const profile = await AgentProfile.findById(id).populate(
      'userId',
      'name email avatar phone country',
    );
    if (!profile) {
      throw new AppError(404, 'Agent profile not found');
    }
    return profile;
  }

  async uploadVerificationDocument(
    agentIdOrUserId: string,
    payload: Partial<IVerificationDocument>,
  ) {
    let agentUserId = agentIdOrUserId;
    if (Types.ObjectId.isValid(agentIdOrUserId)) {
      const profile = await AgentProfile.findOne({
        $or: [{ _id: agentIdOrUserId }, { userId: agentIdOrUserId }],
      });
      if (profile) {
        agentUserId = profile.userId.toString();
      }
    }

    const doc = await VerificationDocument.create({
      ...payload,
      agentId: new Types.ObjectId(agentUserId),
    });

    // Also sync to AgentProfile and UserModel
    if (payload.fileUrl && payload.documentType) {
      const fieldMap: Record<string, string> = {
        LICENSE_CERTIFICATE: 'licenseCertificateDocument',
        NATIONAL_ID_PASSPORT: 'identityDocument',
        ASSOCIATION_MEMBERSHIP: 'associationMembershipDocument',
      };
      const fieldName = fieldMap[payload.documentType];
      if (fieldName) {
        await AgentProfile.findOneAndUpdate(
          { userId: agentUserId },
          { $set: { [fieldName]: payload.fileUrl } },
          { upsert: true },
        );
        if (fieldName !== 'associationMembershipDocument') {
          await UserModel.findByIdAndUpdate(agentUserId, {
            $set: { [fieldName]: payload.fileUrl },
          });
        }
      }
    }

    return doc;
  }

  async getVerificationDocuments(agentIdOrUserId: string) {
    let agentUserId = agentIdOrUserId;
    if (Types.ObjectId.isValid(agentIdOrUserId)) {
      const profile = await AgentProfile.findOne({
        $or: [{ _id: agentIdOrUserId }, { userId: agentIdOrUserId }],
      });
      if (profile) {
        agentUserId = profile.userId.toString();
      }
    }
    return VerificationDocument.find({
      $or: [
        { agentId: agentUserId },
        ...(Types.ObjectId.isValid(agentUserId)
          ? [{ agentId: new Types.ObjectId(agentUserId) }]
          : []),
      ],
    }).sort({ createdAt: -1 });
  }

  async createSuccessStory(creatorId: string, payload: Partial<ISuccessStory>) {
    return SuccessStory.create({ ...payload, creatorId });
  }

  async getSuccessStories(filter: Record<string, unknown> = {}) {
    return SuccessStory.find(filter).populate('creatorId', 'name email avatar');
  }
}

export const agentService = new AgentService();
