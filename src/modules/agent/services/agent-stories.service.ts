import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { SuccessStory } from '../agent.model';
import { UserModel } from '@/modules/user/user.model';
import { Notification } from '@/modules/notification/notification.model';

export class AgentStoriesService {
  async createSuccessStory(creatorId: string, payload: any, creatorRole: string = 'AGENT') {
    const storyTitle = payload.storyTitle || payload.title;
    const category = payload.category;
    if (!storyTitle) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Story title is required');
    }
    if (!category) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Category is required');
    }

    const img = payload.image || payload.photo || payload.coverImage || '';
    const isSuperAdmin = creatorRole === 'SUPER_ADMIN';
    const initialStatus = isSuperAdmin ? 'APPROVED' : 'PENDING';

    const story = await SuccessStory.create({
      creatorId,
      creatorRole,
      storyTitle,
      category,
      playerName: payload.playerName || '',
      position: payload.position || '',
      previousAcademy: payload.previousAcademy || '',
      date: payload.date ? new Date(payload.date) : new Date(),
      signedClub: payload.signedClub || payload.achievement || '',
      image: img,
      photo: img,
      storyContent: payload.storyContent || payload.content || '',
      status: initialStatus,
      adminReviewNotes: '',
      isDeleted: false,
    });

    // Notify admins of new success story submitted for review
    if (!isSuperAdmin) {
      const creatorUser = await UserModel.findById(creatorId).select('name email agencyName');
      const creatorName = creatorUser?.agencyName || creatorUser?.name || 'An Agent';
      const admins = await UserModel.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } }).select(
        '_id role',
      );
      for (const admin of admins) {
        await Notification.create({
          recipientId: admin._id,
          recipientRole: admin.role,
          title: 'New Agent Success Story Submitted for Approval',
          message: `${creatorName} has submitted a new success story "${storyTitle}" for review and approval.`,
          type: 'STORY',
          data: { creatorId, storyId: story._id },
        });
      }
    }

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      playerName: story.playerName,
      position: story.position,
      previousAcademy: story.previousAcademy,
      signedClub: story.signedClub,
      date: story.date,
      formattedDate: story.formattedDate,
      image: story.image,
      storyContent: story.storyContent,
      status: story.status,
      statusLabel:
        story.status === 'APPROVED'
          ? 'Approved'
          : story.status === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      createdAt: story.createdAt,
    };
  }

  async getSuccessStories(query: any = {}, callerUser?: any) {
    const filter: any = { isDeleted: false };

    // If caller is an agent or coach, default to showing their own stories (so they see Approved, Pending, Rejected in their dashboard)
    if (callerUser && ['AGENT', 'COACH'].includes(callerUser.role)) {
      filter.creatorId = callerUser.userId || callerUser.id;
    } else if (callerUser && ['SUPER_ADMIN', 'ADMIN'].includes(callerUser.role)) {
      if (query.creatorId) {
        filter.creatorId = query.creatorId;
      }
    } else {
      // Public / guest callers only see APPROVED stories
      filter.status = 'APPROVED';
    }

    if (query.status && query.status !== 'ALL') {
      filter.status = String(query.status).toUpperCase();
    }

    if (query.category && query.category !== 'ALL') {
      filter.category = new RegExp(String(query.category).trim(), 'i');
    }

    if (query.searchTerm) {
      const searchRegex = new RegExp(String(query.searchTerm).trim(), 'i');
      filter.$or = [
        { storyTitle: searchRegex },
        { playerName: searchRegex },
        { signedClub: searchRegex },
        { category: searchRegex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));

    const total = await SuccessStory.countDocuments(filter);
    const stories = await SuccessStory.find(filter)
      .populate('creatorId', 'name email avatar agencyName')
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data: stories.map((s) => ({
        _id: s._id,
        storyTitle: s.storyTitle,
        category: s.category,
        playerName: s.playerName || '',
        position: s.position || '',
        previousAcademy: s.previousAcademy || '',
        signedClub: s.signedClub || '',
        date: s.date,
        formattedDate:
          s.formattedDate || (s.date ? new Date(s.date).toISOString().split('T')[0] : ''),
        image: s.image || '',
        storyContent: s.storyContent || '',
        status: s.status,
        statusLabel:
          s.status === 'APPROVED' ? 'Approved' : s.status === 'REJECTED' ? 'Rejected' : 'Pending',
        adminReviewNotes: s.adminReviewNotes || '',
        creatorId: s.creatorId,
        createdAt: s.createdAt,
      })),
    };
  }

  async getSuccessStoryById(storyId: string, callerUser?: any) {
    const filter: any = { _id: storyId, isDeleted: false };
    if (callerUser && ['AGENT', 'COACH'].includes(callerUser.role)) {
      filter.creatorId = callerUser.userId || callerUser.id;
    }
    const story = await SuccessStory.findOne(filter).populate(
      'creatorId',
      'name email avatar agencyName',
    );
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      playerName: story.playerName || '',
      position: story.position || '',
      previousAcademy: story.previousAcademy || '',
      signedClub: story.signedClub || '',
      date: story.date,
      formattedDate:
        story.formattedDate || (story.date ? new Date(story.date).toISOString().split('T')[0] : ''),
      image: story.image || '',
      storyContent: story.storyContent || '',
      status: story.status,
      statusLabel:
        story.status === 'APPROVED'
          ? 'Approved'
          : story.status === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      adminReviewNotes: story.adminReviewNotes || '',
      creator: story.creatorId,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
    };
  }

  async updateSuccessStory(
    userId: string,
    storyId: string,
    payload: any,
    userRole: string = 'AGENT',
  ) {
    const filter: any = { _id: storyId, isDeleted: false };
    if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      filter.creatorId = userId;
    }

    const story = await SuccessStory.findOne(filter);
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    if (payload.storyTitle || payload.title) story.storyTitle = payload.storyTitle || payload.title;
    if (payload.category) story.category = payload.category;
    if (payload.playerName !== undefined) story.playerName = payload.playerName;
    if (payload.position !== undefined) story.position = payload.position;
    if (payload.previousAcademy !== undefined) story.previousAcademy = payload.previousAcademy;
    if (payload.signedClub !== undefined || payload.achievement !== undefined) {
      story.signedClub = payload.signedClub ?? payload.achievement;
    }
    if (payload.date) story.date = new Date(payload.date);
    if (payload.image || payload.photo || payload.coverImage) {
      story.image = payload.image || payload.photo || payload.coverImage;
    }
    if (payload.storyContent !== undefined || payload.content !== undefined) {
      story.storyContent = payload.storyContent ?? payload.content;
    }

    // Editing re-submits for approval if updated by agent/coach
    if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      story.status = 'PENDING';
    }
    await story.save();

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      playerName: story.playerName,
      position: story.position,
      previousAcademy: story.previousAcademy,
      signedClub: story.signedClub,
      date: story.date,
      formattedDate: story.formattedDate,
      image: story.image,
      storyContent: story.storyContent,
      status: story.status,
      statusLabel:
        story.status === 'APPROVED'
          ? 'Approved'
          : story.status === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      adminReviewNotes: story.adminReviewNotes,
      createdAt: story.createdAt,
    };
  }

  async deleteSuccessStory(userId: string, storyId: string, userRole: string = 'AGENT') {
    const filter: any = { _id: storyId, isDeleted: false };
    if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      filter.creatorId = userId;
    }

    const story = await SuccessStory.findOne(filter);
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    story.isDeleted = true;
    story.deletedAt = new Date();
    await story.save();

    return { message: 'Success story deleted successfully' };
  }

  async reviewSuccessStory(
    storyId: string,
    status: 'APPROVED' | 'REJECTED',
    adminReviewNotes?: string,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Status must be APPROVED or REJECTED');
    }

    const story = await SuccessStory.findByIdAndUpdate(
      storyId,
      { status, adminReviewNotes: adminReviewNotes || '' },
      { new: true },
    );
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    if (story.creatorId) {
      await Notification.create({
        recipientId: story.creatorId,
        recipientRole: story.creatorRole || 'AGENT',
        title: status === 'APPROVED' ? 'Success Story Approved!' : 'Success Story Review Update',
        message:
          status === 'APPROVED'
            ? `Your success story "${story.storyTitle}" has been approved and is now live!`
            : `Your success story "${story.storyTitle}" was rejected.${adminReviewNotes ? ` Reason: ${adminReviewNotes}` : ''}`,
        type: 'STORY',
        data: { storyId: story._id, status },
      });
    }

    return story;
  }
}

export const agentStoriesService = new AgentStoriesService();
