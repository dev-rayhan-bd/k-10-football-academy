import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import QueryBuilder from '@/builder/QueryBuilder';
import { AcademyProfile, AcademyCoach, Team, PlayerEvaluation } from '../academy.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { coachCacheService } from '@/modules/coach/services/coach-cache.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
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

    if (!payload.coachId && !payload.coachEmail) {
      throw new AppError(400, 'coachId or coachEmail is required');
    }
    if (payload.coachId && !Types.ObjectId.isValid(payload.coachId)) {
      throw new AppError(400, 'Invalid coachId');
    }

    let coach = null;
    if (payload.coachId) {
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
    if (
      coach.isVerifiedByAcademy &&
      coach.academyId &&
      coach.academyId.toString() !== academy._id.toString()
    ) {
      throw new AppError(
        409,
        'This coach is already an approved coach of another academy and must leave it first',
      );
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

  /**
   * Academy "My Coaches" list.
   * Sources: affiliations (AcademyCoach) + coaches placed on this academy's teams + coaches whose
   * profile points to this academy. A coach without an affiliation is NOT_AFFILIATED (never shown
   * as approved) and can be invited.
   * status filter: ALL (default, excludes REMOVED) | APPROVED | PENDING | REJECTED | REMOVED | NOT_AFFILIATED
   */
  async getAcademyCoaches(academyIdentifier: string, query: any = {}) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const q: Record<string, unknown> = typeof query === 'object' && query ? { ...query } : {};
    const status = String(q.status || 'ALL').toUpperCase();
    const allowedStatuses = ['ALL', 'APPROVED', 'PENDING', 'REJECTED', 'REMOVED', 'NOT_AFFILIATED'];
    if (!allowedStatuses.includes(status)) {
      throw new AppError(400, `Invalid status. Use ${allowedStatuses.join(', ')}`);
    }
    const teamIdFilter = q.teamId ? String(q.teamId) : '';
    if (teamIdFilter && !Types.ObjectId.isValid(teamIdFilter)) {
      throw new AppError(400, 'Invalid teamId');
    }

    const [affiliations, allTeams, profileLinked] = await Promise.all([
      AcademyCoach.find({ academyId: academy._id }).sort({ createdAt: -1 }).lean(),
      Team.find({ academyId: academy._id }).select('teamName ageGroup coachIds').lean(),
      CoachProfile.find({ academyId: academy._id }).select('_id').lean(),
    ]);

    // status per coach: the affiliation wins; otherwise NOT_AFFILIATED
    const affByCoach = new Map<string, any>();
    for (const aff of affiliations as any[]) {
      const id = String(aff.coachId);
      if (!affByCoach.has(id)) affByCoach.set(id, aff);
    }
    const teamsByCoach = new Map<string, any[]>();
    for (const t of allTeams as any[]) {
      for (const cid of t.coachIds || []) {
        const id = String(cid);
        if (!teamsByCoach.has(id)) teamsByCoach.set(id, []);
        teamsByCoach.get(id)!.push(t);
      }
    }
    const candidateIds = [
      ...new Set<string>([
        ...affByCoach.keys(),
        ...teamsByCoach.keys(),
        ...(profileLinked as any[]).map((c) => String(c._id)),
      ]),
    ].filter((id) => Types.ObjectId.isValid(id));
    // ignore ids whose coach profile no longer exists (stale team/affiliation references)
    const existing = await CoachProfile.find({ _id: { $in: candidateIds } })
      .select('_id')
      .lean();
    const allIds = new Set<string>((existing as any[]).map((c) => String(c._id)));
    const statusOf = (id: string): string => affByCoach.get(id)?.status || 'NOT_AFFILIATED';

    const counts = {
      all: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      removed: 0,
      notAffiliated: 0,
      assignedToTeams: 0,
    };
    for (const id of allIds) {
      const st = statusOf(id);
      if (st === 'APPROVED') counts.approved++;
      else if (st === 'PENDING') counts.pending++;
      else if (st === 'REJECTED') counts.rejected++;
      else if (st === 'REMOVED') counts.removed++;
      else counts.notAffiliated++;
      if (st !== 'REMOVED') {
        counts.all++;
        if (teamsByCoach.has(id)) counts.assignedToTeams++;
      }
    }

    const idsForList = [...allIds].filter((id) => {
      const st = statusOf(id);
      if (status === 'ALL' ? st === 'REMOVED' : st !== status) return false;
      if (teamIdFilter && !(teamsByCoach.get(id) || []).some((t) => String(t._id) === teamIdFilter))
        return false;
      return true;
    });

    const term = String(q.searchTerm || q.search || '').trim();
    const listQuery: Record<string, unknown> = {
      page: Math.max(1, Number(q.page) || 1),
      limit: Math.max(1, Math.min(100, Number(q.limit) || 10)),
      sort: typeof q.sort === 'string' && q.sort ? q.sort : 'fullName',
      ...(term ? { searchTerm: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } : {}),
    };
    const builder = new QueryBuilder(
      CoachProfile.find({ _id: { $in: idsForList.map((id) => new Types.ObjectId(id)) } }),
      listQuery,
    )
      .search(['fullName', 'title', 'academyRole', 'licenseStatus', 'email'])
      .filter()
      .sort()
      .paginate();
    const [coaches, meta] = await Promise.all([
      builder.modelQuery.populate('userId', 'name email avatar phone').lean(),
      builder.countTotal(),
    ]);

    const rows = (coaches as any[]).map((c) => {
      const id = String(c._id);
      const aff = affByCoach.get(id) || null;
      const st = statusOf(id);
      const user = (c.userId as any) || {};
      const teams = teamsByCoach.get(id) || [];
      const license =
        typeof c.licenseStatus === 'string'
          ? c.licenseStatus
          : c.licenseStatus?.level || c.licenseStatus?.type || '';
      const pendingInvite = st === 'PENDING' && aff?.requestedBy === 'ACADEMY';
      const pendingRequest = st === 'PENDING' && aff?.requestedBy === 'COACH';
      return {
        _id: c._id,
        id: c._id,
        coachId: c._id,
        coachUserId: user._id || c.userId || null,
        affiliationId: aff?._id || null,
        fullName: c.fullName || user.name || '',
        email: user.email || c.email || '',
        phone: c.phone || user.phone || '',
        profileImage: c.profileImage || user.avatar || '',
        title: aff?.role || c.academyRole || c.title || '',
        role: aff?.role || c.academyRole || c.title || '',
        licenseStatus: license,
        yearsExperience: c.yearsExperience ?? null,
        cvTier: c.cvTier || null,
        overallRatingScore: c.overallRatingScore ?? null,
        isVerifiedByAcademy: Boolean(
          c.isVerifiedByAcademy && String(c.academyId || '') === String(academy._id),
        ),
        status: st,
        requestedBy: aff?.requestedBy || null,
        statusLabel:
          st === 'APPROVED'
            ? 'Approved'
            : pendingInvite
              ? 'Invitation sent'
              : pendingRequest
                ? 'Requested to join'
                : st === 'REJECTED'
                  ? 'Declined'
                  : st === 'REMOVED'
                    ? 'Removed'
                    : 'Not affiliated',
        requestMessage: aff?.requestMessage || '',
        responseNote: aff?.responseNote || '',
        actions: {
          canInvite: st === 'NOT_AFFILIATED' || st === 'REJECTED' || st === 'REMOVED',
          canCancelInvite: pendingInvite,
          canRespond: pendingRequest, // approve / reject a coach's own request
          canRemove: st === 'APPROVED' || st === 'NOT_AFFILIATED',
        },
        assignedTeams: teams.map((t) => ({
          _id: t._id,
          teamName: t.teamName,
          ageGroup: t.ageGroup,
        })),
        assignedTeamId: teams[0]?._id || null,
        assignedTeamName: teams[0]?.teamName || null,
        joinedAt: st === 'APPROVED' ? aff?.approvedAt || aff?.createdAt || null : null,
        invitedAt: aff?.createdAt || null,
        createdAt: aff?.createdAt || c.createdAt || null,
      };
    });

    return {
      meta,
      academy: {
        id: academy._id,
        name: academy.name,
        logo: academy.logo,
      },
      summary: counts,
      coaches: rows,
    };
  }

  async getAcademyCoachById(academyIdentifier: string, coachId: string) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    if (!Types.ObjectId.isValid(coachId)) {
      throw new AppError(400, 'Invalid coach ID');
    }

    const coach = await CoachProfile.findById(coachId).populate(
      'userId',
      'name email avatar phone',
    );
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const affiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
    });
    const isDirect = coach.academyId?.toString() === academy._id.toString();

    if (!affiliation && !isDirect) {
      throw new AppError(403, 'This coach is not affiliated with this academy');
    }

    const assignedTeams = await Team.find({
      academyId: academy._id,
      coachIds: coach._id,
    }).select('teamName ageGroup coachesCount playersCount status');

    const userObj = coach.userId as any;
    return {
      _id: coach._id,
      id: coach._id,
      fullName: coach.fullName || userObj?.name,
      title: affiliation?.role || coach.title || 'Coach',
      role: affiliation?.role || 'Coach',
      profileImage: coach.profileImage || userObj?.avatar,
      licenseStatus: coach.licenseStatus,
      yearsExperience: coach.yearsExperience,
      cvTier: coach.cvTier,
      overallRatingScore: coach.overallRatingScore,
      phone: coach.phone || userObj?.phone,
      email: coach.email || userObj?.email,
      dateOfBirth: coach.dateOfBirth,
      courses: coach.courses || [],
      accomplishments: coach.accomplishments || [],
      majorTrophies: coach.majorTrophies || [],
      keySkills: coach.keySkills || [],
      bio: coach.additionalNotes || (coach as any).bio || '',
      affiliation: affiliation
        ? {
            id: affiliation._id,
            status: affiliation.status,
            role: affiliation.role,
            createdAt: affiliation.createdAt,
            approvedAt: affiliation.approvedAt,
          }
        : null,
      assignedTeams,
    };
  }

  async updateAcademyCoach(academyIdentifier: string, coachId: string, payload: any) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    if (!Types.ObjectId.isValid(coachId)) {
      throw new AppError(400, 'Invalid coach ID');
    }

    const coach = await CoachProfile.findById(coachId);
    if (!coach) {
      throw new AppError(404, 'Coach not found');
    }

    const affiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
    });

    if (payload.role || payload.title) {
      const newRole = payload.role || payload.title;
      if (affiliation) {
        affiliation.role = newRole;
        await affiliation.save();
      }
      coach.title = newRole;
      coach.academyRole = newRole;
      await coach.save();
    }

    if (payload.status && affiliation) {
      affiliation.status = payload.status;
      await affiliation.save();
    }

    // Team Assignment / Reassignment
    if (payload.teamId !== undefined) {
      await Team.updateMany(
        { academyId: academy._id, coachIds: coach._id },
        { $pull: { coachIds: coach._id } },
      );

      if (payload.teamId && Types.ObjectId.isValid(payload.teamId)) {
        await Team.findByIdAndUpdate(payload.teamId, {
          $addToSet: { coachIds: coach._id },
        });
      }
    }

    return await this.getAcademyCoachById(academyIdentifier, coachId);
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
    if (!Types.ObjectId.isValid(affiliationId)) {
      throw new AppError(400, 'Invalid affiliation ID');
    }
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

    if (
      action === 'APPROVE' &&
      coach.isVerifiedByAcademy &&
      coach.academyId &&
      coach.academyId.toString() !== academy._id.toString()
    ) {
      throw new AppError(
        409,
        'This coach is already an approved coach of another academy and must leave it first',
      );
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
      await coachCacheService.invalidateCoachCache(coach._id, coach.userId);

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

  /**
   * Remove (release) a coach from an academy.
   * `identifier` = AcademyCoach affiliation _id OR CoachProfile _id.
   * History (submitted evaluations, validated CVs, commissions) is kept; open work is handed back.
   */
  async removeCoachAffiliation(user: any, identifier: string, academyIdParam?: string) {
    if (!identifier || !Types.ObjectId.isValid(identifier)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid affiliation or coach ID');
    }

    // ACADEMY → own academy; SUPER_ADMIN/ADMIN → must name the academy (?academyId=)
    let academy: any = null;
    if (user?.role === 'ACADEMY') {
      academy = await AcademyProfile.findOne({ userId: user.userId });
    } else {
      if (!academyIdParam || !Types.ObjectId.isValid(academyIdParam)) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'A valid academyId query parameter is required',
        );
      }
      academy = await AcademyProfile.findById(academyIdParam);
    }
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found');
    }

    const affiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      $or: [{ _id: identifier }, { coachId: identifier }],
    });
    const coachId = affiliation?.coachId || new Types.ObjectId(identifier);
    const coach = await CoachProfile.findById(coachId);

    const linkedByProfile = !!coach && coach.academyId?.toString() === academy._id.toString();
    const activeAffiliation =
      !!affiliation && ['APPROVED', 'PENDING'].includes(String(affiliation.status));
    if (!activeAffiliation && !linkedByProfile) {
      throw new AppError(
        affiliation ? StatusCodes.CONFLICT : StatusCodes.NOT_FOUND,
        affiliation
          ? `This coach is already ${String(affiliation.status).toLowerCase()} for this academy`
          : 'This coach is not part of this academy',
      );
    }

    // A pending invitation/request is simply withdrawn: the coach keeps their teams and profile
    if (affiliation && affiliation.status === 'PENDING') {
      affiliation.status = 'REMOVED';
      affiliation.responseNote = 'Withdrawn by academy';
      await affiliation.save();
      if (coach?.userId) {
        await notificationService.createNotification({
          recipientId: coach.userId,
          recipientRole: 'COACH',
          title: 'Academy Invitation Withdrawn',
          message: `${academy.name} has withdrawn the pending affiliation.`,
          type: 'ACADEMY_INVITATION_WITHDRAWN',
          data: { affiliationId: affiliation._id, academyId: academy._id },
        });
      }
      return {
        message: 'Pending invitation withdrawn',
        data: {
          affiliationId: affiliation._id,
          coachId,
          coachName: coach?.fullName || '',
          academyId: academy._id,
          status: 'REMOVED',
          removedFromTeams: [],
          cancelledEvaluationRequests: 0,
          cvValidationRequestsReleased: { paid: 0, unpaid: 0 },
        },
      };
    }

    // 1. Affiliation → REMOVED (kept for history; coach can request to join again later)
    if (affiliation) {
      affiliation.status = 'REMOVED';
      await affiliation.save();
    }

    // 2. Teams: pull the coach and recompute counts (Total Roster / Coaching Staff)
    const teams = await Team.find({ academyId: academy._id, coachIds: coachId });
    for (const team of teams) {
      team.coachIds = (team.coachIds || []).filter(
        (id: any) => id.toString() !== coachId.toString(),
      );
      team.coachesCount = team.coachIds.length;
      team.totalMembers = (team.coachesCount || 0) + (team.playersCount || 0);
      await team.save();
    }
    const academyTeamIds = (await Team.find({ academyId: academy._id }).select('_id').lean()).map(
      (t: any) => t._id,
    );

    // 3. Open evaluation requests for this coach (never submitted) → cancelled, academy re-assigns
    const openEvaluations = await PlayerEvaluation.find({
      academyId: academy._id,
      coachId,
      status: 'NEED_EVALUATION',
    })
      .populate('playerId', 'fullName')
      .lean();
    if (openEvaluations.length) {
      await PlayerEvaluation.deleteMany({ _id: { $in: openEvaluations.map((e: any) => e._id) } });
    }

    // 4. CV validation requests addressed to this coach and not yet validated → coach cleared.
    //    PAID requests keep their payment: the player picks another coach without paying again.
    let releasedCvRequests: any[] = [];
    if (coach?.userId) {
      releasedCvRequests = await PlayerProfile.find({
        'coachVerification.coachId': coach.userId,
        'coachVerification.validationPaymentStatus': { $in: ['UNPAID', 'PAID'] },
      })
        .select('_id userId fullName coachVerification.validationPaymentStatus')
        .lean();
      if (releasedCvRequests.length) {
        await PlayerProfile.updateMany(
          { _id: { $in: releasedCvRequests.map((p: any) => p._id) } },
          { $unset: { 'coachVerification.coachId': '' } },
        );
      }
    }

    // 5. Coach profile → independent
    if (coach && linkedByProfile) {
      coach.isVerifiedByAcademy = false;
      coach.academyId = undefined;
      coach.coachType = 'INDIVIDUAL_COACH';
      coach.teamIds = (coach.teamIds || []).filter(
        (id: any) => !academyTeamIds.some((t: any) => t.toString() === id.toString()),
      ) as any;
      if (Array.isArray(coach.clubHistory)) {
        const year = new Date().getFullYear();
        coach.clubHistory.forEach((c: any) => {
          if (c.clubName?.toLowerCase() === academy.name?.toLowerCase() && c.isCurrent) {
            c.isCurrent = false;
            c.endYear = year;
            c.period = `${c.startYear || year} - ${year}`;
          }
        });
      }
      await coach.save();
    } else if (coach) {
      // not linked by profile (e.g. pending request) – still drop this academy's teams
      await CoachProfile.updateOne(
        { _id: coach._id },
        { $pull: { teamIds: { $in: academyTeamIds } } },
      );
    }

    // 6. Caches
    await coachCacheService.invalidateCoachCache(coachId, coach?.userId);
    for (const p of releasedCvRequests) {
      await playerCacheService.invalidatePlayerCache(p._id, p.userId);
    }

    // 7. Notifications
    if (coach?.userId) {
      await notificationService.createNotification({
        recipientId: coach.userId,
        recipientRole: 'COACH',
        title: 'Academy Affiliation Revoked',
        message: `Your affiliation with ${academy.name} has been revoked. Profile reverted to Individual Coach.`,
        type: 'ACADEMY_AFFILIATION_REMOVED',
        data: { academyId: academy._id },
      });
    }
    for (const p of releasedCvRequests) {
      if (!p.userId || p.coachVerification?.validationPaymentStatus !== 'PAID') continue;
      await notificationService.createNotification({
        recipientId: p.userId,
        recipientRole: 'PLAYER',
        title: 'Choose a new coach for your CV validation',
        message: `${coach?.fullName || 'Your selected coach'} is no longer with ${academy.name}. Your payment is kept — please choose another academy coach to validate your CV (no extra charge).`,
        type: 'CV_VALIDATION_REQUEST',
        data: { playerId: p._id, needsCoachReassignment: true },
      });
    }
    if (openEvaluations.length && academy.userId) {
      const names = openEvaluations
        .map((e: any) => e.playerId?.fullName)
        .filter(Boolean)
        .join(', ');
      await notificationService.createNotification({
        recipientId: academy.userId,
        recipientRole: 'ACADEMY',
        title: 'Evaluation requests need a new coach',
        message: `${openEvaluations.length} open evaluation request(s)${names ? ` (${names})` : ''} assigned to ${coach?.fullName || 'the removed coach'} were cancelled. Please request them again with another coach.`,
        type: 'EVALUATION_REQUEST',
        data: { academyId: academy._id },
      });
    }

    return {
      message: 'Coach removed from academy successfully',
      data: {
        affiliationId: affiliation?._id || null,
        coachId,
        coachName: coach?.fullName || '',
        academyId: academy._id,
        status: 'REMOVED',
        removedFromTeams: teams.map((t: any) => ({
          _id: t._id,
          teamName: t.teamName,
          coachesCount: t.coachesCount,
          totalMembers: t.totalMembers,
        })),
        cancelledEvaluationRequests: openEvaluations.length,
        cvValidationRequestsReleased: {
          paid: releasedCvRequests.filter(
            (p: any) => p.coachVerification?.validationPaymentStatus === 'PAID',
          ).length,
          unpaid: releasedCvRequests.filter(
            (p: any) => p.coachVerification?.validationPaymentStatus === 'UNPAID',
          ).length,
        },
      },
    };
  }
}

export const academyCoachesService = new AcademyCoachesService();
