/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { AcademyProfile, AcademySuccessStory } from '@/modules/academy/academy.model';
import { SuccessStory } from '@/modules/agent/agent.model';
import { ClubSuccessStory } from '@/modules/club/club.model';
import { Notification } from '@/modules/notification/notification.model';
import { userVerificationService } from '@/modules/user/services/user-verification.service';
import { agentStoriesService } from '@/modules/agent/services/agent-stories.service';
import { clubStoriesService } from '@/modules/club/services/club-stories.service';
import { IAdminListQuery, isIgnoredFilter, formatDateYMD } from './admin.utils';

export class AdminApprovalsService {
  // =========================================================================
  // 1. REGISTRATION APPROVALS (Agents & Clubs ONLY)
  // =========================================================================

  async getApprovals(query: IAdminListQuery) {
    const roleFilter = query.role || query.category;
    const statusFilter = query.status || query.verificationStatus || 'ALL';

    const allItems = await userVerificationService.getPendingVerifications(roleFilter, {
      status: statusFilter,
      search: query.search || query.searchTerm,
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = allItems.length;
    const paginated = allItems.slice((page - 1) * limit, page * limit);

    return {
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        counts: {
          pending: allItems.filter((i) => i.status === 'PENDING').length,
          approved: allItems.filter((i) => i.status === 'APPROVED').length,
          rejected: allItems.filter((i) => i.status === 'REJECTED').length,
        },
      },
      data: paginated,
    };
  }

  async getApprovalDetailsById(id: string) {
    return await userVerificationService.getVerificationDetailsById(id);
  }

  async decideApproval(
    id: string,
    payload: {
      status?: 'APPROVED' | 'REJECTED';
      action?: 'APPROVE' | 'REJECT';
      reviewNotes?: string;
      rejectionReason?: string;
      adminReviewNotes?: string;
    },
  ) {
    return await userVerificationService.decideVerification(id, {
      status: payload.status,
      action: payload.action,
      reviewNotes: payload.reviewNotes ?? payload.rejectionReason ?? payload.adminReviewNotes,
    });
  }

  // =========================================================================
  // 2. UNIFIED SUCCESS STORIES (Academies, Agents, Clubs)
  // =========================================================================

  async getSuccessStories(query: IAdminListQuery) {
    const rawRole = String(query.role || query.category || 'ALL')
      .trim()
      .toUpperCase();
    const normalizedRole =
      rawRole === 'ACADEMIES' || rawRole === 'ACADEMY'
        ? 'ACADEMY'
        : rawRole === 'AGENTS' || rawRole === 'AGENT'
          ? 'AGENT'
          : rawRole === 'CLUBS' || rawRole === 'CLUB'
            ? 'CLUB'
            : 'ALL';

    const statusParam =
      query.status && !isIgnoredFilter(query.status)
        ? String(query.status).trim().toUpperCase()
        : '';

    const baseFilter: Record<string, any> = { isDeleted: false };
    if (statusParam) {
      baseFilter.status = statusParam;
    }

    const [academyStories, agentStories, clubStories] = await Promise.all([
      normalizedRole === 'ALL' || normalizedRole === 'ACADEMY'
        ? AcademySuccessStory.find(baseFilter)
            .populate('academyId', 'name logo country city userId')
            .sort({ date: -1, createdAt: -1 })
            .lean()
        : Promise.resolve([]),
      normalizedRole === 'ALL' || normalizedRole === 'AGENT'
        ? SuccessStory.find(baseFilter)
            .populate('creatorId', 'name email avatar agencyName role')
            .sort({ date: -1, createdAt: -1 })
            .lean()
        : Promise.resolve([]),
      normalizedRole === 'ALL' || normalizedRole === 'CLUB'
        ? ClubSuccessStory.find(baseFilter)
            .populate('clubId', 'name logo country league userId')
            .sort({ date: -1, createdAt: -1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const unified: any[] = [];

    for (const s of academyStories as any[]) {
      const ac = s.academyId as any;
      const d = s.date || s.createdAt;
      const dateStr = formatDateYMD(d);
      const img = s.photo || ac?.logo || '';

      unified.push({
        _id: s._id,
        storyId: s._id,
        storyTitle: s.storyTitle,
        image: img,
        photo: img,
        coverImage: img,
        role: 'ACADEMY',
        roleLabel: 'Academies',
        authorName: ac?.name || s.currentAcademy || '',
        authorId: ac?._id || null,
        category: s.category || '',
        playerName: s.playerName || '',
        position: s.position || '',
        storyContent: s.storyContent || '',
        date: dateStr,
        status: (s.status || 'PENDING').toUpperCase(),
        reviewNotes: s.rejectionReason || '',
        createdAt: s.createdAt,
      });
    }

    for (const s of agentStories as any[]) {
      const creator = s.creatorId as any;
      const d = s.date || s.createdAt;
      const dateStr = formatDateYMD(d);
      const img = s.image || creator?.avatar || '';

      unified.push({
        _id: s._id,
        storyId: s._id,
        storyTitle: s.storyTitle,
        image: img,
        photo: img,
        coverImage: img,
        role: 'AGENT',
        roleLabel: 'Agents',
        authorName: creator?.agencyName || creator?.name || '',
        authorId: creator?._id || null,
        category: s.category || '',
        playerName: s.playerName || '',
        position: s.position || '',
        signedClub: s.signedClub || '',
        previousAcademy: s.previousAcademy || '',
        storyContent: s.storyContent || '',
        date: dateStr,
        status: (s.status || 'PENDING').toUpperCase(),
        reviewNotes: s.adminReviewNotes || '',
        createdAt: s.createdAt,
      });
    }

    for (const s of clubStories as any[]) {
      const cl = s.clubId as any;
      const d = s.date || s.createdAt;
      const dateStr = formatDateYMD(d);
      const img = s.coverImage || cl?.logo || '';

      unified.push({
        _id: s._id,
        storyId: s._id,
        storyTitle: s.storyTitle,
        image: img,
        photo: img,
        coverImage: img,
        role: 'CLUB',
        roleLabel: 'Clubs',
        authorName: cl?.name || '',
        authorId: cl?._id || null,
        category: s.category || '',
        playerName: '',
        position: '',
        storyContent: '',
        date: dateStr,
        status: (s.status || 'PENDING').toUpperCase(),
        reviewNotes: s.adminReviewNotes || '',
        createdAt: s.createdAt,
      });
    }

    unified.sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();
    const filtered = search
      ? unified.filter((item) =>
          [
            item.storyTitle,
            item.roleLabel,
            item.authorName,
            item.category,
            item.playerName,
            item.status,
            item.date,
          ]
            .join(' ')
            .toLowerCase()
            .includes(search),
        )
      : unified;

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        counts: {
          pending: unified.filter((i) => i.status === 'PENDING').length,
          approved: unified.filter((i) => i.status === 'APPROVED').length,
          rejected: unified.filter((i) => i.status === 'REJECTED').length,
        },
      },
      data: paginated,
    };
  }

  async getSuccessStoryById(storyId: string) {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid story ID format');
    }

    const [acStory, agStory, clStory] = await Promise.all([
      AcademySuccessStory.findOne({ _id: storyId, isDeleted: false })
        .populate('academyId', 'name logo country city contactEmail contactPhone userId')
        .lean(),
      SuccessStory.findOne({ _id: storyId, isDeleted: false })
        .populate('creatorId', 'name email avatar agencyName phone country role')
        .lean(),
      ClubSuccessStory.findOne({ _id: storyId, isDeleted: false })
        .populate('clubId', 'name logo country league contactEmail contactPhone userId')
        .lean(),
    ]);

    if (acStory) {
      const s: any = acStory;
      const ac: any = s.academyId;
      const img = s.photo || ac?.logo || '';
      return {
        _id: s._id,
        storyId: s._id,
        storyTitle: s.storyTitle,
        image: img,
        photo: img,
        coverImage: img,
        role: 'ACADEMY',
        roleLabel: 'Academies',
        author: ac || null,
        authorName: ac?.name || s.currentAcademy || 'Academy',
        category: s.category || '',
        playerName: s.playerName || '',
        position: s.position || '',
        currentAcademy: s.currentAcademy || ac?.name || '',
        storyContent: s.storyContent || '',
        date: formatDateYMD(s.date),
        status: s.status,
        reviewNotes: s.rejectionReason || '',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    }

    if (agStory) {
      const s: any = agStory;
      const creator: any = s.creatorId;
      const img = s.image || creator?.avatar || '';
      return {
        _id: s._id,
        storyId: s._id,
        storyTitle: s.storyTitle,
        image: img,
        photo: img,
        coverImage: img,
        role: 'AGENT',
        roleLabel: 'Agents',
        author: creator || null,
        authorName: creator?.agencyName || creator?.name || 'Agent',
        category: s.category || '',
        playerName: s.playerName || '',
        position: s.position || '',
        previousAcademy: s.previousAcademy || '',
        signedClub: s.signedClub || '',
        storyContent: s.storyContent || '',
        date: formatDateYMD(s.date),
        status: s.status,
        reviewNotes: s.adminReviewNotes || '',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    }

    if (clStory) {
      const s: any = clStory;
      const cl: any = s.clubId;
      const img = s.coverImage || cl?.logo || '';
      return {
        _id: s._id,
        storyId: s._id,
        storyTitle: s.storyTitle,
        image: img,
        photo: img,
        coverImage: img,
        role: 'CLUB',
        roleLabel: 'Clubs',
        author: cl || null,
        authorName: cl?.name || 'Club',
        category: s.category || '',
        date: formatDateYMD(s.date),
        status: s.status,
        reviewNotes: s.adminReviewNotes || '',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    }

    throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
  }

  async decideSuccessStory(
    storyId: string,
    payload: {
      status?: 'APPROVED' | 'REJECTED';
      action?: 'APPROVE' | 'REJECT';
      reviewNotes?: string;
      rejectionReason?: string;
      adminReviewNotes?: string;
    },
  ) {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid story ID format');
    }

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
    const notes = payload.reviewNotes ?? payload.rejectionReason ?? payload.adminReviewNotes ?? '';

    const [acStory, agStory, clStory] = await Promise.all([
      AcademySuccessStory.findOne({ _id: storyId, isDeleted: false }),
      SuccessStory.findOne({ _id: storyId, isDeleted: false }).select('_id').lean(),
      ClubSuccessStory.findOne({ _id: storyId, isDeleted: false }).select('_id').lean(),
    ]);

    if (agStory) {
      const updated = await agentStoriesService.reviewSuccessStory(storyId, decisionStatus, notes);
      return {
        _id: updated._id,
        storyId: updated._id,
        storyTitle: updated.storyTitle,
        role: 'AGENT',
        roleLabel: 'Agents',
        status: updated.status,
        reviewNotes: updated.adminReviewNotes || '',
        message: `Agent success story "${updated.storyTitle}" has been ${decisionStatus.toLowerCase()}`,
      };
    }

    if (clStory) {
      const updated = await clubStoriesService.reviewClubSuccessStory(
        storyId,
        decisionStatus,
        notes,
      );
      return {
        _id: updated._id,
        storyId: updated._id,
        storyTitle: updated.storyTitle,
        role: 'CLUB',
        roleLabel: 'Clubs',
        status: updated.status,
        reviewNotes: updated.adminReviewNotes || '',
        message: `Club success story "${updated.storyTitle}" has been ${decisionStatus.toLowerCase()}`,
      };
    }

    if (acStory) {
      acStory.status = decisionStatus;
      acStory.rejectionReason = notes;
      await acStory.save();

      const academy = await AcademyProfile.findById(acStory.academyId).select('userId name').lean();
      if (academy?.userId) {
        await Notification.create({
          recipientId: academy.userId,
          recipientRole: 'ACADEMY',
          title:
            decisionStatus === 'APPROVED'
              ? 'Success Story Approved!'
              : 'Success Story Review Update',
          message:
            decisionStatus === 'APPROVED'
              ? `Your academy success story "${acStory.storyTitle}" has been approved and is now live!`
              : `Your academy success story "${acStory.storyTitle}" was rejected.${notes ? ` Reason: ${notes}` : ''}`,
          type: 'STORY',
          data: { storyId: acStory._id, status: decisionStatus },
        }).catch(() => null);
      }

      return {
        _id: acStory._id,
        storyId: acStory._id,
        storyTitle: acStory.storyTitle,
        role: 'ACADEMY',
        roleLabel: 'Academies',
        status: acStory.status,
        reviewNotes: acStory.rejectionReason || '',
        message: `Academy success story "${acStory.storyTitle}" has been ${decisionStatus.toLowerCase()}`,
      };
    }

    throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
  }
}

export const adminApprovalsService = new AdminApprovalsService();
