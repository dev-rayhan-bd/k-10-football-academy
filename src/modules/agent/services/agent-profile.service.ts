import {
  calculateAge,
  calculateProfileCompletion,
  formatAgentProfileResponse,
} from './agent-helpers';
import { AppError } from '@/utils/AppError';
import { Types } from 'mongoose';
import { IAgentProfile, IVerificationDocument } from '../agent.interface';
import { AgentProfile, VerificationDocument } from '../agent.model';
import { UserModel } from '@/modules/user/user.model';
import { Notification } from '@/modules/notification/notification.model';

export class AgentProfileService {
  async getMyAgentProfile(userId: string) {
    let profile = await AgentProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone country role coverPhoto dateOfBirth',
    );
    if (!profile) {
      profile = await AgentProfile.create({ userId: new Types.ObjectId(userId) });
      profile = await AgentProfile.findById(profile._id).populate(
        'userId',
        'name email avatar phone country role coverPhoto dateOfBirth',
      );
    }
    return formatAgentProfileResponse(profile);
  }

  async updateMyAgentProfile(userId: string, rawPayload: any) {
    const payload = { ...rawPayload };

    // Standardize field aliases
    if (payload.fullName) {
      payload.name = payload.fullName;
    } else if (payload.name) {
      payload.fullName = payload.name;
    }

    if (payload.nationality) {
      payload.country = payload.nationality;
    } else if (payload.country) {
      payload.nationality = payload.country;
    }

    if (payload.licenseId) {
      payload.fifaLicenseNumber = payload.licenseId;
    } else if (payload.fifaLicenseNumber) {
      payload.licenseId = payload.fifaLicenseNumber;
    }

    if (payload.contact) {
      payload.phone = payload.contact;
    } else if (payload.phone) {
      payload.contact = payload.phone;
    }

    if (payload.bio) {
      payload.professionalBio = payload.bio;
    } else if (payload.professionalBio) {
      payload.bio = payload.professionalBio;
    }

    if (
      payload.yearsOfExperience !== undefined &&
      payload.yearsOfExperience !== null &&
      payload.yearsOfExperience !== ''
    ) {
      payload.yearsOfExperience = Number(payload.yearsOfExperience);
    }

    if (payload.dateOfBirth) {
      const birthDate = new Date(payload.dateOfBirth);
      if (!isNaN(birthDate.getTime())) {
        payload.dateOfBirth = birthDate;
        payload.age = calculateAge(birthDate);
      }
    }

    // Calculate profile completion
    const currentUser = await UserModel.findById(userId).lean();
    payload.profileCompletion = calculateProfileCompletion(payload, currentUser);

    const updated = await AgentProfile.findOneAndUpdate(
      { userId },
      { $set: payload },
      { new: true, upsert: true },
    ).populate('userId', 'name email avatar phone country role coverPhoto dateOfBirth');

    // Keep UserModel in sync with profile and documents
    const userUpdates: Record<string, unknown> = {};
    if (payload.fullName || payload.name) userUpdates.name = payload.fullName || payload.name;
    if (payload.phone || payload.contact) userUpdates.phone = payload.phone || payload.contact;
    if (payload.country || payload.nationality) {
      userUpdates.country = payload.country || payload.nationality;
    }
    if (payload.avatar) userUpdates.avatar = payload.avatar;
    if (payload.coverPhoto) userUpdates.coverPhoto = payload.coverPhoto;
    if (payload.dateOfBirth) userUpdates.dateOfBirth = payload.dateOfBirth;
    if (payload.age !== undefined) userUpdates.age = payload.age;
    if (payload.fifaLicenseNumber || payload.licenseId) {
      userUpdates.fifaLicenseNumber = payload.fifaLicenseNumber || payload.licenseId;
    }
    if (payload.agencyName) userUpdates.agencyName = payload.agencyName;
    if (payload.officialWebsite) userUpdates.officialWebsite = payload.officialWebsite;
    if (payload.countryOfOperation) userUpdates.countryOfOperation = payload.countryOfOperation;
    if (payload.licenseCertificateDocument) {
      userUpdates.licenseCertificateDocument = payload.licenseCertificateDocument;
    }
    if (payload.identityDocument) {
      userUpdates.identityDocument = payload.identityDocument;
    }
    if (payload.profileCompletion !== undefined) {
      userUpdates.profileCompletion = payload.profileCompletion;
    }

    if (Object.keys(userUpdates).length > 0) {
      await UserModel.findByIdAndUpdate(userId, { $set: userUpdates });
    }

    // Sync verification documents table
    if (payload.licenseCertificateDocument) {
      await VerificationDocument.findOneAndUpdate(
        { agentId: new Types.ObjectId(userId), documentType: 'LICENSE_CERTIFICATE' },
        { fileUrl: payload.licenseCertificateDocument, status: 'PENDING' },
        { upsert: true },
      );
    }
    if (payload.identityDocument) {
      await VerificationDocument.findOneAndUpdate(
        { agentId: new Types.ObjectId(userId), documentType: 'NATIONAL_ID_PASSPORT' },
        { fileUrl: payload.identityDocument, status: 'PENDING' },
        { upsert: true },
      );
    }
    if (payload.associationMembershipDocument) {
      await VerificationDocument.findOneAndUpdate(
        { agentId: new Types.ObjectId(userId), documentType: 'ASSOCIATION_MEMBERSHIP' },
        { fileUrl: payload.associationMembershipDocument, status: 'PENDING' },
        { upsert: true },
      );
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

    return formatAgentProfileResponse(updated);
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
      'name email avatar phone country role coverPhoto dateOfBirth',
    );
    if (!profile) {
      throw new AppError(404, 'Agent profile not found');
    }
    return formatAgentProfileResponse(profile);
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
    let profile: any = null;
    if (Types.ObjectId.isValid(agentIdOrUserId)) {
      profile = await AgentProfile.findOne({
        $or: [{ _id: agentIdOrUserId }, { userId: agentIdOrUserId }],
      }).lean();
      if (profile) {
        agentUserId = profile.userId.toString();
      }
    }
    if (!profile && Types.ObjectId.isValid(agentUserId)) {
      profile = await AgentProfile.findOne({ userId: agentUserId }).lean();
    }

    const [user, docs] = await Promise.all([
      UserModel.findById(agentUserId).lean(),
      VerificationDocument.find({
        $or: [
          { agentId: agentUserId },
          ...(Types.ObjectId.isValid(agentUserId)
            ? [{ agentId: new Types.ObjectId(agentUserId) }]
            : []),
        ],
      }).sort({ createdAt: -1 }),
    ]);

    const docConfigs = [
      {
        documentType: 'LICENSE_CERTIFICATE',
        title: 'License Certificate',
        fileKey: 'licenseCertificateDocument',
        description: 'PDF, JPG, PNG (Max 10MB)',
        fallbackUrl: profile?.licenseCertificateDocument || user?.licenseCertificateDocument,
      },
      {
        documentType: 'NATIONAL_ID_PASSPORT',
        title: 'National ID / Passport',
        fileKey: 'identityDocument',
        description: 'PDF, JPG, PNG (Max 10MB)',
        fallbackUrl: profile?.identityDocument || user?.identityDocument,
      },
      {
        documentType: 'ASSOCIATION_MEMBERSHIP',
        title: 'Association Membership',
        fileKey: 'associationMembershipDocument',
        description: 'PDF, JPG, PNG (Max 10MB)',
        fallbackUrl: profile?.associationMembershipDocument,
      },
    ];

    const documents = docConfigs.map((cfg) => {
      const found = docs.find((d) => d.documentType === cfg.documentType);
      const fileUrl = found?.fileUrl || cfg.fallbackUrl || null;
      const docStatus = found?.status || (fileUrl ? 'PENDING' : 'PENDING');
      const uploadedAt =
        found?.updatedAt || found?.createdAt || (fileUrl ? profile?.updatedAt || new Date() : null);

      return {
        _id: found?._id || null,
        documentType: cfg.documentType,
        title: cfg.title,
        description: cfg.description,
        fileKey: cfg.fileKey,
        status: docStatus,
        statusLabel:
          docStatus === 'APPROVED' ? 'Approved' : docStatus === 'REJECTED' ? 'Rejected' : 'Pending',
        isUploaded: Boolean(fileUrl),
        fileUrl,
        uploadedAt,
        adminReviewNotes: (found as any)?.adminReviewNotes || '',
      };
    });

    const hasAnyRejected = documents.some((d) => d.status === 'REJECTED');
    const hasAnyPending = documents.some((d) => d.status === 'PENDING');
    const allApproved = documents.every((d) => d.status === 'APPROVED');

    let overallStatus = profile?.verificationStatus || user?.verificationStatus || 'PENDING';
    if (allApproved) {
      overallStatus = 'APPROVED';
    } else if (hasAnyRejected) {
      overallStatus = 'REJECTED';
    } else if (hasAnyPending) {
      overallStatus = 'PENDING';
    }

    const isVerified = overallStatus === 'APPROVED';

    const statusMessage = isVerified
      ? 'Your account is currently verified'
      : overallStatus === 'PENDING'
        ? 'Your verification documents are currently under review'
        : 'One or more verification documents were rejected. Please re-upload required documents.';

    return {
      verificationStatus: overallStatus,
      status: overallStatus,
      statusLabel:
        overallStatus === 'APPROVED'
          ? 'Approved'
          : overallStatus === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      isVerified,
      message: statusMessage,
      adminReviewNotes: profile?.adminReviewNotes || user?.adminReviewNotes || '',
      documents,
      uploadEndpoint: {
        method: 'PATCH',
        url: '/api/v1/agents/agent-profile',
        supportedFileKeys: [
          'licenseCertificateDocument',
          'identityDocument',
          'associationMembershipDocument',
        ],
      },
      rawDocuments: docs,
    };
  }
}

export const agentProfileService = new AgentProfileService();
