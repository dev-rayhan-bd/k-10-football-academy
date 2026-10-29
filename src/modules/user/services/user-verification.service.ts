/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile, VerificationDocument } from '@/modules/agent/agent.model';
import { Notification } from '@/modules/notification/notification.model';
import { UserModel } from '../user.model';

const normalizeVerificationRole = (role?: string): string | undefined => {
  if (!role) return undefined;
  const r = String(role).trim().toUpperCase();
  if (!r || r === 'ALL' || r === 'ALL ROLES') return undefined;
  if (r === 'AGENTS' || r === 'AGENT') return 'AGENT';
  if (r === 'CLUBS' || r === 'CLUB') return 'CLUB';
  return r;
};

const getRoleLabel = (role: string): string => {
  if (role === 'AGENT') return 'Agents';
  if (role === 'CLUB') return 'Clubs';
  return role;
};

export class UserVerificationService {
  private async resolveVerificationTargetUser(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid ID format');
    }

    const directUser = await UserModel.findById(id);
    if (directUser) {
      if (!['CLUB', 'AGENT'].includes(directUser.role)) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Only AGENT and CLUB accounts require admin registration approval',
        );
      }
      return directUser;
    }

    const [club, agent] = await Promise.all([
      ClubProfile.findById(id).select('userId').lean(),
      AgentProfile.findById(id).select('userId').lean(),
    ]);

    const linkedUserId = club?.userId || agent?.userId;
    if (linkedUserId) {
      const user = await UserModel.findById(linkedUserId);
      if (user) return user;
    }

    throw new AppError(StatusCodes.NOT_FOUND, 'Agent or Club verification application not found');
  }

  async getPendingVerifications(
    role?: string,
    options: { status?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    const normalizedRole = normalizeVerificationRole(role);

    // Only AGENT and CLUB require registration verification
    if (normalizedRole && !['AGENT', 'CLUB'].includes(normalizedRole)) {
      return [];
    }

    const statusParam = options.status ? String(options.status).trim().toUpperCase() : 'PENDING';

    const filter: any = {
      role: normalizedRole ? normalizedRole : { $in: ['AGENT', 'CLUB'] },
    };

    if (statusParam && statusParam !== 'ALL' && statusParam !== 'ALL STATUS') {
      if (statusParam === 'PENDING') {
        filter.$or = [
          { verificationStatus: 'PENDING' },
          { verificationStatus: { $exists: false } },
        ];
      } else {
        filter.verificationStatus = statusParam;
      }
    }

    const users = await UserModel.find(filter)
      .select(
        'name email role avatar phone country clubName agencyName fifaLicenseNumber registrationId officialWebsite footballAssociation authorizedRepresentativeName authorizedRepresentativeJobTitle authorizationDocument clubRegistrationDocument licenseCertificateDocument identityDocument verificationStatus isVerified adminReviewNotes verifiedAt createdAt',
      )
      .sort({ createdAt: -1 })
      .lean();

    const result = await Promise.all(
      users.map(async (u: any) => {
        let profileDetails: any = null;
        if (u.role === 'CLUB') {
          profileDetails = await ClubProfile.findOne({ userId: u._id })
            .select(
              'name clubType league country logo officialWebsite footballAssociation authorizedRepresentativeName authorizedRepresentativeJobTitle authorizationDocument clubRegistrationDocument verificationStatus adminReviewNotes verifiedAt createdAt',
            )
            .lean();
        } else if (u.role === 'AGENT') {
          const [agentProf, docs] = await Promise.all([
            AgentProfile.findOne({ userId: u._id })
              .select(
                'fullName name licenseId fifaLicenseNumber agencyName avatar country countryOfOperation officialWebsite licenseCertificateDocument identityDocument associationMembershipDocument verificationStatus adminReviewNotes verifiedAt createdAt',
              )
              .lean(),
            VerificationDocument.find({ agentId: u._id }).lean(),
          ]);
          profileDetails = agentProf
            ? { ...agentProf, verificationDocuments: docs }
            : { verificationDocuments: docs };
        }

        const verificationStatus = (
          profileDetails?.verificationStatus ||
          u.verificationStatus ||
          (u.isVerified ? 'APPROVED' : 'PENDING')
        ).toUpperCase();

        const displayName =
          profileDetails?.name ||
          profileDetails?.fullName ||
          u.clubName ||
          u.agencyName ||
          u.name ||
          '';

        const createdDate = u.createdAt || profileDetails?.createdAt;
        const dateStr = createdDate ? new Date(createdDate).toISOString().split('T')[0] : '';

        return {
          _id: u._id,
          userId: u._id,
          profileId: profileDetails?._id || null,
          name: displayName,
          email: u.email,
          avatar: profileDetails?.logo || profileDetails?.avatar || u.avatar || '',
          role: u.role,
          roleLabel: getRoleLabel(u.role),
          date: dateStr,
          status: verificationStatus,
          verificationStatus,
          reviewNotes: profileDetails?.adminReviewNotes || u.adminReviewNotes || '',
          user: u,
          profile: profileDetails,
        };
      }),
    );

    if (options.search) {
      const s = String(options.search).trim().toLowerCase();
      return result.filter((item) =>
        [item.name, item.email, item.role, item.roleLabel, item.status]
          .join(' ')
          .toLowerCase()
          .includes(s),
      );
    }

    return result;
  }

  async getVerificationDetailsById(targetId: string) {
    const user = await this.resolveVerificationTargetUser(targetId);
    const items = await this.getPendingVerifications(user.role, { status: 'ALL' });
    const matched = items.find((i) => i.userId.toString() === user._id.toString());
    if (!matched) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Verification application details not found');
    }
    return matched;
  }

  async decideVerification(
    targetId: string,
    payload: {
      status?: 'APPROVED' | 'REJECTED';
      action?: 'APPROVE' | 'REJECT';
      reviewNotes?: string;
      rejectionReason?: string;
    },
  ) {
    let resolvedStatus = payload.status ? String(payload.status).toUpperCase() : '';
    if (!resolvedStatus && payload.action) {
      const act = String(payload.action).toUpperCase();
      if (act === 'APPROVE' || act === 'APPROVED') resolvedStatus = 'APPROVED';
      else if (act === 'REJECT' || act === 'REJECTED') resolvedStatus = 'REJECTED';
    }

    if (!['APPROVED', 'REJECTED'].includes(resolvedStatus)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Status must be either APPROVED or REJECTED');
    }

    const decisionStatus = resolvedStatus as 'APPROVED' | 'REJECTED';
    const notes = payload.reviewNotes ?? payload.rejectionReason ?? '';

    const user = await this.resolveVerificationTargetUser(targetId);

    const now = new Date();
    const isApproved = decisionStatus === 'APPROVED';

    user.verificationStatus = decisionStatus;
    user.isVerified = isApproved;
    user.adminReviewNotes = notes;
    user.verifiedAt = now;
    await user.save();

    if (user.role === 'CLUB') {
      await ClubProfile.findOneAndUpdate(
        { userId: user._id },
        {
          verificationStatus: decisionStatus,
          adminReviewNotes: notes,
          verifiedAt: now,
        },
      );
    } else if (user.role === 'AGENT') {
      await Promise.all([
        AgentProfile.findOneAndUpdate(
          { userId: user._id },
          {
            verificationStatus: decisionStatus,
            adminReviewNotes: notes,
            verifiedAt: now,
          },
        ),
        VerificationDocument.updateMany(
          { agentId: user._id },
          { $set: { status: decisionStatus, adminReviewNotes: notes } },
        ),
      ]);
    }

    // Create In-App Notification for user
    await Notification.create({
      recipientId: user._id,
      recipientRole: user.role,
      title: isApproved ? 'Credentials Verified & Approved!' : 'Verification Status Update',
      message: isApproved
        ? 'Congratulations! Your professional credentials and licenses have been verified and approved by the K10 Administrator.'
        : `Your verification request has been rejected. Reason: ${notes || 'Credentials could not be verified.'}`,
      type: 'VERIFICATION',
      data: { status: decisionStatus, reviewNotes: notes },
    }).catch(() => null);

    return {
      _id: user._id,
      userId: user._id,
      name: user.clubName || user.agencyName || user.name,
      email: user.email,
      role: user.role,
      roleLabel: getRoleLabel(user.role),
      status: decisionStatus,
      verificationStatus: decisionStatus,
      reviewNotes: notes,
      verifiedAt: now,
      message: `User ${user.role.toLowerCase()} verification successfully set to ${decisionStatus}`,
    };
  }
}

export const userVerificationService = new UserVerificationService();
