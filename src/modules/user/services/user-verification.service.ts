import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { Notification } from '@/modules/notification/notification.model';
import { UserModel } from '../user.model';

export class UserVerificationService {
  async getPendingVerifications(role?: string) {
    const filter: any = {
      role: role ? String(role).toUpperCase() : { $in: ['CLUB', 'AGENT'] },
      $or: [{ verificationStatus: 'PENDING' }, { verificationStatus: { $exists: false } }],
    };

    const users = await UserModel.find(filter)
      .select('name email role avatar phone country verificationStatus createdAt')
      .lean();

    const result = await Promise.all(
      users.map(async (u: any) => {
        let profileDetails: any = null;
        if (u.role === 'CLUB') {
          profileDetails = await ClubProfile.findOne({ userId: u._id })
            .select(
              'name league country officialWebsite footballAssociation authorizedRepresentativeName authorizedRepresentativeJobTitle authorizationDocument clubRegistrationDocument verificationStatus adminReviewNotes createdAt',
            )
            .lean();
        } else if (u.role === 'AGENT') {
          profileDetails = await AgentProfile.findOne({ userId: u._id })
            .select(
              'licenseId fifaLicenseNumber agencyName officialWebsite licenseCertificateDocument identityDocument associationMembershipDocument verificationStatus adminReviewNotes createdAt',
            )
            .lean();
        }

        return {
          user: u,
          profile: profileDetails,
          verificationStatus:
            profileDetails?.verificationStatus || u.verificationStatus || 'PENDING',
        };
      }),
    );

    return result;
  }

  async decideVerification(
    targetUserId: string,
    payload: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  ) {
    if (!payload.status || !['APPROVED', 'REJECTED'].includes(payload.status)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Status must be either APPROVED or REJECTED');
    }

    const user = await UserModel.findById(targetUserId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const now = new Date();
    const isApproved = payload.status === 'APPROVED';

    user.verificationStatus = payload.status;
    user.isVerified = isApproved;
    user.adminReviewNotes = payload.reviewNotes || '';
    user.verifiedAt = now;
    await user.save();

    if (user.role === 'CLUB') {
      await ClubProfile.findOneAndUpdate(
        { userId: targetUserId },
        {
          verificationStatus: payload.status,
          adminReviewNotes: payload.reviewNotes || '',
          verifiedAt: now,
        },
      );
    } else if (user.role === 'AGENT') {
      await AgentProfile.findOneAndUpdate(
        { userId: targetUserId },
        {
          verificationStatus: payload.status,
          adminReviewNotes: payload.reviewNotes || '',
          verifiedAt: now,
        },
      );
    }

    // Create In-App Notification for user
    await Notification.create({
      recipientId: user._id,
      recipientRole: user.role,
      title: isApproved ? 'Credentials Verified & Approved!' : 'Verification Status Update',
      message: isApproved
        ? 'Congratulations! Your professional credentials and licenses have been verified and approved by the K10 Administrator. Please complete your subscription payment to activate your dashboard.'
        : `Your verification request has been rejected. Reason: ${payload.reviewNotes || 'Credentials could not be verified.'}`,
      type: 'VERIFICATION',
      data: { status: payload.status, reviewNotes: payload.reviewNotes },
    });

    return {
      userId: user._id,
      role: user.role,
      status: payload.status,
      reviewNotes: payload.reviewNotes || '',
      verifiedAt: now,
      message: `User ${user.role.toLowerCase()} verification successfully set to ${payload.status}`,
    };
  }
}

export const userVerificationService = new UserVerificationService();
