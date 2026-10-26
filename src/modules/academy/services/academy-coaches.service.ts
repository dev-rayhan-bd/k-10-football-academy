import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { AcademyProfile, AcademyCoach } from '../academy.model';
import { NotificationService } from '@/modules/notification/notification.service';
import { CoachProfile } from '@/modules/coach/coach.model';
import { User } from '@/modules/user/user.model';

const notificationService = new NotificationService();

export class AcademyCoachesService {
  async inviteCoach(
    academyIdentifier: string,
    managerUserId: string,
    payload: { coachId?: string; coachEmail?: string; role?: string; message?: string },
  ) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    if (managerUserId && academy.userId.toString() !== managerUserId) {
      const managerUser = await User.findById(managerUserId);
      if (managerUser && managerUser.role !== 'SUPER_ADMIN') {
        throw new AppError(
          403,
          'You are not authorized to invite coaches on behalf of this academy',
        );
      }
    }

    let coach = null;
    if (payload.coachId && Types.ObjectId.isValid(payload.coachId)) {
      coach = await CoachProfile.findOne({
        $or: [{ _id: payload.coachId }, { userId: payload.coachId }],
      });
    }

    if (!coach && payload.coachEmail) {
      const user = await User.findOne({ email: payload.coachEmail.toLowerCase() });
      if (user) {
        coach = await CoachProfile.findOne({ userId: user._id });
      }
    }

    if (!coach) {
      throw new AppError(404, 'Coach profile not found for the given ID or Email');
    }

    const existingAffiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
    });

    if (existingAffiliation) {
      if (existingAffiliation.status === 'APPROVED') {
        throw new AppError(400, 'Coach is already an officially approved member of this academy');
      }
      if (existingAffiliation.status === 'PENDING') {
        throw new AppError(
          400,
          'An affiliation invitation or request is already pending for this coach',
        );
      }

      existingAffiliation.status = 'PENDING';
      existingAffiliation.requestedBy = 'ACADEMY';
      existingAffiliation.role = payload.role || existingAffiliation.role || 'Youth Coach';
      existingAffiliation.requestMessage =
        payload.message || `Official invitation from ${academy.name} to join as coach.`;
      existingAffiliation.responseNote = undefined;
      existingAffiliation.approvedAt = undefined;
      existingAffiliation.rejectedAt = undefined;
      await existingAffiliation.save();

      await notificationService.createNotification({
        recipientId: coach.userId,
        recipientRole: 'COACH',
        title: 'New Academy Invitation ⚽',
        message: `${academy.name} has invited you to join their official coaching staff as ${existingAffiliation.role}.`,
        type: 'ACADEMY_INVITATION',
        data: { affiliationId: existingAffiliation._id, academyId: academy._id },
      });

      return existingAffiliation;
    }

    const affiliation = await AcademyCoach.create({
      academyId: academy._id,
      coachId: coach._id,
      coachUserId: coach.userId,
      role: payload.role || 'Youth Coach',
      status: 'PENDING',
      requestedBy: 'ACADEMY',
      requestMessage:
        payload.message || `Official invitation from ${academy.name} to join as coach.`,
    });

    await notificationService.createNotification({
      recipientId: coach.userId,
      recipientRole: 'COACH',
      title: 'New Academy Invitation ⚽',
      message: `${academy.name} has invited you to join their official coaching staff as ${affiliation.role}.`,
      type: 'ACADEMY_INVITATION',
      data: { affiliationId: affiliation._id, academyId: academy._id },
    });

    return affiliation;
  }

  async requestCoachAffiliation(
    coachUserId: string,
    payload: { academyId: string; role?: string; message?: string },
  ) {
    const coach = await CoachProfile.findOne({ userId: coachUserId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found for this user');
    }

    let academy = null;
    if (Types.ObjectId.isValid(payload.academyId)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: payload.academyId }, { userId: payload.academyId }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy not found');
    }

    const existingAffiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
    });

    const defaultRole = coach.title || 'Coach';

    if (existingAffiliation) {
      if (existingAffiliation.status === 'APPROVED') {
        throw new AppError(400, 'You are already an approved coach in this academy');
      }
      if (existingAffiliation.status === 'PENDING') {
        throw new AppError(400, 'Your affiliation request is already pending academy review');
      }

      existingAffiliation.status = 'PENDING';
      existingAffiliation.requestedBy = 'COACH';
      existingAffiliation.role = defaultRole;
      existingAffiliation.requestMessage =
        payload.message || `Coach ${coach.fullName} requested to join ${academy.name}.`;
      existingAffiliation.responseNote = undefined;
      existingAffiliation.approvedAt = undefined;
      existingAffiliation.rejectedAt = undefined;
      await existingAffiliation.save();

      await notificationService.createNotification({
        recipientId: academy.userId,
        recipientRole: 'ACADEMY',
        title: 'Coach Affiliation Request',
        message: `Coach ${coach.fullName} has requested to join your academy.`,
        type: 'COACH_AFFILIATION_REQUEST',
        data: { affiliationId: existingAffiliation._id, coachId: coach._id },
      });

      return existingAffiliation;
    }

    const affiliation = await AcademyCoach.create({
      academyId: academy._id,
      coachId: coach._id,
      coachUserId: coach.userId,
      role: defaultRole,
      status: 'PENDING',
      requestedBy: 'COACH',
      requestMessage:
        payload.message || `Coach ${coach.fullName} requested to join ${academy.name}.`,
    });

    await notificationService.createNotification({
      recipientId: academy.userId,
      recipientRole: 'ACADEMY',
      title: 'Coach Affiliation Request',
      message: `Coach ${coach.fullName} has requested to join your academy.`,
      type: 'COACH_AFFILIATION_REQUEST',
      data: { affiliationId: affiliation._id, coachId: coach._id },
    });

    return affiliation;
  }

  async getAcademyCoaches(academyIdentifier: string, status?: string) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const filter: Record<string, unknown> = { academyId: academy._id };
    if (status && status !== 'ALL') {
      filter.status = status;
    }

    const affiliations = await AcademyCoach.find(filter)
      .populate(
        'coachId',
        'fullName title profileImage licenseStatus yearsExperience cvTier coachType overallRatingScore phone email',
      )
      .populate('coachUserId', 'name email avatar')
      .sort({ createdAt: -1 });

    return {
      academy: {
        id: academy._id,
        name: academy.name,
        logo: academy.logo,
      },
      total: affiliations.length,
      coaches: affiliations,
    };
  }

  async getCoachAffiliations(coachUserId: string) {
    const coach = await CoachProfile.findOne({ userId: coachUserId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const affiliations = await AcademyCoach.find({ coachId: coach._id })
      .populate('academyId', 'name category logo coverPhoto country city location registrationId')
      .sort({ createdAt: -1 });

    return affiliations;
  }

  async respondToCoachAffiliation(
    affiliationId: string,
    responderUserId: string,
    action: 'APPROVE' | 'REJECT',
    responseNote?: string,
  ) {
    const affiliation = await AcademyCoach.findById(affiliationId);
    if (!affiliation) {
      throw new AppError(404, 'Affiliation request not found');
    }

    if (affiliation.status !== 'PENDING') {
      throw new AppError(400, `Affiliation request is already ${affiliation.status}`);
    }

    const academy = await AcademyProfile.findById(affiliation.academyId);
    const coach = await CoachProfile.findById(affiliation.coachId);
    if (!academy || !coach) {
      throw new AppError(404, 'Associated academy or coach profile not found');
    }

    // Role-based authorization
    if (affiliation.requestedBy === 'COACH') {
      // Coach initiated -> Academy management must respond
      if (academy.userId.toString() !== responderUserId) {
        throw new AppError(
          403,
          'Only the academy management can approve or reject this coach request',
        );
      }
    } else {
      // Academy initiated -> Coach must respond
      if (coach.userId.toString() !== responderUserId) {
        throw new AppError(
          403,
          'Only the invited coach can accept or decline this academy invitation',
        );
      }
    }

    if (action === 'APPROVE') {
      affiliation.status = 'APPROVED';
      affiliation.approvedAt = new Date();
      affiliation.responseNote = responseNote;
      await affiliation.save();

      // Apply verified official academy affiliation to Coach Profile
      coach.academyId = academy._id as Types.ObjectId;
      coach.isVerifiedByAcademy = true;
      coach.academyRole = affiliation.role || 'Youth Coach';
      coach.currentClub = academy.name; // Verified official name
      coach.clubLogo = academy.logo;
      coach.coachType = 'CLUB_COACH';

      // Update club history to reflect current verified club
      const history = Array.isArray(coach.clubHistory) ? coach.clubHistory : [];
      history.forEach((c: any) => {
        c.isCurrent = false;
      });
      history.unshift({
        clubName: academy.name,
        role: affiliation.role || 'Youth Coach',
        period: `${new Date().getFullYear()} - Present`,
        startYear: new Date().getFullYear(),
        isCurrent: true,
        logoUrl: academy.logo,
      });
      coach.clubHistory = history;
      await coach.save();

      // Notify the other party
      const notifyUserId = affiliation.requestedBy === 'COACH' ? coach.userId : academy.userId;
      const notifyRole = affiliation.requestedBy === 'COACH' ? 'COACH' : 'ACADEMY';

      await notificationService.createNotification({
        recipientId: notifyUserId,
        recipientRole: notifyRole,
        title: 'Official Affiliation Approved! ⚽',
        message: `Coaching affiliation between Coach ${coach.fullName} and ${academy.name} has been APPROVED! Coach is now officially verified.`,
        type: 'ACADEMY_AFFILIATION_APPROVED',
        data: {
          affiliationId: affiliation._id,
          academyId: academy._id,
          coachId: coach._id,
        },
      });
    } else {
      affiliation.status = 'REJECTED';
      affiliation.rejectedAt = new Date();
      affiliation.responseNote = responseNote;
      await affiliation.save();

      const notifyUserId = affiliation.requestedBy === 'COACH' ? coach.userId : academy.userId;
      const notifyRole = affiliation.requestedBy === 'COACH' ? 'COACH' : 'ACADEMY';

      await notificationService.createNotification({
        recipientId: notifyUserId,
        recipientRole: notifyRole,
        title: 'Affiliation Request Declined',
        message: `The affiliation request between ${coach.fullName} and ${academy.name} was declined.`,
        type: 'ACADEMY_AFFILIATION_REJECTED',
        data: { affiliationId: affiliation._id },
      });
    }

    return affiliation;
  }

  async removeCoachAffiliation(academyIdentifier: string, affiliationId: string) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const affiliation = await AcademyCoach.findOne({
      _id: affiliationId,
      academyId: academy._id,
    });
    if (!affiliation) {
      throw new AppError(404, 'Affiliation not found for this academy');
    }

    affiliation.status = 'REMOVED';
    await affiliation.save();

    const coach = await CoachProfile.findById(affiliation.coachId);
    if (coach && coach.academyId?.toString() === academy._id.toString()) {
      coach.isVerifiedByAcademy = false;
      coach.academyId = undefined;
      coach.coachType = 'INDIVIDUAL_COACH';

      if (Array.isArray(coach.clubHistory)) {
        coach.clubHistory.forEach((c: any) => {
          if (c.clubName.toLowerCase() === academy.name.toLowerCase() && c.isCurrent) {
            c.isCurrent = false;
            c.endYear = new Date().getFullYear();
            c.period = `${c.startYear || new Date().getFullYear()} - ${new Date().getFullYear()}`;
          }
        });
      }
      await coach.save();

      await notificationService.createNotification({
        recipientId: coach.userId,
        recipientRole: 'COACH',
        title: 'Academy Affiliation Revoked',
        message: `Your affiliation with ${academy.name} has been revoked. Profile reverted to Individual Coach.`,
        type: 'ACADEMY_AFFILIATION_REMOVED',
        data: { academyId: academy._id },
      });
    }

    return { message: 'Coach removed from academy successfully', affiliation };
  }
}

export const academyCoachesService = new AcademyCoachesService();
